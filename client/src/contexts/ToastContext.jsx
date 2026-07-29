import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { X } from 'lucide-react';
import clsx from 'clsx';

const ToastContext = createContext(null);

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const timersRef = useRef(new Map());

  const removeToast = useCallback((id) => {
    const timer = timersRef.current.get(id);

    if (timer) {
      clearTimeout(timer);
      timersRef.current.delete(id);
    }

    setToasts((items) => items.filter((toast) => toast.id !== id));
  }, []);

  const showToast = useCallback((message, type = 'info') => {
    const id = crypto.randomUUID();
    setToasts((items) => [...items, { id, message, type }]);
    const timer = setTimeout(() => removeToast(id), 3000);
    timersRef.current.set(id, timer);
    return id;
  }, [removeToast]);

  useEffect(() => () => {
    for (const timer of timersRef.current.values()) {
      clearTimeout(timer);
    }
  }, []);

  const value = useMemo(
    () => ({ showToast, removeToast }),
    [removeToast, showToast],
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        className="pointer-events-none fixed right-4 top-4 z-[100] flex w-[min(22rem,calc(100vw-2rem))] flex-col gap-2"
        aria-live="polite"
        aria-atomic="false"
      >
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={clsx(
              'pointer-events-auto flex items-start gap-3 rounded-2xl border px-4 py-3 text-sm shadow-soft',
              toast.type === 'success'
                && 'border-emerald-200 bg-emerald-50 text-emerald-950',
              toast.type === 'error'
                && 'border-red-200 bg-red-50 text-red-950',
              toast.type === 'info'
                && 'border-stone-200 bg-white text-ink-900',
            )}
          >
            <span className="min-w-0 flex-1 leading-5">{toast.message}</span>
            <button
              type="button"
              onClick={() => removeToast(toast.id)}
              className="rounded-md p-0.5 opacity-60 transition hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-current"
              aria-label="关闭提示"
            >
              <X size={16} />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);

  if (!context) {
    throw new Error('useToast 必须在 ToastProvider 内使用');
  }

  return context;
}
