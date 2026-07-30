import { useEffect, useMemo, useRef, useState } from 'react';
import {
  BellRing,
  ChevronDown,
  Flame,
  LogOut,
  Menu,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext.jsx';
import { useStore } from '../../contexts/StoreContext.jsx';
import { ROLE_LABELS } from '../../utils/navigation.js';
import { useSound } from '../../contexts/SoundContext.jsx';

function StoreClock({ store }) {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const time = useMemo(() => {
    try {
      return new Intl.DateTimeFormat('zh-CN', {
        timeZone: store?.timezone,
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hourCycle: 'h23',
      }).format(now);
    } catch (error) {
      return new Intl.DateTimeFormat('zh-CN', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hourCycle: 'h23',
      }).format(now);
    }
  }, [now, store?.timezone]);

  return (
    <div className="text-center">
      <p className="font-mono text-base font-semibold tabular-nums text-ink-950 sm:text-lg">
        {time}
      </p>
      <p className="hidden text-[10px] font-medium uppercase tracking-[0.14em] text-stone-400 sm:block">
        {store ? store.timezone : '本机时间'}
      </p>
    </div>
  );
}

export function TopNavbar({ onOpenMenu }) {
  const { user, logout } = useAuth();
  const {
    stores,
    currentStore,
    selectedStoreId,
    selectStore,
    loading,
  } = useStore();
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const {
    authorized,
    localEnabled,
    reason: soundReason,
    alertCounts,
    enableSound,
    toggleLocalSound,
  } = useSound();
  const menuRef = useRef(null);
  const enabledStores = stores.filter((store) => store.enabled);

  useEffect(() => {
    const handlePointerDown = (event) => {
      if (!menuRef.current?.contains(event.target)) {
        setUserMenuOpen(false);
      }
    };
    const handleEscape = (event) => {
      if (event.key === 'Escape') {
        setUserMenuOpen(false);
      }
    };
    document.addEventListener('pointerdown', handlePointerDown);
    window.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      window.removeEventListener('keydown', handleEscape);
    };
  }, []);

  return (
    <header className="relative z-30 flex h-[4.5rem] shrink-0 items-center gap-3 border-b border-stone-200 bg-white/90 px-3 backdrop-blur sm:px-5 lg:px-7">
      <button
        type="button"
        onClick={onOpenMenu}
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-stone-200 text-ink-900 transition hover:bg-stone-50 lg:hidden"
        aria-label="打开导航"
      >
        <Menu size={20} />
      </button>

      <div className="flex min-w-0 flex-1 items-center gap-3">
        <span className="hidden h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-ink-900 text-ember-400 sm:flex">
          <Flame size={21} fill="currentColor" />
        </span>
        <div className="min-w-0 max-w-[5.5rem] sm:max-w-none">
          <p className="truncate text-sm font-bold tracking-tight text-ink-950 sm:text-base">
            PotXpress
            <span className="hidden font-medium text-stone-400 xl:inline">
              {' '}· 桌位计时
            </span>
          </p>
          {user.role === 'system_admin' ? (
            <label className="mt-0.5 flex items-center gap-1 text-xs text-stone-500">
              <span className="sr-only">选择门店</span>
              <select
                value={selectedStoreId ?? ''}
                disabled={loading || enabledStores.length === 0}
                onChange={(event) => selectStore(event.target.value)}
                className="max-w-[5.5rem] cursor-pointer appearance-none truncate bg-transparent pr-4 font-medium text-stone-600 outline-none disabled:cursor-default sm:max-w-[9.5rem]"
              >
                {enabledStores.length === 0 ? (
                  <option value="">暂无可用门店</option>
                ) : null}
                {enabledStores.map((store) => (
                  <option key={store.id} value={store.id}>
                    {store.name}
                  </option>
                ))}
              </select>
              <ChevronDown className="-ml-4 pointer-events-none" size={13} />
            </label>
          ) : (
            <p className="truncate text-xs text-stone-500">
              {currentStore?.name ?? '正在读取门店'}
            </p>
          )}
        </div>
      </div>

      <div className="shrink-0 sm:absolute sm:left-1/2 sm:-translate-x-1/2">
        <StoreClock store={currentStore} />
      </div>

      <div className="flex flex-none items-center justify-end gap-2 sm:ml-auto sm:flex-1">
        <button
          type="button"
          onClick={authorized ? toggleLocalSound : enableSound}
          className="relative hidden h-10 w-10 items-center justify-center rounded-xl border border-stone-200 text-stone-500 transition hover:border-ember-200 hover:bg-ember-50 hover:text-ember-600 sm:flex"
          title={soundReason}
          aria-label={authorized
            ? (localEnabled ? '关闭本机声音提醒' : '开启本机声音提醒')
            : '启用声音提醒'}
        >
          {localEnabled ? <Volume2 size={19} /> : <VolumeX size={19} />}
          {!authorized ? (
            <span className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full bg-red-500 ring-2 ring-white" />
          ) : null}
        </button>
        <button
          type="button"
          className="relative hidden h-10 w-10 items-center justify-center rounded-xl border border-stone-200 text-stone-500 sm:flex"
          title={`即将超时 ${alertCounts.warning}，已超时 ${alertCounts.overtime}`}
          aria-label={`提醒中心，即将超时 ${alertCounts.warning}，已超时 ${alertCounts.overtime}`}
        >
          <BellRing size={18} />
          {alertCounts.warning + alertCounts.overtime > 0 ? (
            <span className="absolute -right-2 -top-2 min-w-5 rounded-full bg-red-600 px-1 text-center text-[10px] font-black leading-5 text-white ring-2 ring-white">
              {alertCounts.warning + alertCounts.overtime}
            </span>
          ) : null}
        </button>

        <div className="relative" ref={menuRef}>
          <button
            type="button"
            onClick={() => setUserMenuOpen((value) => !value)}
            className="flex h-11 items-center gap-2 rounded-2xl border border-stone-200 bg-white px-2 text-left transition hover:bg-stone-50 sm:px-3"
            aria-expanded={userMenuOpen}
            aria-haspopup="menu"
          >
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-xl bg-ember-100 text-xs font-bold text-ember-700">
              {user.displayName.slice(0, 1)}
            </span>
            <span className="hidden min-w-0 sm:block">
              <span className="block max-w-28 truncate text-xs font-semibold text-ink-900">
                {user.displayName}
              </span>
              <span className="block text-[10px] text-stone-400">
                {ROLE_LABELS[user.role]}
              </span>
            </span>
            <ChevronDown className="hidden text-stone-400 sm:block" size={14} />
          </button>

          {userMenuOpen ? (
            <div
              className="absolute right-0 mt-2 w-52 rounded-2xl border border-stone-200 bg-white p-2 shadow-soft"
              role="menu"
            >
              <div className="border-b border-stone-100 px-3 py-2 sm:hidden">
                <p className="truncate text-sm font-semibold text-ink-900">
                  {user.displayName}
                </p>
                <p className="text-xs text-stone-400">
                  {ROLE_LABELS[user.role]}
                </p>
              </div>
              <button
                type="button"
                onClick={logout}
                className="mt-1 flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-sm font-medium text-red-600 transition hover:bg-red-50"
                role="menuitem"
              >
                <LogOut size={17} />
                退出登录
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </header>
  );
}
