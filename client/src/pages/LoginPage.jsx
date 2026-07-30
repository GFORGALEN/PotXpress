import { useEffect, useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router';
import {
  ArrowRight,
  Flame,
  LockKeyhole,
  ShieldCheck,
  UserRound,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext.jsx';
import { ErrorMessage } from '../components/common/ErrorMessage.jsx';

const DEMO_ACCOUNTS = [
  { role: '系统管理员', username: 'admin', password: 'admin123' },
  { role: '门店管理员', username: 'demo_admin', password: 'admin123' },
  { role: '门店员工', username: 'demo_staff', password: 'staff123' },
];

export function LoginPage() {
  const { isAuthenticated, loading: authLoading, login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const showDemoAccounts = (
    import.meta.env.DEV
    && import.meta.env.VITE_SHOW_DEMO_ACCOUNTS === 'true'
  );

  useEffect(() => {
    setError('');
  }, [username, password]);

  if (!authLoading && isAuthenticated) {
    return <Navigate to="/" replace />;
  }

  const handleSubmit = async (event) => {
    event.preventDefault();
    setSubmitting(true);
    setError('');

    try {
      await login(username, password);
      const destination = typeof location.state?.from === 'string'
        ? location.state.from
        : '/';
      navigate(destination, { replace: true });
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="relative min-h-full overflow-hidden bg-ink-950 px-4 py-8 sm:px-6 lg:py-12">
      <div className="login-grid absolute inset-0 opacity-25" />
      <div className="absolute -left-32 top-1/3 h-80 w-80 rounded-full bg-ember-500/20 blur-3xl" />
      <div className="absolute -right-32 -top-24 h-96 w-96 rounded-full bg-emerald-400/10 blur-3xl" />

      <div className="relative mx-auto grid min-h-[calc(100vh-4rem)] max-w-6xl items-center gap-10 lg:grid-cols-[1.05fr_0.95fr]">
        <section className="hidden max-w-xl text-white lg:block">
          <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-semibold text-ember-300">
            <ShieldCheck size={15} />
            门店计时 · 实时恢复 · 多角色协作
          </span>
          <h1 className="mt-7 text-5xl font-black leading-[1.08] tracking-[-0.04em]">
            每一张桌，
            <br />
            <span className="text-ember-400">时间都清清楚楚。</span>
          </h1>
          <p className="mt-6 max-w-lg text-base leading-8 text-stone-300">
            PotXpress 把桌位状态、用餐时间和门店操作集中到一个稳定工作台，
            即使刷新页面或重启服务，现场节奏依然连续。
          </p>
          <div className="mt-10 grid grid-cols-3 gap-3">
            {[
              ['01', '快速识别桌态'],
              ['02', '刷新仍可恢复'],
              ['03', '操作留有记录'],
            ].map(([number, label]) => (
              <div
                key={number}
                className="rounded-2xl border border-white/10 bg-white/[0.04] p-4"
              >
                <p className="font-mono text-xs text-ember-400">{number}</p>
                <p className="mt-3 text-sm font-medium text-stone-200">
                  {label}
                </p>
              </div>
            ))}
          </div>
        </section>

        <section className="mx-auto w-full max-w-md">
          <div className="rounded-[2rem] border border-white/60 bg-[#fffdf8] p-6 shadow-soft sm:p-8">
            <div className="flex items-center gap-3">
              <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-ink-900 text-ember-400 shadow-card">
                <Flame size={24} fill="currentColor" />
              </span>
              <div>
                <p className="text-lg font-black tracking-tight text-ink-950">
                  PotXpress
                </p>
                <p className="text-xs text-stone-500">桌位计时工作台</p>
              </div>
            </div>

            <div className="mt-8">
              <h2 className="text-2xl font-bold tracking-tight text-ink-950">
                欢迎回来
              </h2>
              <p className="mt-2 text-sm leading-6 text-stone-500">
                登录后继续管理当前门店的桌位节奏。
              </p>
            </div>

            <form className="mt-7 space-y-5" onSubmit={handleSubmit}>
              <label className="block">
                <span className="mb-2 block text-sm font-semibold text-ink-900">
                  用户名
                </span>
                <span className="flex items-center gap-3 rounded-2xl border border-stone-200 bg-white px-4 transition focus-within:border-ember-400 focus-within:ring-4 focus-within:ring-ember-100">
                  <UserRound className="shrink-0 text-stone-400" size={18} />
                  <input
                    value={username}
                    onChange={(event) => setUsername(event.target.value)}
                    className="h-12 min-w-0 flex-1 bg-transparent text-sm text-ink-950 outline-none placeholder:text-stone-400"
                    placeholder="请输入用户名"
                    autoComplete="username"
                    required
                    maxLength={32}
                  />
                </span>
              </label>
              <label className="block">
                <span className="mb-2 block text-sm font-semibold text-ink-900">
                  密码
                </span>
                <span className="flex items-center gap-3 rounded-2xl border border-stone-200 bg-white px-4 focus-within:border-ember-400 focus-within:ring-4 focus-within:ring-ember-100">
                  <LockKeyhole className="shrink-0 text-stone-400" size={18} />
                  <input
                    type="password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    className="h-12 min-w-0 flex-1 bg-transparent text-sm text-ink-950 outline-none placeholder:text-stone-400"
                    placeholder="请输入密码"
                    autoComplete="current-password"
                    required
                    maxLength={64}
                  />
                </span>
              </label>

              <ErrorMessage message={error} />

              <button
                type="submit"
                disabled={submitting}
                className="flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-ember-500 px-5 text-sm font-bold text-white shadow-[0_14px_28px_-14px_rgba(249,115,22,0.8)] transition hover:bg-ember-600 focus:outline-none focus:ring-4 focus:ring-ember-200 disabled:cursor-wait disabled:opacity-70"
              >
                {submitting ? '正在登录…' : '进入工作台'}
                {!submitting ? <ArrowRight size={18} /> : null}
              </button>
            </form>

            {showDemoAccounts ? (
              <div className="mt-7 border-t border-stone-200 pt-6">
                <p className="text-xs font-semibold text-stone-500">
                  演示账号 · 仅开发环境
                </p>
                <div className="mt-3 grid gap-2">
                  {DEMO_ACCOUNTS.map((account) => (
                    <button
                      key={account.username}
                      type="button"
                      onClick={() => {
                        setUsername(account.username);
                        setPassword(account.password);
                      }}
                      className="flex items-center justify-between rounded-xl border border-stone-200 bg-white px-3 py-2 text-left transition hover:border-ember-200 hover:bg-ember-50"
                    >
                      <span className="text-xs font-medium text-ink-900">
                        {account.role}
                      </span>
                      <code className="text-[11px] text-stone-500">
                        {account.username}
                      </code>
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
          <p className="mt-5 text-center text-xs text-stone-500">
            PotXpress 门店运营系统 · 安全会话最长 8 小时
          </p>
        </section>
      </div>
    </main>
  );
}
