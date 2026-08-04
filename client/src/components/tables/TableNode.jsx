import { memo, useRef } from 'react';
import clsx from 'clsx';
import {
  AlertTriangle,
  CirclePause,
  Clock3,
  Sparkles,
} from 'lucide-react';
import {
  formatStoreTime,
  formatTimerDuration,
  TIMER_STATUS_LABELS,
} from '../../utils/timerDisplay.js';

const STATUS_STYLES = Object.freeze({
  idle: {
    shell: 'border-slate-300 bg-white text-slate-800 shadow-[0_10px_24px_-16px_rgba(15,23,42,.28)]',
    accent: 'bg-slate-400',
    badge: 'bg-slate-100 text-slate-600',
    Icon: Sparkles,
  },
  running: {
    shell: 'border-emerald-400 bg-emerald-50 text-emerald-950 shadow-[0_14px_30px_-16px_rgba(22,185,121,.55)]',
    accent: 'bg-emerald-500',
    badge: 'bg-emerald-100 text-emerald-800',
    Icon: Clock3,
  },
  paused: {
    shell: 'border-slate-400 bg-slate-100 text-slate-900 shadow-[0_14px_30px_-16px_rgba(100,116,139,.5)]',
    accent: 'bg-slate-500',
    badge: 'bg-slate-200 text-slate-700',
    Icon: CirclePause,
  },
  warning: {
    shell: 'table-warning border-amber-400 bg-amber-50 text-amber-950 shadow-[0_14px_30px_-14px_rgba(245,166,35,.55)]',
    accent: 'bg-amber-500',
    badge: 'bg-amber-100 text-amber-900',
    Icon: AlertTriangle,
  },
  overtime: {
    shell: 'table-overtime border-red-500 bg-red-50 text-red-950 shadow-[0_16px_34px_-14px_rgba(239,68,68,.58)]',
    accent: 'bg-red-500',
    badge: 'bg-red-100 text-red-800',
    Icon: AlertTriangle,
  },
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
  onTableContextMenu,
  embedded = false,
  selected = false,
  shape = 'rectangle',
  groupName = null,
}) {
  const longPressTimerRef = useRef(null);
  const suppressClickRef = useRef(false);
  const isIdle = status === 'idle';
  const duration = formatTimerDuration(
    status === 'overtime' ? overtimeSeconds : remainingSeconds,
  );
  const config = STATUS_STYLES[status];
  const StatusIcon = config.Icon;

  return (
    <button
      type="button"
      data-table-node={tableId}
      data-table-status={status}
      className={clsx(
        'table-node group block select-none overflow-visible border-2 text-center outline-none transition-[transform,filter,box-shadow,border-color] duration-200 focus-visible:ring-4 focus-visible:ring-emerald-300 focus-visible:ring-offset-2 active:scale-[.98] md:hover:-translate-y-0.5',
        shape === 'round' ? 'rounded-full' : 'rounded-[1rem]',
        shape === 'booth' && 'border-[3px] border-double',
        embedded ? 'h-full min-h-0 w-full' : 'absolute min-h-0',
        config.shell,
        highlighted && 'ring-4 ring-orange-300 ring-offset-2',
        selected && 'ring-4 ring-sky-500 ring-offset-2 ring-offset-white',
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
        if (suppressClickRef.current) {
          suppressClickRef.current = false;
          return;
        }
        onTableClick(tableId);
      }}
      onContextMenu={(event) => {
        if (!onTableContextMenu) return;
        event.preventDefault();
        event.stopPropagation();
        onTableContextMenu({
          tableId,
          clientX: event.clientX,
          clientY: event.clientY,
        });
      }}
      onPointerDown={(event) => {
        if (event.pointerType !== 'touch' || !onTableContextMenu) return;
        const { clientX, clientY } = event;
        longPressTimerRef.current = setTimeout(() => {
          suppressClickRef.current = true;
          onTableContextMenu({ tableId, clientX, clientY });
        }, 550);
      }}
      onPointerMove={() => {
        clearTimeout(longPressTimerRef.current);
      }}
      onPointerUp={() => clearTimeout(longPressTimerRef.current)}
      onPointerCancel={() => clearTimeout(longPressTimerRef.current)}
      onDoubleClick={(event) => event.stopPropagation()}
      aria-label={`${name}，${embedded ? '编辑位置，' : ''}${TIMER_STATUS_LABELS[status]}${isIdle ? '' : `，${status === 'overtime' ? '超时' : '剩余'} ${duration}`}`}
    >
      <span aria-hidden="true" className="table-seat table-seat-top" />
      <span aria-hidden="true" className="table-seat table-seat-right" />
      <span aria-hidden="true" className="table-seat table-seat-bottom" />
      <span aria-hidden="true" className="table-seat table-seat-left" />

      <span className="table-node-content">
        <span className={clsx('table-node-accent absolute rounded-full ring-1 ring-white/80', config.accent)} />
        <strong className="table-node-name max-w-full truncate font-black leading-none tracking-tight">
          {name}
        </strong>

        {isIdle ? (
          <span className={clsx('table-node-status inline-flex max-w-full min-w-0 items-center whitespace-nowrap rounded-full font-black', config.badge)}>
            <StatusIcon className="table-node-status-icon shrink-0" size={12} />
            <span className="truncate">空闲</span>
          </span>
        ) : (
          <>
            <span className="table-node-duration max-w-full truncate whitespace-nowrap font-mono font-black leading-none tabular-nums">
              {status === 'overtime' ? `超时 ${duration}` : duration}
            </span>
            <span className={clsx('table-node-status inline-flex max-w-full min-w-0 items-center truncate whitespace-nowrap rounded-full font-black', config.badge)}>
              <StatusIcon className="table-node-status-icon shrink-0" size={11} />
              <span className="truncate">{TIMER_STATUS_LABELS[status]}</span>
            </span>
            <span className="table-node-time max-w-full truncate font-semibold opacity-60">
              {formatStoreTime(startTime, timezone)} → {formatStoreTime(effectiveEndTime, timezone)}
            </span>
          </>
        )}
      </span>

      {groupName ? (
        <span className="absolute -right-1.5 -top-2 z-[2] max-w-[70%] truncate rounded-full bg-violet-600 px-1.5 py-0.5 text-[9px] font-black text-white shadow">
          {groupName}
        </span>
      ) : null}
    </button>
  );
});
