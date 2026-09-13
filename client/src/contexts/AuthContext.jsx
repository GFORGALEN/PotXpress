import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useNavigate } from 'react-router';
import {
  kioskLogin,
  login as loginRequest,
  logout as logoutRequest,
  me,
  refreshSession as refreshSessionRequest,
} from '../api/auth.js';
import {
  getStoredKioskKey,
  getStoredToken,
  removeStoredKioskKey,
  removeStoredToken,
  resetUnauthorizedSignal,
  storeToken,
  UNAUTHORIZED_EVENT,
} from '../api/client.js';

const AuthContext = createContext(null);
const SESSION_REFRESH_INTERVAL = 6 * 60 * 60 * 1000;
const SESSION_REFRESH_RETRY_INTERVAL = 60 * 1000;
const SESSION_RESTORE_RETRY_INTERVAL = 5000;

export function AuthProvider({ children }) {
  const navigate = useNavigate();
  const [token, setToken] = useState(
    () => getStoredToken(),
  );
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(
    () => Boolean(getStoredToken() || getStoredKioskKey()),
  );
  const recoveryPromiseRef = useRef(null);

  const clearSession = useCallback(() => {
    removeStoredToken();
    setToken(null);
    setUser(null);
  }, []);

  const applySession = useCallback((result) => {
    storeToken(result.token);
    resetUnauthorizedSignal();
    setToken(result.token);
    setUser(result.user);
    setLoading(false);
  }, []);

  const recoverAfterUnauthorized = useCallback(() => {
    if (recoveryPromiseRef.current) {
      return recoveryPromiseRef.current;
    }

    const recovery = (async () => {
      setLoading(true);
      const kioskKey = getStoredKioskKey();

      if (!kioskKey) {
        clearSession();
        setLoading(false);
        return false;
      }

      try {
        const result = await kioskLogin(kioskKey);
        applySession(result);
        return true;
      } catch (error) {
        if (error.status === 401 || error.status === 409) {
          removeStoredKioskKey();
        }
        clearSession();
        setLoading(false);
        return false;
      }
    })();

    recoveryPromiseRef.current = recovery;
    void recovery.finally(() => {
      if (recoveryPromiseRef.current === recovery) {
        recoveryPromiseRef.current = null;
      }
    });
    return recovery;
  }, [applySession, clearSession]);

  useEffect(() => {
    const handleUnauthorized = () => {
      void recoverAfterUnauthorized();
    };

    window.addEventListener(UNAUTHORIZED_EVENT, handleUnauthorized);
    return () => {
      window.removeEventListener(UNAUTHORIZED_EVENT, handleUnauthorized);
    };
  }, [recoverAfterUnauthorized]);

  useEffect(() => {
    let active = true;
    let retryTimer = null;
    let restoring = false;

    const scheduleRetry = () => {
      if (!active) {
        return;
      }
      clearTimeout(retryTimer);
      retryTimer = setTimeout(restoreSession, SESSION_RESTORE_RETRY_INTERVAL);
    };

    async function restoreSession() {
      if (!active || restoring) {
        return;
      }

      if (!token) {
        if (getStoredKioskKey()) {
          await recoverAfterUnauthorized();
        } else {
          setLoading(false);
        }
        return;
      }

      if (user) {
        setLoading(false);
        return;
      }

      restoring = true;
      setLoading(true);

      try {
        const result = await me();

        if (active) {
          setUser(result.user);
          setLoading(false);
        }
      } catch (error) {
        if (!active) {
          return;
        }

        if (error.status === 401) {
          await recoverAfterUnauthorized();
        } else {
          // A timeout, deployment, or temporary database error must not be
          // presented as a logged-out session. Keep the token and retry.
          scheduleRetry();
        }
      } finally {
        restoring = false;
      }
    }

    const handleOnline = () => {
      clearTimeout(retryTimer);
      restoreSession();
    };

    void restoreSession();
    window.addEventListener('online', handleOnline);
    return () => {
      active = false;
      clearTimeout(retryTimer);
      window.removeEventListener('online', handleOnline);
    };
  }, [recoverAfterUnauthorized, token, user]);

  useEffect(() => {
    if (!token || !user) {
      return undefined;
    }

    let active = true;
    let refreshTimer = null;
    let nextRefreshAt = Date.now() + SESSION_REFRESH_INTERVAL;

    const scheduleRefresh = (delay) => {
      clearTimeout(refreshTimer);
      nextRefreshAt = Date.now() + delay;
      refreshTimer = setTimeout(refreshSession, delay);
    };

    async function refreshSession() {
      try {
        const result = await refreshSessionRequest();
        if (active) {
          applySession(result);
        }
      } catch (error) {
        if (active && error.status !== 401) {
          scheduleRefresh(SESSION_REFRESH_RETRY_INTERVAL);
        }
      }
    }

    const handleVisibilityChange = () => {
      if (!document.hidden && Date.now() >= nextRefreshAt) {
        clearTimeout(refreshTimer);
        void refreshSession();
      }
    };

    scheduleRefresh(SESSION_REFRESH_INTERVAL);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      active = false;
      clearTimeout(refreshTimer);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [applySession, token, user]);

  const login = useCallback(async (username, password) => {
    const result = await loginRequest(username, password);
    removeStoredKioskKey();
    applySession(result);
    return result.user;
  }, [applySession]);

  const logout = useCallback(async () => {
    removeStoredKioskKey();
    try {
      if (token) {
        await logoutRequest();
      }
    } catch (error) {
      // 退出以本地会话清理为准，服务端审计失败不能阻止用户离开。
    } finally {
      clearSession();
      resetUnauthorizedSignal();
      navigate('/login', { replace: true });
    }
  }, [clearSession, navigate, token]);

  const value = useMemo(
    () => ({
      user,
      token,
      loading,
      login,
      logout,
      isAuthenticated: Boolean(user && token),
    }),
    [loading, login, logout, token, user],
  );

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error('useAuth 必须在 AuthProvider 内使用');
  }

  return context;
}
