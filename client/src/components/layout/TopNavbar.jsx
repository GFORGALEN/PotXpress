import { useEffect, useMemo, useRef, useState } from 'react';
import {
  BellRing,
  ArrowRightLeft,
  ChevronDown,
  LogOut,
  Menu,
  Volume2,
  VolumeX,
  KeyRound,
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext.jsx';
import { useStore } from '../../contexts/StoreContext.jsx';
import { ROLE_LABELS } from '../../utils/navigation.js';
import { formatStoreDisplayName } from '../../utils/storeSelection.js';
import { useSound } from '../../contexts/SoundContext.jsx';
import { ChangePasswordDialog } from '../auth/ChangePasswordDialog.jsx';

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
  const [passwordDialogOpen, setPasswordDialogOpen] = useState(false);
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
    <>
    <header className="relative z-30 flex h-20 shrink-0 items-center gap-3 border-b border-stone-200 bg-white/95 px-3 backdrop-blur sm:px-5 lg:px-7">
      <button
        type="button"
        onClick={onOpenMenu}
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-stone-200 text-ink-900 transition hover:bg-stone-50 xl:hidden"
        aria-label="打开导航"
      >
        <Menu size={20} />
      </button>

      <div className="flex min-w-0 flex-1 items-center gap-3">
        <img
          src="/potxpress-logo.png?v=3"
          alt="PotXpress 小锅快线"
          className="hidden h-12 w-auto shrink-0 rounded-xl object-contain sm:block"
        />
        <div className="min-w-0">
          <p className="truncate text-sm font-bold tracking-tight text-ink-950 sm:text-base">
            PotXpress
            <span className="hidden font-medium text-stone-400 xl:inline">
              {' '}· 桌位计时
            </span>
          </p>
          {user.role === 'system_admin' ? (
            <label className="mt-1 flex min-w-0 cursor-pointer items-center gap-2 rounded-xl border border-sky-200 bg-sky-50 px-2.5 py-1.5 text-xs text-sky-900 shadow-sm transition hover:border-sky-300 hover:bg-sky-100">
              <ArrowRightLeft className="shrink-0 text-ember-600" size={15} />
              <span className="hidden shrink-0 font-black sm:inline">切换门店</span>
              <select
                aria-label="选择门店"
                value={selectedStoreId ?? ''}
                disabled={loading || enabledStores.length === 0}
                onChange={(event) => selectStore(event.target.value)}
                className="min-w-0 max-w-[7rem] cursor-pointer appearance-none truncate bg-transparent pr-5 font-bold text-sky-950 outline-none disabled:cursor-default sm:max-w-[22rem] xl:max-w-[34rem]"
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
              <ChevronDown className="-ml-6 pointer-events-none shrink-0 text-ember-600" size={14} />
            </label>
          ) : (
            <p className="truncate text-xs font-medium text-stone-500" title={currentStore?.name}>
              {formatStoreDisplayName(currentStore?.name) || '正在读取门店'}
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
                onClick={() => {
                  setUserMenuOpen(false);
                  setPasswordDialogOpen(true);
                }}
                className="flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-sm font-medium text-stone-700 transition hover:bg-stone-50"
                role="menuitem"
              >
                <KeyRound size={17} />
                修改密码
              </button>
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
    <ChangePasswordDialog
      open={passwordDialogOpen}
      onClose={() => setPasswordDialogOpen(false)}
    />
    </>
  );
}
