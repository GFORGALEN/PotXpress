import { NavLink } from 'react-router';
import clsx from 'clsx';
import { navigationForRole } from '../../utils/navigation.js';
import { useAuth } from '../../contexts/AuthContext.jsx';

export function Sidebar() {
  const { user } = useAuth();
  const items = navigationForRole(user.role);

  return (
    <aside className="hidden w-56 shrink-0 border-r border-white/10 bg-ink-900 px-3 py-4 text-stone-200 xl:block">
      <p className="px-3 pb-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-stone-500">
        工作台
      </p>
      <nav className="space-y-1" aria-label="主导航">
        {items.map((item) => {
          const Icon = item.icon;

          return (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              className={({ isActive }) => clsx(
                'flex min-h-11 items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition',
                isActive
                  ? 'bg-white text-ink-950 shadow-card'
                  : 'text-stone-300 hover:bg-white/8 hover:text-white',
              )}
            >
              <Icon size={19} strokeWidth={2} />
              <span>{item.label}</span>
            </NavLink>
          );
        })}
      </nav>
      <div className="mt-6 rounded-xl border border-white/10 bg-white/5 p-3">
        <p className="text-xs font-semibold text-stone-200">快速提示</p>
        <p className="mt-2 text-xs leading-5 text-stone-400">
          门店数据会按当前选择隔离，切换门店时旧请求会自动取消。
        </p>
      </div>
    </aside>
  );
}
