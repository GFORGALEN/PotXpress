import crypto from 'node:crypto';
import pg from 'pg';
import { WebSocket, WebSocketServer } from 'ws';
import { config } from '../config.js';
import { connectionOptions, REALTIME_CHANNEL } from '../storage/database.js';
import { databaseStore } from '../storage/databaseStore.js';
import { INSTANCE_ID } from '../utils/instance.js';
import { authorizeRealtimeSubscription } from './socketAuth.js';
import { readStoreRealtimeVersion } from './realtimeVersion.service.js';

const PROTOCOL = 'potxpress.v1';
const AUTH_TIMEOUT_MILLISECONDS = 5000;
const HEARTBEAT_INTERVAL_MILLISECONDS = 30000;
const AUTH_RECHECK_INTERVAL_MILLISECONDS = 60000;
const MAX_MESSAGE_BYTES = 16 * 1024;
const MAX_BUFFERED_BYTES = 1024 * 1024;

function sendJson(socket, value) {
  if (socket.readyState !== WebSocket.OPEN) {
    return false;
  }
  if (socket.bufferedAmount > MAX_BUFFERED_BYTES) {
    socket.close(4409, 'SLOW_CONSUMER');
    return false;
  }

  socket.send(JSON.stringify(value));
  return true;
}

export function closeCodeForRealtimeError(error) {
  if (error?.status === 401) {
    return 4401;
  }
  if (error?.status >= 400 && error?.status < 500) {
    return 4403;
  }
  return 1011;
}

function closeWithError(socket, error) {
  const closeCode = closeCodeForRealtimeError(error);
  const internalFailure = closeCode === 1011;

  if (internalFailure) {
    console.error('实时连接服务器错误：', error);
  }

  sendJson(socket, {
    type: 'error',
    error: {
      code: internalFailure ? 'REALTIME_UNAVAILABLE' : (error.code ?? 'REALTIME_ERROR'),
      message: internalFailure
        ? '实时服务暂时不可用，正在重连'
        : (error.message ?? '实时连接失败'),
    },
  });
  socket.close(
    closeCode,
    internalFailure ? 'REALTIME_UNAVAILABLE' : (error.code ?? 'REALTIME_ERROR'),
  );
}

function originAllowed(request) {
  const origin = request.headers.origin;
  if (!origin) {
    return true;
  }
  if (config.corsOrigins.includes(origin)) {
    return true;
  }
  if (
    !config.isProduction
    && /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)
  ) {
    return true;
  }

  try {
    return new URL(origin).host === request.headers.host;
  } catch (error) {
    return false;
  }
}

const LISTEN_RECONNECT_MIN_MILLISECONDS = 1000;
const LISTEN_RECONNECT_MAX_MILLISECONDS = 30000;

/**
 * 跨实例事件分发：事件写入数据库时在同一事务内 pg_notify（见 database.js），
 * 提交后每个实例都会收到通知，再推送给连接在本实例上的客户端。
 * 本实例产生的事件已经直接推送过，收到自己的通知时跳过。
 * LISTEN 断开期间漏掉的事件由客户端的版本缺口检测与安全轮询补齐。
 */
class CrossInstanceListener {
  constructor(onEvent) {
    this.onEvent = onEvent;
    this.client = null;
    this.listening = false;
    this.stopped = true;
    this.reconnectDelay = LISTEN_RECONNECT_MIN_MILLISECONDS;
    this.reconnectTimer = null;
  }

  start() {
    this.stopped = false;
    this.connect();
  }

  async connect() {
    if (this.stopped) return;
    const client = new pg.Client(
      config.realtimeListenUrl
        ? { ...connectionOptions(), connectionString: config.realtimeListenUrl }
        : connectionOptions(),
    );
    this.client = client;
    client.on('notification', (message) => {
      if (message.channel === REALTIME_CHANNEL) this.handle(message.payload);
    });
    client.on('error', (error) => {
      console.error(`实时广播监听连接异常：${error.message}`);
      this.scheduleReconnect(client);
    });
    client.on('end', () => this.scheduleReconnect(client));

    try {
      await client.connect();
      await client.query(`LISTEN ${REALTIME_CHANNEL}`);
      this.listening = client === this.client;
      this.reconnectDelay = LISTEN_RECONNECT_MIN_MILLISECONDS;
    } catch (error) {
      if (this.stopped) return;
      console.error(`实时广播监听启动失败，将重试：${error.message}`);
      this.scheduleReconnect(client);
    }
  }

  scheduleReconnect(client) {
    if (this.stopped || client !== this.client || this.reconnectTimer) return;
    this.client = null;
    this.listening = false;
    client.end().catch(() => {});
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, this.reconnectDelay);
    this.reconnectTimer.unref?.();
    this.reconnectDelay = Math.min(
      this.reconnectDelay * 2,
      LISTEN_RECONNECT_MAX_MILLISECONDS,
    );
  }

  handle(payload) {
    let notification;
    try {
      notification = JSON.parse(payload);
    } catch (error) {
      return;
    }
    if (notification.instanceId === INSTANCE_ID) return;
    this.onEvent(notification).catch((error) => {
      console.error(`跨实例实时事件分发失败：${error.message}`);
    });
  }

  async stop() {
    this.stopped = true;
    this.listening = false;
    clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
    const client = this.client;
    this.client = null;
    await client?.end().catch(() => {});
  }
}

class RealtimeHub {
  constructor() {
    this.webSocketServer = null;
    this.rooms = new Map();
    this.serverInstanceId = null;
    this.heartbeatTimer = null;
    this.authorizationTimer = null;
    this.listener = new CrossInstanceListener(
      (notification) => this.deliverRemoteEvent(notification),
    );
  }

  async deliverRemoteEvent({ storeId, id }) {
    // 本实例没有该门店的订阅者时不读库。
    if (!this.rooms.get(storeId)?.size) return;
    const [event] = await databaseStore.readWhere('realtimeEvents.json', { id, storeId });
    if (event) this.publish(event);
  }

  attach(httpServer) {
    if (this.webSocketServer) {
      throw new Error('WebSocket 服务已经启动');
    }

    this.serverInstanceId = crypto.randomUUID();
    this.webSocketServer = new WebSocketServer({
      server: httpServer,
      path: '/ws',
      maxPayload: MAX_MESSAGE_BYTES,
      perMessageDeflate: false,
      handleProtocols: (protocols) => (
        protocols.has(PROTOCOL) ? PROTOCOL : false
      ),
      verifyClient: ({ req }) => originAllowed(req),
    });
    this.webSocketServer.on('connection', (socket) => {
      this.handleConnection(socket);
    });
    this.webSocketServer.on('error', (error) => {
      console.error(`WebSocket 服务错误：${error.message}`);
    });

    this.heartbeatTimer = setInterval(() => {
      for (const socket of this.webSocketServer?.clients ?? []) {
        if (!socket.isAlive) {
          socket.terminate();
          continue;
        }
        socket.isAlive = false;
        socket.ping();
      }
    }, HEARTBEAT_INTERVAL_MILLISECONDS);
    this.heartbeatTimer.unref?.();

    this.authorizationTimer = setInterval(() => {
      this.recheckAuthorizations();
    }, AUTH_RECHECK_INTERVAL_MILLISECONDS);
    this.authorizationTimer.unref?.();

    this.listener.start();
  }

  handleConnection(socket) {
    socket.isAlive = true;
    socket.subscription = null;
    socket.authenticating = false;
    // 协议违规（超过 maxPayload、非法帧）时 ws 已用 1009/1002 关闭连接，并在这里
    // 触发 error；没有监听器时 Node 会直接退出进程，未鉴权的客户端就能让服务宕机。
    socket.on('error', (error) => {
      console.warn(`WebSocket 连接因协议错误关闭：${error.message}`);
    });
    socket.on('pong', () => {
      socket.isAlive = true;
    });

    const authTimeout = setTimeout(() => {
      if (!socket.subscription) {
        socket.close(4408, 'AUTH_TIMEOUT');
      }
    }, AUTH_TIMEOUT_MILLISECONDS);
    authTimeout.unref?.();

    socket.on('message', async (raw, isBinary) => {
      if (isBinary) {
        socket.close(4400, 'BINARY_NOT_SUPPORTED');
        return;
      }

      let message;
      try {
        message = JSON.parse(raw.toString());
      } catch (error) {
        socket.close(4400, 'INVALID_JSON');
        return;
      }

      if (!socket.subscription) {
        if (message?.type !== 'authenticate' || socket.authenticating) {
          socket.close(4401, 'AUTH_REQUIRED');
          return;
        }
        socket.authenticating = true;

        try {
          const authorization = await authorizeRealtimeSubscription({
            token: message.token,
            storeId: message.storeId,
          });
          const currentVersion = await readStoreRealtimeVersion(
            message.storeId,
          );
          socket.subscription = {
            token: message.token,
            storeId: message.storeId,
            clientId: typeof message.clientId === 'string'
              ? message.clientId.slice(0, 100)
              : null,
            user: authorization.user,
          };
          this.joinRoom(message.storeId, socket);
          clearTimeout(authTimeout);
          sendJson(socket, {
            type: 'ready',
            protocol: PROTOCOL,
            serverInstanceId: this.serverInstanceId,
            storeId: message.storeId,
            currentVersion,
          });
        } catch (error) {
          clearTimeout(authTimeout);
          closeWithError(socket, error);
        } finally {
          socket.authenticating = false;
        }
        return;
      }

      if (message?.type === 'ping') {
        sendJson(socket, {
          type: 'pong',
          serverTime: new Date().toISOString(),
        });
        return;
      }

      socket.close(4400, 'UNKNOWN_MESSAGE');
    });

    socket.on('close', () => {
      clearTimeout(authTimeout);
      this.leaveRoom(socket);
    });
  }

  joinRoom(storeId, socket) {
    const room = this.rooms.get(storeId) ?? new Set();
    room.add(socket);
    this.rooms.set(storeId, room);
  }

  leaveRoom(socket) {
    const storeId = socket.subscription?.storeId;
    if (!storeId) {
      return;
    }

    const room = this.rooms.get(storeId);
    room?.delete(socket);
    if (room?.size === 0) {
      this.rooms.delete(storeId);
    }
    socket.subscription = null;
  }

  publish(event) {
    const room = this.rooms.get(event.storeId);
    if (!room?.size) {
      return 0;
    }

    const message = {
      type: 'event',
      serverInstanceId: this.serverInstanceId,
      event,
    };
    let delivered = 0;

    for (const socket of room) {
      if (sendJson(socket, message)) {
        delivered += 1;
      }
    }
    return delivered;
  }

  async recheckAuthorizations() {
    const sockets = [...(this.webSocketServer?.clients ?? [])]
      .filter((socket) => socket.subscription);

    await Promise.all(sockets.map(async (socket) => {
      try {
        await authorizeRealtimeSubscription({
          token: socket.subscription.token,
          storeId: socket.subscription.storeId,
        });
      } catch (error) {
        closeWithError(socket, error);
      }
    }));
  }

  getRoomSize(storeId) {
    return this.rooms.get(storeId)?.size ?? 0;
  }

  async close() {
    clearInterval(this.heartbeatTimer);
    clearInterval(this.authorizationTimer);
    this.heartbeatTimer = null;
    this.authorizationTimer = null;
    await this.listener.stop();

    const server = this.webSocketServer;
    if (!server) {
      return;
    }

    for (const socket of server.clients) {
      socket.close(1012, 'SERVICE_RESTART');
    }

    const forceCloseTimer = setTimeout(() => {
      for (const socket of server.clients) {
        socket.terminate();
      }
    }, 1000);
    await new Promise((resolve) => {
      server.close(() => resolve());
    });
    clearTimeout(forceCloseTimer);
    this.rooms.clear();
    this.webSocketServer = null;
    this.serverInstanceId = null;
  }
}

export const realtimeHub = new RealtimeHub();
