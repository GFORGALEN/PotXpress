import { TriangleAlert } from 'lucide-react';
import { useLayoutEditor } from '../../contexts/LayoutEditorContext.jsx';

export function LayoutConflictDialog() {
  const {
    mode,
    conflictDetails,
    loadLatest,
    saving,
  } = useLayoutEditor();

  if (mode !== 'conflict') {
    return null;
  }

  return (
    <div className="fixed inset-0 z-[95] flex items-center justify-center bg-ink-950/70 p-4 backdrop-blur-sm">
      <div
        className="w-full max-w-md rounded-3xl bg-white p-6 shadow-soft"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="layout-conflict-title"
      >
        <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-100 text-amber-700">
          <TriangleAlert size={24} />
        </span>
        <h2
          id="layout-conflict-title"
          className="mt-4 text-xl font-black text-ink-950"
        >
          布局已被其他用户更新
        </h2>
        <p className="mt-2 text-sm leading-6 text-stone-600">
          为避免覆盖他人的调整，当前草稿不能直接保存。
          {conflictDetails?.serverUpdatedAt
            ? ` 服务器更新时间：${new Date(conflictDetails.serverUpdatedAt).toLocaleString('zh-CN')}。`
            : ''}
        </p>
        <button
          type="button"
          onClick={loadLatest}
          disabled={saving}
          className="mt-6 min-h-11 w-full rounded-2xl bg-ink-900 px-4 text-sm font-black text-white disabled:opacity-50"
        >
          {saving ? '正在加载…' : '加载最新布局'}
        </button>
      </div>
    </div>
  );
}
