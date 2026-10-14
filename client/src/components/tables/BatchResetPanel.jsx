import { useEffect, useMemo, useRef, useState } from 'react';
import { CheckSquare, RotateCcw, Square, X } from 'lucide-react';
import clsx from 'clsx';
import { STORE_CHANGING_EVENT } from '../../contexts/StoreContext.jsx';
import { formatTimerDuration } from '../../utils/timerDisplay.js';

function itemNameLabel(item) {
  return item.memberNames.length > 1
    ? item.memberNames.join('+')
    : item.label;
}

/**
 * 运营批量清台面板：只列出当前范围内已到时的计时（按 timerId 去重）。
 * 打开时默认勾选当时的清单；之后实时新到时的项目只出现在列表中，
 * 不会自动加入已选名单。确认时冻结名单，提交只针对冻结名单。
 */
export function BatchResetPanel({
  open,
  scopeLabel,
  confirmScope,
  items,
  busy = false,
  onSubmit,
  onClose,
}) {
  const [selectedIds, setSelectedIds] = useState(() => new Set());
  const [confirmItems, setConfirmItems] = useState(null);
  const itemsRef = useRef(items);
  itemsRef.current = items;

  useEffect(() => {
    if (!open) {
      setConfirmItems(null);
      return;
    }
    setSelectedIds(new Set(itemsRef.current.map((item) => item.timerId)));
    setConfirmItems(null);
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    const handleKeyDown = (event) => {
      if (event.key !== 'Escape' || busy) return;
      if (confirmItems) setConfirmItems(null);
      else onClose();
    };
    const handleStoreChange = () => onClose();
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener(STORE_CHANGING_EVENT, handleStoreChange);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener(STORE_CHANGING_EVENT, handleStoreChange);
    };
  }, [busy, confirmItems, onClose, open]);

  const selectedItems = useMemo(
    () => items.filter((item) => selectedIds.has(item.timerId)),
    [items, selectedIds],
  );
  const selectedTableCount = selectedItems.reduce(
    (sum, item) => sum + item.tableCount,
    0,
  );
  const allSelected = items.length > 0
    && items.every((item) => selectedIds.has(item.timerId));

  if (!open) return null;

  const toggle = (timerId) => {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(timerId)) next.delete(timerId);
      else next.add(timerId);
      return next;
    });
  };
  const confirmTableCount = (confirmItems ?? []).reduce(
    (sum, item) => sum + item.tableCount,
    0,
  );

  return (
    <div
      className="fixed inset-0 z-[90] flex items-end justify-center bg-ink-950/55 p-0 backdrop-blur-sm sm:items-center sm:p-4"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !busy) onClose();
      }}
    >
      <div
        className="flex max-h-[min(100dvh,48rem)] w-full max-w-lg flex-col overflow-hidden rounded-t-3xl border border-white/60 bg-white shadow-soft sm:rounded-3xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="batch-reset-title"
      >
        <div className="flex items-start gap-3 border-b border-stone-100 px-5 py-4">
          <div className="min-w-0 flex-1">
            <h2 id="batch-reset-title" className="text-lg font-black text-ink-950">
              {confirmItems ? '确认批量清台' : '批量清台'}
            </h2>
            <p className="mt-1 text-xs font-bold text-stone-500">
              {scopeLabel}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="rounded-xl p-2 text-stone-400 transition hover:bg-stone-100 hover:text-stone-700 disabled:opacity-40"
            aria-label="关闭"
          >
            <X size={18} />
          </button>
        </div>

        {confirmItems ? (
          <>
            <div className="px-5 pt-4 text-sm leading-6 text-stone-700">
              <p className="font-black text-ink-950">
                确认结束{confirmScope}选中的 {confirmItems.length} 个计时，共 {confirmTableCount} 张桌？
              </p>
              <p className="mt-1 text-xs text-stone-500">
                清台后桌台恢复空闲，本次计时写入历史记录；拼桌绑定保留。
              </p>
            </div>
            <div
              data-potx-touch-scroll
              className="touch-scroll-region mx-5 my-3 min-h-0 flex-1 overflow-y-auto rounded-2xl border border-stone-200 bg-stone-50 px-3 py-2 text-sm font-bold text-ink-900"
            >
              名单：{confirmItems.map(itemNameLabel).join('、')}
            </div>
            <div className="flex justify-end gap-3 border-t border-stone-100 px-5 py-4">
              <button
                type="button"
                onClick={() => setConfirmItems(null)}
                disabled={busy}
                className="min-h-11 rounded-xl border border-stone-200 px-4 text-sm font-bold text-stone-700 transition hover:bg-stone-50 disabled:opacity-40"
              >
                返回修改
              </button>
              <button
                type="button"
                onClick={async () => {
                  // 全部跳过或请求失败时回到选择清单，列表随快照刷新。
                  const done = await onSubmit(confirmItems);
                  if (!done) setConfirmItems(null);
                }}
                disabled={busy}
                className="min-h-11 rounded-xl bg-red-600 px-4 text-sm font-black text-white transition hover:bg-red-700 disabled:opacity-60"
              >
                {busy ? '正在清台…' : '确认清台'}
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-2 px-5 pt-3">
              <button
                type="button"
                onClick={() => setSelectedIds(new Set(items.map((item) => item.timerId)))}
                disabled={!items.length || allSelected}
                className="min-h-10 rounded-xl border border-stone-200 bg-white px-3 text-xs font-black text-ink-900 disabled:opacity-40"
              >
                全选当前已到时
              </button>
              <button
                type="button"
                onClick={() => setSelectedIds(new Set())}
                disabled={!selectedItems.length}
                className="min-h-10 rounded-xl border border-stone-200 bg-white px-3 text-xs font-black text-stone-600 disabled:opacity-40"
              >
                清空选择
              </button>
            </div>
            <div
              data-potx-touch-scroll
              className="touch-scroll-region mx-5 my-3 min-h-0 flex-1 overflow-y-auto"
            >
              {items.length === 0 ? (
                <p className="rounded-2xl border border-dashed border-stone-200 px-4 py-8 text-center text-sm font-bold text-stone-500">
                  当前范围没有已到时的计时
                </p>
              ) : (
                <ul className="space-y-2">
                  {items.map((item) => {
                    const checked = selectedIds.has(item.timerId);
                    return (
                      <li key={item.timerId}>
                        <button
                          type="button"
                          role="checkbox"
                          aria-checked={checked}
                          onClick={() => toggle(item.timerId)}
                          className={clsx(
                            'flex min-h-12 w-full items-center gap-3 rounded-2xl border px-3 py-2 text-left transition',
                            checked
                              ? 'border-red-300 bg-red-50'
                              : 'border-stone-200 bg-white hover:bg-stone-50',
                          )}
                        >
                          {checked
                            ? <CheckSquare size={20} className="shrink-0 text-red-600" />
                            : <Square size={20} className="shrink-0 text-stone-400" />}
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-black text-ink-950">
                              {item.label}
                            </span>
                            {item.memberNames.length > 1 ? (
                              <span className="block truncate text-xs font-bold text-stone-500">
                                拼桌 · {item.memberNames.join('、')} · {item.tableCount} 张桌
                              </span>
                            ) : null}
                          </span>
                          <span className="shrink-0 font-mono text-sm font-black tabular-nums text-red-700">
                            {item.overtimeSeconds > 0
                              ? `超时 ${formatTimerDuration(item.overtimeSeconds, { overtime: true })}`
                              : '已到时'}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
            <div className="border-t border-stone-100 px-5 py-4">
              <button
                type="button"
                onClick={() => setConfirmItems(selectedItems)}
                disabled={busy || selectedItems.length === 0}
                className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-red-600 px-4 text-sm font-black text-white transition hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <RotateCcw size={16} />
                {busy
                  ? '正在清台…'
                  : `清台已选（${selectedItems.length} 个计时 / ${selectedTableCount} 张桌）`}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
