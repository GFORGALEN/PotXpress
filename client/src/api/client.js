import axios from 'axios';
import { ApiError } from './ApiError.js';

export const TOKEN_STORAGE_KEY = 'potxpress_token';
export const UNAUTHORIZED_EVENT = 'potxpress:unauthorized';

let unauthorizedSignalSent = false;

export function resetUnauthorizedSignal() {
  unauthorizedSignalSent = false;
}

function emitUnauthorizedOnce() {
  if (unauthorizedSignalSent || typeof window === 'undefined') {
    return;
  }

  unauthorizedSignalSent = true;
  window.dispatchEvent(new Event(UNAUTHORIZED_EVENT));
}

export const apiClient = axios.create({
  baseURL: '/api',
  timeout: 15000,
  headers: {
    Accept: 'application/json',
  },
});

apiClient.interceptors.request.use((request) => {
  const token = localStorage.getItem(TOKEN_STORAGE_KEY);
  request.potxpressHadToken = Boolean(token);

  if (token) {
    request.headers.Authorization = `Bearer ${token}`;
  }

  return request;
});

apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    if (axios.isCancel(error)) {
      throw new ApiError({
        code: 'REQUEST_CANCELED',
        message: '请求已取消',
        status: 0,
        cause: error,
      });
    }

    const status = error.response?.status ?? 0;
    const payload = error.response?.data?.error;
    const isLoginRequest = error.config?.url === '/auth/login';

    if (
      status === 401
      && !isLoginRequest
      && error.config?.potxpressHadToken
    ) {
      localStorage.removeItem(TOKEN_STORAGE_KEY);
      emitUnauthorizedOnce();
    }

    if (!error.response || (status >= 500 && !payload)) {
      throw new ApiError({
        code: 'NETWORK_ERROR',
        message: '无法连接服务器，请检查网络后重试',
        status: 0,
        cause: error,
      });
    }

    throw new ApiError({
      code: payload?.code ?? 'UNKNOWN_ERROR',
      message: payload?.message ?? '请求失败，请稍后再试',
      details: payload?.details,
      status,
      cause: error,
    });
  },
);
