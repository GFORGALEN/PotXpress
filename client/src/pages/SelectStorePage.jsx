import { Store } from 'lucide-react';
import { useStore } from '../contexts/StoreContext.jsx';

export function SelectStorePage() {
  const { stores, selectStore } = useStore();
  const enabledStores = stores.filter((store) => store.enabled);

  return (
    <div className="mx-auto flex min-h-[60vh] max-w-xl items-center justify-center">
      <div className="w-full rounded-[2rem] border border-stone-200 bg-white p-7 text-center shadow-card">
        <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-ember-50 text-ember-600">
          <Store size={25} />
        </span>
        <h1 className="mt-5 text-xl font-bold text-ink-950">请先选择门店</h1>
        <p className="mt-2 text-sm leading-6 text-stone-500">
          系统管理员需要明确选择门店后，才能进入桌台、记录和设置页面。
        </p>
        {enabledStores.length > 0 ? (
          <div className="mt-6 grid gap-2">
            {enabledStores.map((store) => (
              <button
                key={store.id}
                type="button"
                onClick={() => selectStore(store.id)}
                className="rounded-2xl border border-stone-200 px-4 py-3 text-left text-sm font-semibold text-ink-900 transition hover:border-ember-300 hover:bg-ember-50"
              >
                {store.name}
              </button>
            ))}
          </div>
        ) : (
          <p className="mt-6 rounded-2xl bg-stone-50 px-4 py-3 text-sm text-stone-500">
            当前没有启用中的门店，请先前往“门店管理”创建或启用门店。
          </p>
        )}
      </div>
    </div>
  );
}
