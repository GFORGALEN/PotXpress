import { useState } from 'react';
import {
  CircleAlert,
  RotateCcw,
  Copy,
  Check,
  Home,
} from 'lucide-react';

/**
 * 共享的错误回退 UI
 *
 * @param {'app' | 'page'}  level    — app 级显示完整崩溃页 / page 级内嵌在内容区
 * @param {string}          title    — 错误标题
 * @param {string}          message  — 错误描述
 * @param {string}          errorId  — 可用于追踪的唯一错误编号
 * @param {() => void}      onRetry  — 重试回调（重置当前边界）
 * @param {() => void}      onGoHome — 回到首页（app 级用）
 */
export function ErrorFallback({
  level = 'page',
  title = '页面发生异常',
  message = '请尝试刷新或重试，如果问题持续存在请联系技术支持。',
  errorId,
  onRetry,
  onGoHome,
}) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    if (!errorId) {
      return;
    }

    try {
      await navigator.clipboard.writeText(errorId);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // 部分环境不支持 clipboard API，静默失败
    }
  };

  const isAppLevel = level === 'app';

  return (
    <div
      className={isAppLevel
        ? 'flex h-full items-center justify-center bg-canvas p-4'
        : 'flex flex-col items-center justify-center py-16'}
      role="alert"
    >
      <div className="w-full max-w-md text-center">
        <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-full bg-red-100">
          <CircleAlert className="text-red-600" size={28} />
        </div>

        <h2 className="text-lg font-bold text-ink-950">
          {isAppLevel ? '应用发生异常' : title}
        </h2>

        <p className="mt-2 text-sm leading-relaxed text-stone-500">
          {isAppLevel
            ? '应用遇到了无法自动恢复的错误。请尝试刷新页面，如果问题持续存在请联系技术支持。'
            : message}
        </p>

        {errorId ? (
          <div className="mt-5">
            <p className="text-xs text-stone-400">错误编号</p>
            <div className="mt-1 flex items-center justify-center gap-2">
              <code className="select-all rounded-lg bg-stone-100 px-3 py-1 font-mono text-sm font-semibold text-ink-800">
                {errorId}
              </code>
              <button
                type="button"
                onClick={handleCopy}
                className="flex h-8 w-8 items-center justify-center rounded-lg border border-stone-200 bg-white text-stone-500 transition hover:border-stone-300 hover:text-ink-700"
                aria-label={copied ? '已复制' : '复制错误编号'}
              >
                {copied ? <Check size={15} className="text-emerald-600" /> : <Copy size={15} />}
              </button>
            </div>
            {copied ? (
              <p className="mt-1 text-xs text-emerald-600">已复制到剪贴板</p>
            ) : null}
          </div>
        ) : null}

        <div className="mt-7 flex items-center justify-center gap-3">
          {onRetry ? (
            <button
              type="button"
              onClick={onRetry}
              className="inline-flex items-center gap-2 rounded-xl bg-ember-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-ember-700"
            >
              <RotateCcw size={16} />
              重试
            </button>
          ) : null}
          {isAppLevel ? (
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="inline-flex items-center gap-2 rounded-xl border border-stone-200 bg-white px-5 py-2.5 text-sm font-semibold text-ink-800 transition hover:bg-stone-50"
            >
              <RotateCcw size={16} />
              刷新页面
            </button>
          ) : null}
          {onGoHome ? (
            <button
              type="button"
              onClick={onGoHome}
              className="inline-flex items-center gap-2 rounded-xl border border-stone-200 bg-white px-5 py-2.5 text-sm font-medium text-stone-700 transition hover:bg-stone-50"
            >
              <Home size={16} />
              回到首页
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
