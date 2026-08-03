import { NavLink } from 'react-router';
import clsx from 'clsx';
import { useAuth } from '../../contexts/AuthContext.jsx';
import { navigationForRole } from '../../utils/navigation.js';

export function MobileBottomNavigation() {
  const { user } = useAuth();
  const items = navigationForRole(user.role).slice(0, 4);

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 grid border-t border-stone-200 bg-white/95 px-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-2 shadow-[0_-12px_30px_-24px_rgba(16,24,21,0.45)] backdrop-blur xl:hidden"
      style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }}
      aria-label="移动端导航"
    >
      {items.map((item) => {
        const Icon = item.icon;

        return (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === '/'}
            className={({ isActive }) => clsx(
              'flex min-w-0 flex-col items-center gap-1 rounded-xl px-1 py-1.5 text-[11px] font-medium transition',
              isActive ? 'text-ember-600' : 'text-stone-500',
            )}
          >
            <Icon size={20} />
            <span className="max-w-full truncate">
              {item.shortLabel ?? item.label}
            </span>
          </NavLink>
        );
      })}
    </nav>
  );
}

export function MobileDrawer({ open, onClose }) {
  const { user } = useAuth();
  const items = navigationForRole(user.role);

  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 xl:hidden">
      <button
        type="button"
        className="absolute inset-0 bg-ink-950/55 backdrop-blur-sm"
        onClick={onClose}
        aria-label="关闭导航"
      />
      <div className="absolute inset-y-0 left-0 w-[min(19rem,86vw)] bg-ink-900 p-5 text-white shadow-soft">
        <div className="flex h-12 items-center gap-3 px-2">
          <img
            src="/potxpress-logo.png"
            alt="PotXpress 小锅快线"
            className="h-9 w-12 rounded-xl object-cover"
          />
          <div>
            <p className="text-sm font-semibold">PotXpress</p>
            <p className="text-xs text-stone-400">桌位计时工作台</p>
          </div>
        </div>
        <nav className="mt-6 space-y-1" aria-label="全部导航">
          {items.map((item) => {
            const Icon = item.icon;

            return (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === '/'}
                onClick={onClose}
                className={({ isActive }) => clsx(
                  'flex items-center gap-3 rounded-2xl px-3 py-3 text-sm font-medium',
                  isActive
                    ? 'bg-white text-ink-950'
                    : 'text-stone-300 hover:bg-white/10',
                )}
              >
                <Icon size={19} />
                {item.label}
              </NavLink>
            );
          })}
        </nav>
      </div>
    </div>
  );
}
