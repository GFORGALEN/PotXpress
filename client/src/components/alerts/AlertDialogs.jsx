import { AlertTriangle, Siren, X } from 'lucide-react';
import { formatTimerDuration } from '../../utils/timerDisplay.js';

export function WarningAlertDialog({ tables, onClose }) {
  if (tables.length === 0) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-[96] flex items-center justify-center bg-ink-950/60 p-4 backdrop-blur-sm">
      <div
        className="w-full max-w-md rounded-3xl bg-white p-6 shadow-soft"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="warning-alert-title"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-100 text-amber-700">
              <AlertTriangle size={24} />
            </span>
            <h2
              id="warning-alert-title"
              className="mt-4 text-xl font-black text-ink-950"
            >
              即将超时
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-11 w-11 items-center justify-center rounded-xl text-stone-400 hover:bg-stone-100"
            aria-label="关闭即将超时提醒"
          >
            <X size={20} />
          </button>
        </div>
        <div className="mt-4 space-y-2">
          {tables.map((table) => (
            <div
              key={table.tableId}
              className="flex items-center justify-between rounded-xl bg-amber-50 px-3 py-2.5 text-sm"
            >
              <strong>{table.name}</strong>
              <span className="font-mono font-black">
                还剩 {formatTimerDuration(table.remainingSeconds)}
              </span>
            </div>
          ))}
        </div>
        <button
          type="button"
          onClick={onClose}
          className="mt-6 min-h-12 w-full rounded-2xl bg-amber-500 text-sm font-black text-white"
        >
          知道了
        </button>
      </div>
    </div>
  );
}

export function OvertimeAlertDialog({
  tables,
  acknowledging,
  onAcknowledge,
  onHandle,
}) {
  if (tables.length === 0) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-[98] flex items-center justify-center bg-red-950/80 p-4 backdrop-blur-sm">
      <div
        className="w-full max-w-lg rounded-3xl border-2 border-red-300 bg-white p-6 shadow-soft"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="overtime-alert-title"
      >
        <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-red-100 text-red-700">
          <Siren size={28} />
        </span>
        <h2
          id="overtime-alert-title"
          className="mt-4 text-2xl font-black text-red-700"
        >
          桌台已超时，需要立即处理
        </h2>
        <div className="mt-4 space-y-2">
          {tables.map((table) => (
            <div
              key={table.tableId}
              className="flex items-center justify-between rounded-xl bg-red-50 px-3 py-3"
            >
              <strong>{table.name}</strong>
              <span className="font-mono font-black text-red-700">
                {formatTimerDuration(table.overtimeSeconds, {
                  overtime: true,
                })}
              </span>
            </div>
          ))}
        </div>
        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          <button
            type="button"
            onClick={onHandle}
            className="min-h-12 rounded-2xl border border-red-200 bg-red-50 text-sm font-black text-red-700"
          >
            前往处理
          </button>
          <button
            type="button"
            onClick={onAcknowledge}
            disabled={acknowledging}
            className="min-h-12 rounded-2xl bg-red-600 text-sm font-black text-white disabled:opacity-50"
          >
            {acknowledging ? '正在确认…' : '确认提醒'}
          </button>
        </div>
      </div>
    </div>
  );
}
