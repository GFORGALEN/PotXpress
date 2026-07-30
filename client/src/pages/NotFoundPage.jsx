import { Link } from 'react-router';
import { MapPinOff } from 'lucide-react';

export function NotFoundPage() {
  return (
    <div className="flex min-h-full items-center justify-center bg-canvas p-6 text-center">
      <div>
        <MapPinOff className="mx-auto text-stone-400" size={42} />
        <p className="mt-5 font-mono text-sm text-ember-600">404</p>
        <h1 className="mt-2 text-2xl font-bold text-ink-950">页面不存在</h1>
        <p className="mt-2 text-sm text-stone-500">
          你访问的地址可能已移动或输入有误。
        </p>
        <Link
          to="/"
          className="mt-6 inline-flex rounded-xl bg-ink-900 px-4 py-2.5 text-sm font-semibold text-white"
        >
          返回工作台
        </Link>
      </div>
    </div>
  );
}
