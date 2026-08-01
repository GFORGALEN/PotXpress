import {
  AlertTriangle,
  Armchair,
  CirclePause,
  Clock3,
  Search,
  Sparkles,
} from 'lucide-react';
import clsx from 'clsx';
import { TIMER_STATUS_LABELS } from '../../utils/timerDisplay.js';

const FILTERS = [
  { value: 'all', label: '全部桌台', count: 'total', Icon: Armchair, tone: 'text-ink-900', active: 'border-ink-900 bg-ink-900 text-white' },
  { value: 'idle', label: '空闲', count: 'idle', Icon: Sparkles, tone: 'text-slate-700', active: 'border-slate-500 bg-slate-700 text-white' },
  { value: 'running', label: TIMER_STATUS_LABELS.running, count: 'running', Icon: Clock3, tone: 'text-emerald-700', active: 'border-emerald-500 bg-emerald-600 text-white' },
  { value: 'warning', label: TIMER_STATUS_LABELS.warning, count: 'warning', Icon: AlertTriangle, tone: 'text-amber-700', active: 'border-amber-500 bg-amber-500 text-white' },
  { value: 'overtime', label: TIMER_STATUS_LABELS.overtime, count: 'overtime', Icon: AlertTriangle, tone: 'text-red-700', active: 'border-red-500 bg-red-500 text-white' },
  { value: 'paused', label: TIMER_STATUS_LABELS.paused, count: 'paused', Icon: CirclePause, tone: 'text-slate-600', active: 'border-slate-500 bg-slate-500 text-white' },
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
    <section className="rounded-[1.25rem] border border-stone-200/80 bg-white p-2.5 shadow-card sm:p-3" aria-label="桌台运营概览">
      <div className="flex gap-2 overflow-x-auto pb-1" aria-label="桌台状态筛选">
        {FILTERS.map(({ value, label, count, Icon, tone, active }) => (
          <button
            key={value}
            type="button"
            onClick={() => onStatusChange(value)}
            className={clsx(
              'flex min-h-[3.75rem] min-w-[7.4rem] shrink-0 items-center gap-2.5 rounded-2xl border px-3 text-left transition active:scale-[.98] sm:min-w-[8.4rem]',
              status === value
                ? active
                : `border-stone-200 bg-stone-50/80 hover:border-stone-300 ${tone}`,
            )}
            aria-pressed={status === value}
          >
            <span className={clsx('flex h-9 w-9 shrink-0 items-center justify-center rounded-xl', status === value ? 'bg-white/15' : 'bg-white shadow-sm')}>
              <Icon size={18} />
            </span>
            <span>
              <span className="block text-[11px] font-bold opacity-75">{label}</span>
              <span className="block text-xl font-black leading-6 tabular-nums">{counts[count]}</span>
            </span>
          </button>
        ))}
      </div>

      <div className="mt-2 flex gap-2 border-t border-stone-100 pt-2">
        {areas.length > 1 ? (
          <select
            value={area}
            onChange={(event) => onAreaChange(event.target.value)}
            className="min-h-11 max-w-36 rounded-xl border border-stone-200 bg-white px-3 text-sm font-bold text-stone-600"
            aria-label="按区域筛选桌台"
          >
            <option value="all">全部区域</option>
            {areas.map((value) => <option key={value} value={value}>{value}</option>)}
          </select>
        ) : null}
        <label className="relative block min-w-0 flex-1 sm:ml-auto sm:max-w-72">
          <span className="sr-only">搜索桌台名称</span>
          <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" size={16} />
          <input
            type="search"
            value={search}
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder="搜索桌台"
            className="min-h-11 w-full rounded-xl border border-stone-200 bg-white py-2.5 pl-9 pr-3 text-sm text-ink-900 outline-none transition placeholder:text-stone-400 focus:border-emerald-400 focus:ring-4 focus:ring-emerald-100"
          />
        </label>
      </div>
    </section>
  );
}
