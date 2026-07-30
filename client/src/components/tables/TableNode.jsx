import { memo } from 'react';
import clsx from 'clsx';
import {
  formatStoreTime,
  formatTimerDuration,
  TIMER_STATUS_LABELS,
} from '../../utils/timerDisplay.js';

const STATUS_STYLES = Object.freeze({
  idle: 'border-2 border-dashed border-slate-300 bg-slate-200 text-slate-600',
  running: 'border border-emerald-400 bg-emerald-500 text-white shadow-lg shadow-emerald-950/15',
  paused: 'border border-sky-400 bg-sky-500 text-white shadow-lg shadow-sky-950/15',
  warning: 'border border-amber-400 bg-amber-500 text-white shadow-lg shadow-amber-950/15',
  overtime: 'table-overtime border border-red-500 bg-red-600 text-white shadow-xl shadow-red-950/25',
});

export const TableNode = memo(function TableNode({
  tableId,
  name,
  layout,
  status,
  remainingSeconds,
  overtimeSeconds,
  startTime,
  effectiveEndTime,
  timezone,
  highlighted,
  onTableClick,
  embedded = false,
  selected = false,
  shape = 'rectangle',
  groupName = null,
}) {
  const isIdle = status === 'idle';
  const duration = status === 'overtime'
    ? formatTimerDuration(overtimeSeconds, { overtime: true })
    : formatTimerDuration(remainingSeconds);

  return (
    <button
      type="button"
      data-table-node={tableId}
      className={clsx(
        'table-node flex select-none flex-col justify-between overflow-hidden p-[clamp(0.25rem,1.2vw,0.75rem)] text-left outline-none transition-[filter,box-shadow] focus-visible:ring-4 focus-visible:ring-white/90 focus-visible:ring-offset-2 focus-visible:ring-offset-ink-900',
        shape === 'round' ? 'rounded-full' : 'rounded-2xl',
        shape === 'booth' && 'border-[3px] border-double',
        embedded ? 'h-full w-full' : 'absolute',
        STATUS_STYLES[status],
        highlighted && 'ring-4 ring-ember-300 ring-offset-2',
        selected && 'ring-4 ring-sky-400 ring-offset-2 ring-offset-white',
        groupName && 'outline outline-2 outline-dashed outline-violet-500 outline-offset-2',
      )}
      style={embedded ? {
        fontSize: 'clamp(12px, 1.1vw, 16px)',
        containerType: 'size',
      } : {
        left: `${layout.xRatio * 100}%`,
        top: `${layout.yRatio * 100}%`,
        width: `${layout.widthRatio * 100}%`,
        height: `${layout.heightRatio * 100}%`,
        transform: `rotate(${layout.rotation ?? 0}deg)`,
        zIndex: layout.zIndex,
        fontSize: 'clamp(12px, 1.1vw, 16px)',
        containerType: 'size',
      }}
      onClick={(event) => {
        event.stopPropagation();
        onTableClick(tableId);
      }}
      onDoubleClick={(event) => event.stopPropagation()}
      aria-label={`${name}，${embedded ? '编辑位置，' : ''}${TIMER_STATUS_LABELS[status]}${isIdle ? '' : `，${duration}`}`}
    >
      <strong className="w-full shrink-0 truncate text-xs font-black leading-4 tracking-tight">
        {name}
      </strong>
      {groupName ? (
        <span className="max-w-full truncate rounded-full bg-violet-950/20 px-1.5 py-0.5 text-[10px] font-black">
          {groupName}
        </span>
      ) : null}

      {isIdle ? (
        <span className="w-fit shrink-0 rounded-full bg-white/60 px-1 py-0.5 text-xs font-bold">
          {TIMER_STATUS_LABELS[status]}
        </span>
      ) : (
        <>
          <span className="font-mono text-[clamp(14px,1.8vw,28px)] font-black leading-none tabular-nums">
            {duration}
          </span>
          <span className="flex min-w-0 items-center gap-1">
            <span className="shrink-0 rounded-full bg-black/15 px-1 py-0.5 text-xs font-bold text-white">
              {TIMER_STATUS_LABELS[status]}
            </span>
            <span className="table-node-time truncate text-xs font-semibold opacity-80">
              {status === 'paused' ? '冻结 · ' : ''}
              {formatStoreTime(startTime, timezone)}
              {' → '}
              {formatStoreTime(effectiveEndTime, timezone)}
            </span>
          </span>
        </>
      )}
    </button>
  );
});
