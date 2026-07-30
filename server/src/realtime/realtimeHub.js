import crypto from 'node:crypto';
import { WebSocket, WebSocketServer } from 'ws';
import { config } from '../config.js';
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

function closeWithError(socket, error) {
  sendJson(socket, {
    type: 'error',
    error: {
      code: error.code ?? 'REALTIME_ERROR',
      message: error.message ?? '实时连接失败',
    },
  });
  const closeCode = error.status === 403 ? 4403 : 4401;
  socket.close(closeCode, error.code ?? 'REALTIME_ERROR');
}

function originAllowed(request) {
  const origin = request.headers.origin;
  if (!origin) {
    return true;
  }
  if (config.corsOrigins.includes(origin)) {
    return true;
  }

  try {
    return new URL(origin).host === request.headers.host;
  } catch (error) {
    return false;
  }
}

class RealtimeHub {
  constructor() {
    this.webSocketServer = null;
    this.rooms = new Map();
    this.serverInstanceId = null;
    this.heartbeatTimer = null;
    this.authorizationTimer = null;
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
  }

  handleConnection(socket) {
    socket.isAlive = true;
    socket.subscription = null;
    socket.authenticating = false;
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
