import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router';
import { Flame, LoaderCircle, TriangleAlert } from 'lucide-react';
import { kioskLogin } from '../api/auth.js';
import { storeToken } from '../api/client.js';

// 店员免登录入口：/kiosk/:key
// 用门店专属 key 换取店员会话后整页跳转画布，
// 书签/桌面图标收藏此地址即可永久直达。
export function KioskPage() {
  const { key = '' } = useParams();
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;

    async function enter() {
      try {
        const result = await kioskLogin(key);
        storeToken(result.token);
        window.location.replace('/');
      } catch (requestError) {
        if (active) {
          setError(requestError.message || '店员入口链接无效，请联系店长');
        }
      }
    }

    if (key) {
      enter();
    } else {
      setError('店员入口链接无效，请联系店长');
    }

    return () => {
      active = false;
    };
  }, [key]);

  return (
    <main className="relative flex min-h-full flex-col items-center justify-center overflow-hidden bg-ink-950 px-6 py-12 text-center">
      <div className="login-grid absolute inset-0 opacity-25" />
      <div className="relative flex flex-col items-center gap-4">
        <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-ember-500/15 text-ember-300">
          <Flame className="h-7 w-7" aria-hidden="true" />
        </span>
        {error ? (
          <>
            <TriangleAlert className="h-8 w-8 text-amber-400" aria-hidden="true" />
            <p className="max-w-xs text-sm leading-6 text-ink-100">{error}</p>
            <Link
              to="/login"
              className="mt-2 rounded-lg border border-ink-600 px-4 py-2 text-sm text-ink-200 transition hover:border-ink-400 hover:text-white"
            >
              前往账号登录
            </Link>
          </>
        ) : (
          <>
            <LoaderCircle className="h-8 w-8 animate-spin text-ember-300" aria-hidden="true" />
            <p className="text-sm text-ink-200">正在进入桌台画布…</p>
          </>
        )}
      </div>
    </main>
  );
}
