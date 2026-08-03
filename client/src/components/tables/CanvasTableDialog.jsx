import { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';

const fieldClass = 'min-h-11 rounded-xl border border-stone-300 bg-white px-3 text-sm outline-none transition focus:border-ember-500 focus:ring-2 focus:ring-ember-100';

function initialForm(dialog) {
  const table = dialog?.table;
  return {
    name: table?.name ?? '',
    number: table?.number ?? '',
    shape: table?.shape ?? 'rectangle',
    capacity: table?.capacity ?? 4,
    area: table?.area ?? '大厅',
    note: table?.note ?? '',
    defaultDurationMinutes: table?.defaultDurationMinutes ?? '',
  };
}

export function CanvasTableDialog({ dialog, busy, onClose, onSubmit }) {
  const [form, setForm] = useState(() => initialForm(dialog));
  const nameRef = useRef(null);

  useEffect(() => {
    setForm(initialForm(dialog));
    if (dialog) requestAnimationFrame(() => nameRef.current?.focus());
  }, [dialog]);

  useEffect(() => {
    if (!dialog) return undefined;
    const handleKeyDown = (event) => {
      if (event.key === 'Escape' && !busy) onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [busy, dialog, onClose]);

  if (!dialog) return null;

  const title = {
    create: '新增桌台',
    duplicate: '复制桌台',
    edit: '编辑桌台',
  }[dialog.mode];

  return (
    <div
      className="fixed inset-0 z-[90] flex items-center justify-center bg-ink-950/55 p-4 backdrop-blur-sm"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !busy) onClose();
      }}
    >
      <form
        className="max-h-[calc(100vh-2rem)] w-full max-w-lg overflow-y-auto rounded-3xl border border-white/60 bg-white p-6 shadow-2xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="canvas-table-dialog-title"
        onSubmit={(event) => {
          event.preventDefault();
          onSubmit({
            ...form,
            name: form.name.trim(),
            number: Number(form.number),
            capacity: Number(form.capacity),
            area: form.area.trim(),
            note: form.note.trim() || null,
            defaultDurationMinutes: form.defaultDurationMinutes === ''
              ? null
              : Number(form.defaultDurationMinutes),
          });
        }}
      >
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 id="canvas-table-dialog-title" className="text-xl font-black text-ink-950">{title}</h2>
            <p className="mt-1 text-xs text-stone-500">保存后会立即同步到当前门店画布。</p>
          </div>
          <button type="button" disabled={busy} onClick={onClose} className="rounded-xl p-2 text-stone-400 hover:bg-stone-100" aria-label="关闭">
            <X size={19} />
          </button>
        </div>

        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <label className="grid gap-1.5 text-sm font-bold sm:col-span-2">桌台名称
            <input ref={nameRef} className={fieldClass} required maxLength="50" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} />
          </label>
          <label className="grid gap-1.5 text-sm font-bold">桌台编号
            <input className={fieldClass} required type="number" min="1" max="9999" value={form.number} onChange={(event) => setForm({ ...form, number: event.target.value })} />
          </label>
          <label className="grid gap-1.5 text-sm font-bold">容纳人数
            <input className={fieldClass} required type="number" min="1" max="30" value={form.capacity} onChange={(event) => setForm({ ...form, capacity: event.target.value })} />
          </label>
          <label className="grid gap-1.5 text-sm font-bold">形状
            <select className={fieldClass} value={form.shape} onChange={(event) => setForm({ ...form, shape: event.target.value })}>
              <option value="round">圆桌</option>
              <option value="square">方桌</option>
              <option value="rectangle">长桌</option>
              <option value="booth">包厢桌</option>
            </select>
          </label>
          <label className="grid gap-1.5 text-sm font-bold">所属区域
            <input className={fieldClass} required maxLength="50" value={form.area} onChange={(event) => setForm({ ...form, area: event.target.value })} />
          </label>
          <label className="grid gap-1.5 text-sm font-bold sm:col-span-2">默认时长（分钟，可选）
            <input className={fieldClass} type="number" min="5" max="480" value={form.defaultDurationMinutes} onChange={(event) => setForm({ ...form, defaultDurationMinutes: event.target.value })} />
          </label>
          <label className="grid gap-1.5 text-sm font-bold sm:col-span-2">备注（可选）
            <textarea className={`${fieldClass} min-h-20 py-3`} maxLength="200" value={form.note} onChange={(event) => setForm({ ...form, note: event.target.value })} />
          </label>
        </div>

        <div className="mt-6 flex justify-end gap-3">
          <button type="button" disabled={busy} onClick={onClose} className="min-h-11 rounded-xl border border-stone-300 px-4 text-sm font-bold text-stone-700 hover:bg-stone-50">取消</button>
          <button type="submit" disabled={busy} className="min-h-11 rounded-xl bg-ink-950 px-5 text-sm font-bold text-white hover:bg-ink-800 disabled:opacity-50">
            {busy ? '保存中…' : dialog.mode === 'edit' ? '保存修改' : '创建桌台'}
          </button>
        </div>
      </form>
    </div>
  );
}
