import { ShieldX } from 'lucide-react';

export function AccessDeniedPage() {
  return (
    <div className="mx-auto flex min-h-[60vh] max-w-xl items-center justify-center text-center">
      <div>
        <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-3xl bg-red-50 text-red-600">
          <ShieldX size={28} />
        </span>
        <h1 className="mt-5 text-2xl font-bold text-ink-950">无权限访问</h1>
        <p className="mt-3 text-sm leading-6 text-stone-500">
          当前账号没有查看此页面的权限。如需处理，请联系系统管理员。
        </p>
      </div>
    </div>
  );
}
