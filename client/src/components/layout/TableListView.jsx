import clsx from 'clsx';
import { formatTimerDuration, TIMER_STATUS_LABELS } from '../../utils/timerDisplay.js';

const statusClasses = {
  idle: 'bg-stone-100 text-stone-700',
  running: 'bg-emerald-100 text-emerald-800',
  paused: 'bg-slate-200 text-slate-700',
  warning: 'bg-amber-100 text-amber-900',
  overtime: 'bg-red-100 text-red-800',
};

export function TableListView({ tables, onTableClick }) {
  const priority = { overtime: 0, warning: 1, paused: 2, running: 3, idle: 4 };
  const sorted = [...tables].sort((left, right) => (
    priority[left.status] - priority[right.status]
    || (
      left.status !== 'idle'
      && right.status !== 'idle'
      && left.remainingSeconds - right.remainingSeconds
    )
    || left.sortOrder - right.sortOrder
    || left.number - right.number
  ));

  return (
    <div className="grid gap-3">
      {sorted.map((table) => {
        const seconds = table.status === 'overtime'
          ? table.overtimeSeconds
          : table.remainingSeconds;
        return (
          <button
            key={table.tableId}
            type="button"
            onClick={() => onTableClick(table.tableId)}
            className="flex min-h-[5.5rem] items-center justify-between gap-4 rounded-2xl border border-stone-200 bg-white p-4 text-left shadow-card transition active:scale-[0.99]"
          >
            <span className="min-w-0">
              <span className="block truncate text-base font-black text-ink-950">{table.name}</span>
              <span className="mt-1 block text-xs text-stone-500">桌台 #{table.number}</span>
            </span>
            <span className="shrink-0 text-right">
              <span className={clsx('inline-flex rounded-full px-2.5 py-1 text-xs font-bold', statusClasses[table.status])}>{TIMER_STATUS_LABELS[table.status]}</span>
              {table.status !== 'idle' ? (
                <span className="mt-1.5 block font-mono text-lg font-black tabular-nums">
                  {table.status === 'overtime'
                    ? `超时 ${formatTimerDuration(seconds)}`
                    : formatTimerDuration(seconds)}
                </span>
              ) : null}
            </span>
          </button>
        );
      })}
    </div>
  );
}
