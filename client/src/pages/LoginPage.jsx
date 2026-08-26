import { useEffect, useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router';
import {
  ArrowRight,
  LockKeyhole,
  UserRound,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext.jsx';
import { ErrorMessage } from '../components/common/ErrorMessage.jsx';
import { defaultAuthenticatedPath } from '../utils/frontDeskMode.js';

const DEMO_ACCOUNTS = [
  { role: '系统管理员', username: 'admin', password: 'admin123' },
  { role: '门店管理员', username: 'demo_admin', password: 'admin123' },
  { role: '门店员工', username: 'demo_staff', password: 'staff123' },
];

export function LoginPage() {
  const {
    isAuthenticated,
    loading: authLoading,
    login,
    user,
  } = useAuth();
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
    return <Navigate to={defaultAuthenticatedPath(user?.role)} replace />;
  }

  const handleSubmit = async (event) => {
    event.preventDefault();
    setSubmitting(true);
    setError('');

    try {
      const loggedInUser = await login(username, password);
      const destination = typeof location.state?.from === 'string'
        ? location.state.from
        : defaultAuthenticatedPath(loggedInUser.role);
      navigate(destination, { replace: true });
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="relative min-h-full overflow-hidden bg-[#fff7ef] px-4 py-5 sm:px-6 lg:px-10 lg:py-8">
      <div className="login-grid absolute inset-0 opacity-[0.035]" />
      <div className="absolute -left-32 top-1/3 h-96 w-96 rounded-full bg-ember-500/25 blur-3xl" />
      <div className="absolute -right-32 -top-24 h-[32rem] w-[32rem] rounded-full bg-amber-300/35 blur-3xl" />

      <div className="relative mx-auto flex min-h-[calc(100vh-4rem)] max-w-[27rem] items-center justify-center">
        <section className="flex w-full flex-col justify-center py-3">
          <div className="w-full rounded-[2rem] border border-white/80 bg-[#fffdfa] p-6 shadow-[0_28px_70px_-36px_rgba(93,47,9,.32)] sm:p-8">
            <div className="flex flex-col items-center text-center">
              <img
                src="/potxpress-logo.png?v=3"
                alt="PotXpress 小锅快线"
                className="h-auto w-36 rounded-2xl object-contain shadow-card"
              />
              <p className="mt-3 text-sm font-bold text-stone-500">门店工作台</p>
            </div>

            <div className="mt-7">
              <h2 className="text-2xl font-black tracking-tight text-ink-950">
                登录
              </h2>
            </div>

            <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
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
        </section>
      </div>
    </main>
  );
}
