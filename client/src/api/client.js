import axios from 'axios';
import { ApiError } from './ApiError.js';

export const TOKEN_STORAGE_KEY = 'potxpress_token';
export const UNAUTHORIZED_EVENT = 'potxpress:unauthorized';

let unauthorizedSignalSent = false;

export function getStoredToken() {
  return sessionStorage.getItem(TOKEN_STORAGE_KEY);
}

export function storeToken(token) {
  sessionStorage.setItem(TOKEN_STORAGE_KEY, token);
  localStorage.removeItem(TOKEN_STORAGE_KEY);
}

export function removeStoredToken() {
  sessionStorage.removeItem(TOKEN_STORAGE_KEY);
  localStorage.removeItem(TOKEN_STORAGE_KEY);
}

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

function createIdempotencyKey() {
  if (globalThis.crypto?.randomUUID) {
    return globalThis.crypto.randomUUID();
  }

  return [
    Date.now().toString(36),
    Math.random().toString(36).slice(2),
    Math.random().toString(36).slice(2),
  ].join('-');
}

export async function sendIdempotentRequest(config, { retries = 1 } = {}) {
  const requestConfig = {
    ...config,
    headers: {
      ...config.headers,
      'Idempotency-Key': createIdempotencyKey(),
    },
  };

  for (let attempt = 0; ; attempt += 1) {
    try {
      return await apiClient.request(requestConfig);
    } catch (error) {
      if (attempt >= retries || error.code !== 'NETWORK_ERROR') {
        throw error;
      }
    }
  }
}

apiClient.interceptors.request.use((request) => {
  const token = getStoredToken();
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
    const isLoginRequest = error.config?.url === '/auth/login'
      || error.config?.url === '/auth/kiosk';

    if (
      status === 401
      && !isLoginRequest
      && error.config?.potxpressHadToken
    ) {
      removeStoredToken();
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
