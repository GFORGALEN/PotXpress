import { CircleAlert } from 'lucide-react';

export function ErrorMessage({ message, onRetry }) {
  if (!message) {
    return null;
  }

  return (
    <div
      className="flex items-start gap-3 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900"
      role="alert"
    >
      <CircleAlert className="mt-0.5 shrink-0" size={17} />
      <div className="min-w-0 flex-1">
        <p className="leading-5">{message}</p>
        {onRetry ? (
          <button
            type="button"
            onClick={onRetry}
            className="mt-2 font-semibold underline underline-offset-2"
          >
            重新尝试
          </button>
        ) : null}
      </div>
    </div>
  );
}
