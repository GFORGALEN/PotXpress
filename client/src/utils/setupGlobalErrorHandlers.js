import { generateErrorId } from './errorId.js';

/**
 * 注册全局未捕获异常处理器。
 *
 * - unhandledrejection：未 catch 的 Promise rejection
 * - error：非 React 渲染路径中的同步异常
 *
 * 这些错误无法被 ErrorBoundary 捕获，需要通过全局事件记录下来。
 * 触发后派发 potxpress:unhandled-error 自定义事件，供外部日志 / 监控消费。
 */

let registered = false;

export function setupGlobalErrorHandlers() {
  if (registered) {
    return;
  }

  registered = true;

  if (typeof window === 'undefined') {
    return;
  }

  window.addEventListener('unhandledrejection', (event) => {
    const errorId = generateErrorId();
    const reason = event.reason;

    // 忽略已经被 axios 拦截器处理过的 ApiError
    if (reason?.name === 'ApiError' && reason?.code !== 'NETWORK_ERROR') {
      return;
    }

    window.dispatchEvent(
      new CustomEvent('potxpress:unhandled-error', {
        detail: {
          type: 'unhandledrejection',
          errorId,
          message: reason?.message ?? String(reason),
          code: reason?.code,
          timestamp: Date.now(),
        },
      }),
    );
  });

  window.addEventListener('error', (event) => {
    // 跳过 React ErrorBoundary 已经处理的渲染错误
    // （这些错误在 error 事件中仍会冒泡到 window）
    if (event.target && event.target !== window) {
      return;
    }

    const errorId = generateErrorId();

    window.dispatchEvent(
      new CustomEvent('potxpress:unhandled-error', {
        detail: {
          type: 'global-error',
          errorId,
          message: event.message ?? '未知异常',
          filename: event.filename,
          timestamp: Date.now(),
        },
      }),
    );

    // 不调用 preventDefault，让浏览器仍记录到 console
  });
}
