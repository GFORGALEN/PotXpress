import { Inbox } from 'lucide-react';

export function EmptyState({
  title = '暂无内容',
  description = '这里还没有可显示的数据。',
  action,
}) {
  return (
    <div className="rounded-3xl border border-dashed border-stone-300 bg-white/70 px-6 py-14 text-center">
      <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-stone-100 text-stone-500">
        <Inbox size={22} />
      </span>
      <h2 className="mt-4 text-base font-semibold text-ink-900">{title}</h2>
      <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-stone-500">
        {description}
      </p>
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}
