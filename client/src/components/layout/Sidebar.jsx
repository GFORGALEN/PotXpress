import { NavLink } from 'react-router';
import clsx from 'clsx';
import { navigationForRole } from '../../utils/navigation.js';
import { useAuth } from '../../contexts/AuthContext.jsx';

export function Sidebar() {
  const { user } = useAuth();
  const items = navigationForRole(user.role);

  return (
    <aside className="hidden w-60 shrink-0 border-r border-stone-200 bg-white px-3 py-5 text-ink-900 xl:block">
      <p className="px-3 pb-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-stone-400">
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
                'flex min-h-11 items-center gap-3 rounded-2xl px-3 py-2.5 text-sm font-medium transition',
                isActive
                  ? 'border border-[#eadb62] bg-[#fff8c7] text-ink-950 shadow-card'
                  : 'border border-transparent text-stone-600 hover:bg-stone-100 hover:text-ink-950',
              )}
            >
              <Icon size={19} strokeWidth={2} />
              <span>{item.label}</span>
            </NavLink>
          );
        })}
      </nav>
    </aside>
  );
}
