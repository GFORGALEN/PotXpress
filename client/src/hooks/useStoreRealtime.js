import { useEffect, useRef } from 'react';
import { UNAUTHORIZED_EVENT } from '../api/client.js';
import { useErrorContext } from '../contexts/ErrorContext.jsx';
import {
  buildWebSocketUrl,
  calculateReconnectDelay,
  classifyEventVersion,
  isRealtimeEnvelopeForStore,
  REALTIME_PROTOCOL,
} from '../realtime/realtimeProtocol.js';

const CLIENT_ID_STORAGE_KEY = 'potxpress_realtime_client_id';
const APPLICATION_PING_INTERVAL = 25000;

function getClientId() {
  const existing = sessionStorage.getItem(CLIENT_ID_STORAGE_KEY);
  if (existing) {
    return existing;
  }

  const next = globalThis.crypto?.randomUUID?.()
    ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  sessionStorage.setItem(CLIENT_ID_STORAGE_KEY, next);
  return next;
}

export function useStoreRealtime({
  storeId,
  token,
  snapshotVersion,
  onSnapshotRequired,
}) {
  const {
    connectionStatus,
    reset,
    setConnected,
    setDisconnected,
    setReconnecting,
  } = useErrorContext();
  const snapshotCallbackRef = useRef(onSnapshotRequired);
  const activeStoreRef = useRef(storeId);
  const highestSeenVersionRef = useRef(0);

  useEffect(() => {
    snapshotCallbackRef.current = onSnapshotRequired;
  }, [onSnapshotRequired]);

  useEffect(() => {
    if (
      activeStoreRef.current === storeId
      && Number.isSafeInteger(snapshotVersion)
    ) {
      highestSeenVersionRef.current = Math.max(
        highestSeenVersionRef.current,
        snapshotVersion,
      );
    }
  }, [snapshotVersion, storeId]);

  useEffect(() => {
    activeStoreRef.current = storeId;
    highestSeenVersionRef.current = Number.isSafeInteger(snapshotVersion)
      ? snapshotVersion
      : 0;

    if (!storeId || !token) {
      reset();
      return undefined;
    }
    if (typeof WebSocket === 'undefined') {
      setDisconnected();
      return () => reset();
    }

    let disposed = false;
    let socket = null;
    let reconnectTimer = null;
    let pingTimer = null;
    let reconnectAttempt = 0;

    const clearTimers = () => {
      clearTimeout(reconnectTimer);
      clearInterval(pingTimer);
      reconnectTimer = null;
      pingTimer = null;
    };

    const requestSnapshot = (reason, details = {}) => {
      snapshotCallbackRef.current?.({
        reason,
        storeId,
        ...details,
      });
    };

    const scheduleReconnect = () => {
      if (disposed || !navigator.onLine) {
        setDisconnected();
        return;
      }

      setReconnecting();
      const delay = calculateReconnectDelay(reconnectAttempt);
      reconnectAttempt += 1;
      clearTimeout(reconnectTimer);
      reconnectTimer = setTimeout(connect, delay);
    };

    const connect = () => {
      if (disposed || !navigator.onLine) {
        setDisconnected();
        return;
      }

      clearTimers();
      setReconnecting();
      let nextSocket;
      try {
        nextSocket = new WebSocket(
          buildWebSocketUrl(),
          REALTIME_PROTOCOL,
        );
      } catch (error) {
        scheduleReconnect();
        return;
      }
      socket = nextSocket;

      nextSocket.addEventListener('open', () => {
        if (disposed || socket !== nextSocket) {
          nextSocket.close(1000, 'STALE_CONNECTION');
          return;
        }

        nextSocket.send(JSON.stringify({
          type: 'authenticate',
          token,
          storeId,
          clientId: getClientId(),
          lastVersion: highestSeenVersionRef.current,
        }));
      });

      nextSocket.addEventListener('message', (messageEvent) => {
        if (disposed || socket !== nextSocket) {
          return;
        }

        let message;
        try {
          message = JSON.parse(messageEvent.data);
        } catch (error) {
          nextSocket.close(4400, 'INVALID_SERVER_MESSAGE');
          return;
        }

        if (message.type === 'ready' && message.storeId === storeId) {
          reconnectAttempt = 0;
          setConnected();
          highestSeenVersionRef.current = Math.max(
            highestSeenVersionRef.current,
            Number.isSafeInteger(message.currentVersion)
              ? message.currentVersion
              : 0,
          );
          requestSnapshot('connected', {
            serverInstanceId: message.serverInstanceId,
            currentVersion: message.currentVersion,
          });
          clearInterval(pingTimer);
          pingTimer = setInterval(() => {
            if (nextSocket.readyState === WebSocket.OPEN) {
              nextSocket.send(JSON.stringify({ type: 'ping' }));
            }
          }, APPLICATION_PING_INTERVAL);
          return;
        }

        if (message.type === 'pong') {
          setConnected();
          return;
        }

        if (!isRealtimeEnvelopeForStore(message, storeId)) {
          return;
        }

        const version = message.event.version;
        const classification = classifyEventVersion(
          highestSeenVersionRef.current,
          version,
        );
        if (classification === 'invalid') {
          requestSnapshot('invalid_event');
          return;
        }
        if (classification === 'duplicate') {
          return;
        }

        highestSeenVersionRef.current = version;
        requestSnapshot(
          classification === 'gap' ? 'version_gap' : 'event',
          { event: message.event },
        );
      });

      nextSocket.addEventListener('close', (closeEvent) => {
        if (socket !== nextSocket) {
          return;
        }
        socket = null;
        clearInterval(pingTimer);
        pingTimer = null;

        if (disposed) {
          return;
        }
        if (closeEvent.code === 4401) {
          setDisconnected();
          window.dispatchEvent(new Event(UNAUTHORIZED_EVENT));
          return;
        }
        if (closeEvent.code === 4403) {
          setDisconnected();
          return;
        }

        scheduleReconnect();
      });

      nextSocket.addEventListener('error', () => {
        if (nextSocket.readyState !== WebSocket.CLOSED) {
          nextSocket.close();
        }
      });
    };

    const handleOffline = () => {
      clearTimers();
      setDisconnected();
      socket?.close(1000, 'OFFLINE');
    };
    const handleOnline = () => {
      reconnectAttempt = 0;
      socket?.close(1000, 'RECONNECT_ONLINE');
      connect();
    };

    window.addEventListener('offline', handleOffline);
    window.addEventListener('online', handleOnline);
    connect();

    return () => {
      disposed = true;
      clearTimers();
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('online', handleOnline);
      socket?.close(1000, 'STORE_CHANGED');
      socket = null;
      reset();
    };
  }, [
    reset,
    setConnected,
    setDisconnected,
    setReconnecting,
    storeId,
    token,
  ]);

  return {
    status: connectionStatus,
    connected: connectionStatus === 'connected',
  };
}
