import { Search } from 'lucide-react';
import clsx from 'clsx';
import { TIMER_STATUS_LABELS } from '../../utils/timerDisplay.js';

const FILTERS = [
  ['all', '全部'],
  ['idle', TIMER_STATUS_LABELS.idle],
  ['running', TIMER_STATUS_LABELS.running],
  ['paused', TIMER_STATUS_LABELS.paused],
  ['warning', TIMER_STATUS_LABELS.warning],
  ['overtime', TIMER_STATUS_LABELS.overtime],
];

export function TableFilter({
  status,
  search,
  counts,
  areas = [],
  area = 'all',
  onStatusChange,
  onAreaChange,
  onSearchChange,
}) {
  return (
    <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
      <div className="flex gap-2 overflow-x-auto pb-1" aria-label="桌台状态筛选">
        {FILTERS.map(([value, label]) => (
          <button
            key={value}
            type="button"
            onClick={() => onStatusChange(value)}
            className={clsx(
              'shrink-0 rounded-full border px-3 py-2 text-xs font-bold transition',
              status === value
                ? 'border-ink-900 bg-ink-900 text-white'
                : 'border-stone-200 bg-white text-stone-600 hover:border-stone-300',
            )}
            aria-pressed={status === value}
          >
            {label}
            <span className="ml-1.5 opacity-60">
              {value === 'all' ? counts.total : counts[value]}
            </span>
          </button>
        ))}
      </div>

      <div className="flex w-full gap-2 lg:w-auto">
      {areas.length > 1 ? (
        <select
          value={area}
          onChange={(event) => onAreaChange(event.target.value)}
          className="min-h-11 rounded-2xl border border-stone-200 bg-white px-3 text-sm font-bold text-stone-600"
          aria-label="按区域筛选桌台"
        >
          <option value="all">全部区域</option>
          {areas.map((value) => <option key={value} value={value}>{value}</option>)}
        </select>
      ) : null}
      <label className="relative block min-w-0 flex-1 lg:w-64">
        <span className="sr-only">搜索桌台名称</span>
        <Search
          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-stone-400"
          size={16}
        />
        <input
          type="search"
          value={search}
          onChange={(event) => onSearchChange(event.target.value)}
          placeholder="搜索桌台名称"
          className="w-full rounded-2xl border border-stone-200 bg-white py-2.5 pl-9 pr-3 text-sm text-ink-900 outline-none transition placeholder:text-stone-400 focus:border-ember-400 focus:ring-4 focus:ring-ember-100"
        />
      </label>
      </div>
    </div>
  );
}
