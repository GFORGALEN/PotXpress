import { useState } from 'react';
import { AlertTriangle, ChevronDown, Siren } from 'lucide-react';
import clsx from 'clsx';
import { formatTimerDuration } from '../../utils/timerDisplay.js';

export function TimerStatusBanner({
  status,
  tables,
  collapsible = false,
}) {
  const [collapsed, setCollapsed] = useState(false);

  if (tables.length === 0) {
    return null;
  }

  const overtime = status === 'overtime';
  const Icon = overtime ? Siren : AlertTriangle;

  return (
    <section
      className={clsx(
        'rounded-2xl border px-4 py-3 text-white shadow-card',
        overtime
          ? 'border-red-700 bg-red-600'
          : 'border-amber-500 bg-amber-500',
      )}
      aria-label={overtime ? '已超时桌台' : '即将超时桌台'}
    >
      <div className="flex items-center gap-3">
        <Icon className="shrink-0" size={19} />
        <strong className="text-sm">
          {overtime ? '需要立即处理' : '即将超时'}
          <span className="ml-2 rounded-full bg-black/15 px-2 py-0.5 text-xs">
            {tables.length}
          </span>
        </strong>
        {collapsible ? (
          <button
            type="button"
            onClick={() => setCollapsed((value) => !value)}
            className="ml-auto rounded-lg p-1 transition hover:bg-black/10"
            aria-expanded={!collapsed}
            aria-label={collapsed ? '展开即将超时桌台' : '折叠即将超时桌台'}
          >
            <ChevronDown
              size={18}
              className={clsx('transition', collapsed && '-rotate-90')}
            />
          </button>
        ) : null}
      </div>

      {!collapsed ? (
        <div className="mt-2 flex flex-wrap gap-2">
          {tables.map((table) => (
            <span
              key={table.tableId}
              className="rounded-xl bg-white/15 px-2.5 py-1 text-xs font-semibold"
            >
              {table.name}
              {' · '}
              {formatTimerDuration(
                overtime ? table.overtimeSeconds : table.remainingSeconds,
                { overtime },
              )}
            </span>
          ))}
        </div>
      ) : null}
    </section>
  );
}
