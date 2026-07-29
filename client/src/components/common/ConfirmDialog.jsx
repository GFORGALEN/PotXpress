import { useEffect, useRef } from 'react';
import { X } from 'lucide-react';
import clsx from 'clsx';
import { STORE_CHANGING_EVENT } from '../../contexts/StoreContext.jsx';

export function ConfirmDialog({
  open,
  title,
  description,
  confirmText = '确认',
  danger = false,
  onConfirm,
  onCancel,
}) {
  const cancelButtonRef = useRef(null);

  useEffect(() => {
    if (!open) {
      return undefined;
    }

    cancelButtonRef.current?.focus();
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        onCancel();
      }
    };
    const handleStoreChange = () => onCancel();
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener(STORE_CHANGING_EVENT, handleStoreChange);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener(STORE_CHANGING_EVENT, handleStoreChange);
    };
  }, [onCancel, open]);

  if (!open) {
    return null;
  }

  return (
    <div
      className="fixed inset-0 z-[90] flex items-center justify-center bg-ink-950/55 p-4 backdrop-blur-sm"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onCancel();
        }
      }}
    >
      <div
        className="w-full max-w-md rounded-3xl border border-white/60 bg-white p-6 shadow-soft"
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
      >
        <div className="flex items-start gap-4">
          <div className="min-w-0 flex-1">
            <h2
              id="confirm-dialog-title"
              className="text-lg font-semibold text-ink-900"
            >
              {title}
            </h2>
            <p className="mt-2 text-sm leading-6 text-stone-600">
              {description}
            </p>
          </div>
          <button
            type="button"
            onClick={onCancel}
            className="rounded-xl p-2 text-stone-400 transition hover:bg-stone-100 hover:text-stone-700"
            aria-label="关闭"
          >
            <X size={18} />
          </button>
        </div>
        <div className="mt-7 flex justify-end gap-3">
          <button
            ref={cancelButtonRef}
            type="button"
            onClick={onCancel}
            className="rounded-xl border border-stone-200 px-4 py-2.5 text-sm font-semibold text-stone-700 transition hover:bg-stone-50 focus:outline-none focus:ring-2 focus:ring-stone-400"
          >
            取消
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className={clsx(
              'rounded-xl px-4 py-2.5 text-sm font-semibold text-white transition focus:outline-none focus:ring-2 focus:ring-offset-2',
              danger
                ? 'bg-red-600 hover:bg-red-700 focus:ring-red-500'
                : 'bg-ember-500 hover:bg-ember-600 focus:ring-ember-500',
            )}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}
