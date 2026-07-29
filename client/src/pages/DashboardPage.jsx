import { Armchair, Clock3, Construction, TimerReset } from 'lucide-react';
import { useStore } from '../contexts/StoreContext.jsx';

export function DashboardPage() {
  const { currentStore } = useStore();

  return (
    <div className="mx-auto max-w-6xl">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-ember-600">
            Live floor
          </p>
          <h1 className="mt-2 text-2xl font-bold tracking-tight text-ink-950 sm:text-3xl">
            {currentStore?.name ?? '桌台看板'}
          </h1>
          <p className="mt-2 text-sm text-stone-500">
            实时桌态与计时画布将在下一模块接入。
          </p>
        </div>
        {currentStore?.enabled === false ? (
          <span className="w-fit rounded-full bg-amber-100 px-3 py-1.5 text-xs font-semibold text-amber-800">
            当前为停用门店，只读模式
          </span>
        ) : null}
      </div>

      <div className="mt-7 grid gap-4 sm:grid-cols-3">
        {[
          [Armchair, '全部桌台', '—'],
          [Clock3, '正在计时', '—'],
          [TimerReset, '今日清台', '—'],
        ].map(([Icon, label, value]) => (
          <div
            key={label}
            className="rounded-3xl border border-stone-200 bg-white p-5 shadow-card"
          >
            <div className="flex items-center justify-between">
              <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-ember-50 text-ember-600">
                <Icon size={20} />
              </span>
              <span className="text-2xl font-bold text-ink-950">{value}</span>
            </div>
            <p className="mt-4 text-sm font-medium text-stone-500">{label}</p>
          </div>
        ))}
      </div>

      <div className="mt-6 flex min-h-[22rem] items-center justify-center rounded-[2rem] border border-dashed border-stone-300 bg-white/60 p-8 text-center">
        <div>
          <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-ink-900 text-ember-400">
            <Construction size={26} />
          </span>
          <h2 className="mt-5 text-lg font-semibold text-ink-950">
            桌台看板建设中
          </h2>
          <p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-stone-500">
            前端地基已经就绪。下一块将把门店布局、桌台状态和计时轮询接入这里。
          </p>
        </div>
      </div>
    </div>
  );
}
