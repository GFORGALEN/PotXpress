import { useCallback, useRef } from 'react';
import { generateErrorId } from '../utils/errorId.js';

/**
 * 组件级错误处理 Hook。
 *
 * 用于在组件中捕获异步操作错误，自动附加 errorId 并触发统一处理流程。
 *
 * 返回：
 *  - handleError(error, context?)  封装并上报错误，返回 ApiError（含 errorId）
 *  - wrap(fn, errorContext?)       包装异步函数，自动 catch 并 handleError
 */
export function useErrorHandler() {
  const captureRef = useRef(null);

  const handleError = useCallback((error, meta = {}) => {
    const errorId = generateErrorId();

    // 将 errorId 附加到 error 对象上，便于后续追踪
    if (error && typeof error === 'object') {
      error.potxpressErrorId = errorId;
    }

    // 派发到全局事件总线，供 ErrorContext / 日志系统消费
    if (typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent('potxpress:api-error', {
          detail: {
            errorId,
            code: error?.code ?? 'UNKNOWN',
            message: error?.message ?? '未知错误',
            status: error?.status ?? 0,
            meta,
            timestamp: Date.now(),
          },
        }),
      );
    }

    return { ...error, potxpressErrorId: errorId };
  }, []);

  const wrap = useCallback((fn, errorContext = '') => {
    return async (...args) => {
      try {
        return await fn(...args);
      } catch (error) {
        if (error?.code === 'REQUEST_CANCELED') {
          // 请求取消不需要上报
          throw error;
        }

        throw handleError(error, { context: errorContext });
      }
    };
  }, [handleError]);

  return { handleError, wrap };
}
