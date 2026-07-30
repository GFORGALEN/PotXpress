import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
} from 'react';

/**
 * 连接状态：
 * - 'connected'    绿色：正常连接
 * - 'reconnecting' 黄色：重连中 / 网络波动
 * - 'disconnected' 红色：已断开 / 无法连接
 * - 'idle'         灰色：当前没有可订阅的门店
 */
const ErrorContext = createContext(null);

export function ErrorProvider({ children }) {
  const [connectionStatus, setConnectionStatus] = useState('idle');
  const [lastPing, setLastPing] = useState(null);
  const statusRef = useRef(connectionStatus);
  statusRef.current = connectionStatus;

  const setConnected = useCallback(() => {
    setConnectionStatus('connected');
    setLastPing(Date.now());
  }, []);

  const setReconnecting = useCallback(() => {
    setConnectionStatus('reconnecting');
  }, []);

  const setDisconnected = useCallback(() => {
    setConnectionStatus('disconnected');
  }, []);

  const reset = useCallback(() => {
    setConnectionStatus('idle');
    setLastPing(null);
  }, []);

  const value = useMemo(
    () => ({
      connectionStatus,
      lastPing,
      setConnected,
      setReconnecting,
      setDisconnected,
      reset,
    }),
    [connectionStatus, lastPing, setConnected, setReconnecting, setDisconnected, reset],
  );

  return (
    <ErrorContext.Provider value={value}>
      {children}
    </ErrorContext.Provider>
  );
}

export function useErrorContext() {
  const context = useContext(ErrorContext);

  if (!context) {
    throw new Error('useErrorContext 必须在 ErrorProvider 内使用');
  }

  return context;
}
