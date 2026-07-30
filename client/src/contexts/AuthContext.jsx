import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { useNavigate } from 'react-router';
import {
  login as loginRequest,
  logout as logoutRequest,
  me,
} from '../api/auth.js';
import {
  getStoredToken,
  removeStoredToken,
  resetUnauthorizedSignal,
  storeToken,
  UNAUTHORIZED_EVENT,
} from '../api/client.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const navigate = useNavigate();
  const [token, setToken] = useState(
    () => getStoredToken(),
  );
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(Boolean(token));

  const clearSession = useCallback(() => {
    removeStoredToken();
    setToken(null);
    setUser(null);
  }, []);

  useEffect(() => {
    const handleUnauthorized = () => {
      clearSession();
    };

    window.addEventListener(UNAUTHORIZED_EVENT, handleUnauthorized);
    return () => {
      window.removeEventListener(UNAUTHORIZED_EVENT, handleUnauthorized);
    };
  }, [clearSession]);

  useEffect(() => {
    let active = true;

    async function restoreSession() {
      if (!token) {
        setLoading(false);
        return;
      }

      setLoading(true);

      try {
        const result = await me();

        if (active) {
          setUser(result.user);
        }
      } catch (error) {
        if (active) {
          clearSession();
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    restoreSession();
    return () => {
      active = false;
    };
  }, [clearSession, token]);

  const login = useCallback(async (username, password) => {
    const result = await loginRequest(username, password);
    storeToken(result.token);
    resetUnauthorizedSignal();
    setToken(result.token);
    setUser(result.user);
    setLoading(false);
    return result.user;
  }, []);

  const logout = useCallback(async () => {
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
