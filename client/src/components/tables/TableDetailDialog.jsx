import { useEffect, useRef } from 'react';
import { Clock3, X } from 'lucide-react';
import {
  formatStoreTime,
  formatTimerDuration,
  TIMER_STATUS_LABELS,
} from '../../utils/timerDisplay.js';

export function TableDetailDialog({ table, timezone, onClose }) {
  const closeButtonRef = useRef(null);

  useEffect(() => {
    if (!table) {
      return undefined;
    }

    closeButtonRef.current?.focus();
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose, table]);

  if (!table) {
    return null;
  }

  const isOvertime = table.status === 'overtime';
  const isIdle = table.status === 'idle';
  const duration = isOvertime
    ? formatTimerDuration(table.overtimeSeconds, { overtime: true })
    : formatTimerDuration(table.remainingSeconds);

  return (
    <div
      className="fixed inset-0 z-[90] flex items-center justify-center bg-ink-950/60 p-4 backdrop-blur-sm"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <div
        className="w-full max-w-md rounded-3xl border border-white/50 bg-white p-6 shadow-soft"
        role="dialog"
        aria-modal="true"
        aria-labelledby="table-detail-title"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-ember-600">
              桌台详情
            </p>
            <h2
              id="table-detail-title"
              className="mt-2 text-2xl font-black tracking-tight text-ink-950"
            >
              {table.name}
            </h2>
          </div>
          <button
            ref={closeButtonRef}
            type="button"
            onClick={onClose}
            className="rounded-xl p-2 text-stone-400 transition hover:bg-stone-100 hover:text-stone-700"
            aria-label="关闭桌台详情"
          >
            <X size={19} />
          </button>
        </div>

        <div className="mt-5 rounded-2xl bg-stone-50 p-4">
          <div className="flex items-center justify-between gap-4">
            <span className="text-sm font-semibold text-stone-500">
              {TIMER_STATUS_LABELS[table.status]}
            </span>
            {!isIdle ? (
              <span className="font-mono text-2xl font-black tabular-nums text-ink-950">
                {duration}
              </span>
            ) : null}
          </div>
          {!isIdle ? (
            <div className="mt-3 flex items-center gap-2 text-xs text-stone-500">
              <Clock3 size={15} />
              {formatStoreTime(table.startTime, timezone)}
              {' → '}
              {formatStoreTime(table.effectiveEndTime, timezone)}
            </div>
          ) : null}
        </div>

        <p className="mt-5 text-sm leading-6 text-stone-500">
          计时操作将在模块 7 提供。本模块仅展示跨设备同步后的实时桌台状态。
        </p>
        <button
          type="button"
          onClick={onClose}
          className="mt-6 w-full rounded-2xl bg-ink-900 px-4 py-3 text-sm font-bold text-white transition hover:bg-ink-800"
        >
          知道了
        </button>
      </div>
    </div>
  );
}
