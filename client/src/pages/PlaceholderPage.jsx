import { Construction } from 'lucide-react';

export function PlaceholderPage({ title, description }) {
  return (
    <div className="mx-auto max-w-5xl">
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-ember-600">
        Administration
      </p>
      <h1 className="mt-2 text-2xl font-bold tracking-tight text-ink-950 sm:text-3xl">
        {title}
      </h1>
      <div className="mt-7 flex min-h-[24rem] items-center justify-center rounded-[2rem] border border-stone-200 bg-white p-8 text-center shadow-card">
        <div>
          <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-stone-100 text-stone-500">
            <Construction size={25} />
          </span>
          <h2 className="mt-5 text-lg font-semibold text-ink-950">
            页面骨架已就绪
          </h2>
          <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-stone-500">
            {description}
          </p>
        </div>
      </div>
    </div>
  );
}
