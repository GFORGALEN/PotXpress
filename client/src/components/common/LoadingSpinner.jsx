import { LoaderCircle } from 'lucide-react';
import clsx from 'clsx';

export function LoadingSpinner({ label = '加载中', fullPage = false }) {
  return (
    <div
      className={clsx(
        'flex items-center justify-center gap-3 text-sm text-stone-500',
        fullPage ? 'min-h-screen bg-canvas' : 'min-h-40',
      )}
      role="status"
    >
      <LoaderCircle className="animate-spin text-ember-500" size={22} />
      <span>{label}</span>
    </div>
  );
}
