import { useEffect, useRef, useState } from 'react';
import {
  CircleMinus,
  Clock3,
  Pause,
  Play,
  Plus,
  RotateCcw,
  X,
} from 'lucide-react';
import clsx from 'clsx';
import {
  adjustTimer,
  pauseTimer,
  resetTimer,
  resumeTimer,
  startTimer,
} from '../../api/timers.ts';
import { useStore } from '../../contexts/StoreContext.jsx';
import { useToast } from '../../contexts/ToastContext.jsx';
import {
  formatStoreTime,
  formatTimerDuration,
  TIMER_STATUS_LABELS,
} from '../../utils/timerDisplay.js';
import { ConfirmDialog } from '../common/ConfirmDialog.jsx';

const STATUS_BADGES = {
  idle: 'bg-slate-100 text-slate-700',
  running: 'bg-emerald-100 text-emerald-800',
  paused: 'bg-slate-200 text-slate-700',
  warning: 'bg-amber-100 text-amber-900',
  overtime: 'bg-red-100 text-red-800',
};

export function TableActionDialog({
  table,
  timezone,
  defaultDurationMinutes = 90,
  initialCustomOpen = false,
  onRefresh,
  onClose,
}) {
  const { selectedStoreId } = useStore();
  const { showToast } = useToast();
  const closeRef = useRef(null);
  const [busyAction, setBusyAction] = useState(null);
  const [customOpen, setCustomOpen] = useState(false);
  const [durationMinutes, setDurationMinutes] = useState(
    defaultDurationMinutes,
  );
  const [subtractReason, setSubtractReason] = useState('');
  const [confirmReset, setConfirmReset] = useState(false);

  useEffect(() => {
    if (!table) {
      return;
    }

    setCustomOpen(initialCustomOpen && table.status === 'idle');
    closeRef.current?.focus();
  }, [initialCustomOpen, table?.tableId, table?.status]);

  useEffect(() => {
    if (!table) {
      return undefined;
    }

    const handleKeyDown = (event) => {
      if (event.key === 'Escape' && !confirmReset) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [confirmReset, onClose, table?.tableId]);

  useEffect(() => {
    if (table?.status === 'idle') {
      setDurationMinutes(defaultDurationMinutes);
    }
  }, [defaultDurationMinutes, table?.status]);

  if (!table) {
    return null;
  }

  const runAction = async (name, request, successMessage) => {
    setBusyAction(name);

    try {
      await request();
      await onRefresh();
      showToast(successMessage, 'success');

      if (name === 'reset') {
        onClose();
      }
    } catch (error) {
      showToast(
        error.code === 'TIMER_STATE_CONFLICT'
          ? '桌台状态已被其他设备更新，已同步最新状态'
          : error.message,
        'error',
      );
      await onRefresh();
    } finally {
      setBusyAction(null);
    }
  };
  const disabled = Boolean(busyAction);
  const isOvertime = table.status === 'overtime';
  const duration = isOvertime
    ? formatTimerDuration(table.overtimeSeconds)
    : formatTimerDuration(table.remainingSeconds);

  return (
    <>
      <div className="pointer-events-none fixed inset-0 z-[90]">
        <button
          type="button"
          onClick={onClose}
          className="pointer-events-auto absolute inset-0 bg-ink-950/45 backdrop-blur-[2px] xl:hidden"
          aria-label="关闭桌台详情"
        />
        <div
          className="detail-panel-enter pointer-events-auto absolute inset-x-0 bottom-0 max-h-[88dvh] overflow-y-auto rounded-t-[2rem] border border-stone-200 bg-white p-5 shadow-2xl xl:inset-y-[4.5rem] xl:left-auto xl:right-0 xl:max-h-none xl:w-[23.5rem] xl:rounded-none xl:border-y-0 xl:border-r-0 xl:p-6"
          role="dialog"
          aria-modal="true"
          aria-labelledby="table-action-title"
        >
          <div className="sticky -top-5 z-10 -mx-1 flex items-start justify-between gap-4 border-b border-stone-100 bg-white/95 px-1 pb-4 pt-1 backdrop-blur xl:-top-6">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h2
                  id="table-action-title"
                  className="text-2xl font-black text-ink-950"
                >
                  {table.name}
                </h2>
                <span className={clsx(
                  'rounded-full px-2.5 py-1 text-xs font-black',
                  STATUS_BADGES[table.status],
                )}
                >
                  {TIMER_STATUS_LABELS[table.status]}
                </span>
              </div>
              <p className="mt-1 text-sm text-stone-500">
                {table.groupName
                  ? `拼桌统一计时 · ${table.groupName}`
                  : '桌台计时操作'}
              </p>
            </div>
            <button
              ref={closeRef}
              type="button"
              onClick={onClose}
              className="flex h-11 w-11 items-center justify-center rounded-xl text-stone-400 hover:bg-stone-100"
              aria-label="关闭桌台操作"
            >
              <X size={20} />
            </button>
          </div>

          {table.status !== 'idle' ? (
            <div className="mt-5 grid grid-cols-2 gap-3 rounded-2xl bg-stone-50 p-4 sm:grid-cols-3">
              <div>
                <p className="text-xs text-stone-400">剩余/超时</p>
                <p className={clsx('mt-1 font-mono text-xl font-black tabular-nums', isOvertime ? 'text-red-600' : 'text-ink-950')}>
                  {isOvertime ? `超时 ${duration}` : duration}
                </p>
              </div>
              <div>
                <p className="text-xs text-stone-400">开始</p>
                <p className="mt-1 text-sm font-bold text-stone-700">
                  {formatStoreTime(table.startTime, timezone)}
                </p>
              </div>
              <div>
                <p className="text-xs text-stone-400">预计结束</p>
                <p className="mt-1 text-sm font-bold text-stone-700">
                  {formatStoreTime(table.effectiveEndTime, timezone)}
                </p>
              </div>
            </div>
          ) : null}

          <div className="mt-4 grid grid-cols-2 gap-3 border-b border-stone-100 pb-4 text-sm">
            <div>
              <p className="text-xs text-stone-400">容纳人数</p>
              <p className="mt-1 font-bold text-stone-700">{table.capacity || 4} 人</p>
            </div>
            <div>
              <p className="text-xs text-stone-400">所属区域</p>
              <p className="mt-1 font-bold text-stone-700">{table.area || '未分区'}</p>
            </div>
            {table.note ? (
              <div className="col-span-2">
                <p className="text-xs text-stone-400">备注</p>
                <p className="mt-1 text-stone-700">{table.note}</p>
              </div>
            ) : null}
          </div>

          {table.timer?.adjustments?.length > 0 ? (
            <div className="mt-4">
              <p className="text-xs font-black uppercase tracking-wider text-stone-400">
                调整记录
              </p>
              <div className="mt-2 max-h-28 space-y-2 overflow-y-auto">
                {table.timer.adjustments.map((adjustment, index) => (
                  <div
                    key={`${adjustment.at}-${index}`}
                    className="rounded-xl bg-stone-50 px-3 py-2 text-xs text-stone-600"
                  >
                    <strong>
                      {adjustment.type === 'add' ? '+' : '-'}
                      {Math.round(adjustment.seconds / 60)} 分
                    </strong>
                    {' · '}
                    {adjustment.reason || '无备注'}
                    {' · '}
                    {adjustment.byNameSnapshot}
                    {' '}
                    {formatStoreTime(adjustment.at, timezone)}
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          <div className="mt-6 space-y-3">
            {table.status === 'idle' ? (
              <>
                {customOpen ? (
                  <label className="block">
                    <span className="text-sm font-bold text-stone-700">
                      自定义时长（5–480 分钟）
                    </span>
                    <input
                      type="number"
                      min="5"
                      max="480"
                      value={durationMinutes}
                      onChange={(event) => setDurationMinutes(
                        Number(event.target.value),
                      )}
                      className="mt-2 min-h-11 w-full rounded-xl border border-stone-200 px-3 outline-none focus:border-ember-400"
                    />
                  </label>
                ) : null}
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => runAction(
                    'start',
                    () => startTimer(
                      selectedStoreId,
                      table.tableId,
                      durationMinutes,
                    ),
                    '计时已开始',
                  )}
                  className="flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-emerald-600 px-4 text-sm font-black text-white disabled:opacity-50"
                >
                  <Play size={19} />
                  {busyAction === 'start'
                    ? '正在开始…'
                    : `开始计时（${durationMinutes} 分钟）`}
                </button>
                <button
                  type="button"
                  onClick={() => setCustomOpen((value) => !value)}
                  className="min-h-11 w-full rounded-xl border border-stone-200 text-sm font-bold text-stone-600"
                >
                  {customOpen ? '收起自定义时长' : '修改计时时长'}
                </button>
              </>
            ) : null}

            {['running', 'warning', 'overtime'].includes(table.status) ? (
              <>
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => runAction(
                    'pause',
                    () => pauseTimer(selectedStoreId, table.tableId),
                    '计时已暂停',
                  )}
                  className="flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-slate-700 px-4 text-sm font-black text-white disabled:opacity-50"
                >
                  <Pause size={19} />
                  暂停
                </button>
                <div className="grid grid-cols-3 gap-2">
                  {[5, 10, 30].map((minutes) => (
                    <button
                      key={minutes}
                      type="button"
                      disabled={disabled}
                      onClick={() => runAction(
                        `add-${minutes}`,
                        () => adjustTimer(
                          selectedStoreId,
                          table.tableId,
                          minutes * 60,
                        ),
                        `已加时 ${minutes} 分钟`,
                      )}
                      className="flex min-h-12 items-center justify-center gap-1 rounded-xl border border-emerald-200 bg-emerald-50 text-sm font-black text-emerald-800 disabled:opacity-50"
                    >
                      <Plus size={16} />
                      {minutes}
                    </button>
                  ))}
                </div>
                <label className="block">
                  <span className="text-xs font-bold text-stone-500">
                    减时备注（可选）
                  </span>
                  <input
                    value={subtractReason}
                    onChange={(event) => setSubtractReason(event.target.value)}
                    placeholder="例如：客人提前离店"
                    className="mt-1.5 min-h-11 w-full rounded-xl border border-stone-200 px-3 text-sm outline-none focus:border-ember-400"
                  />
                </label>
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => runAction(
                    'subtract',
                    () => adjustTimer(
                      selectedStoreId,
                      table.tableId,
                      -300,
                      subtractReason.trim() || undefined,
                    ),
                    '已减时 5 分钟',
                  )}
                  className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl border border-amber-200 bg-amber-50 text-sm font-black text-amber-900 disabled:opacity-50"
                >
                  <CircleMinus size={18} />
                  减时 5 分钟
                </button>
              </>
            ) : null}

            {table.status === 'paused' ? (
              <button
                type="button"
                disabled={disabled}
                onClick={() => runAction(
                  'resume',
                  () => resumeTimer(selectedStoreId, table.tableId),
                  '计时已继续',
                )}
                className="flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-emerald-600 px-4 text-sm font-black text-white disabled:opacity-50"
              >
                <Play size={19} />
                继续计时
              </button>
            ) : null}

            {table.status !== 'idle' ? (
              <button
                type="button"
                disabled={disabled}
                onClick={() => setConfirmReset(true)}
                className="flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl border border-red-200 bg-red-50 px-4 text-sm font-black text-red-700 disabled:opacity-50"
              >
                <RotateCcw size={18} />
                重置清台
              </button>
            ) : null}
          </div>

          <p className="mt-5 flex items-center gap-2 text-xs text-stone-400">
            <Clock3 size={14} />
            操作提交前会使用轮询获得的最新状态；冲突时自动重新同步。
          </p>
        </div>
      </div>

      <ConfirmDialog
        open={confirmReset}
        title={`确认重置 ${table.name}？`}
        description="客人已结账离店？将结束计时并写入今日记录。"
        confirmText="确认清台"
        danger
        onCancel={() => setConfirmReset(false)}
        onConfirm={async () => {
          setConfirmReset(false);
          await runAction(
            'reset',
            () => resetTimer(selectedStoreId, table.tableId),
            '已清台并写入今日记录',
          );
        }}
      />
    </>
  );
}
