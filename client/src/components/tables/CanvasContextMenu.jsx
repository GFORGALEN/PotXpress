import { useEffect, useMemo, useRef } from 'react';
import {
  Copy,
  Edit3,
  Plus,
  PowerOff,
  Trash2,
} from 'lucide-react';

export function CanvasContextMenu({ menu, onClose, onAction }) {
  const menuRef = useRef(null);

  useEffect(() => {
    if (!menu) return undefined;
    const close = (event) => {
      if (!menuRef.current?.contains(event.target)) onClose();
    };
    const closeForViewportChange = () => onClose();
    document.addEventListener('pointerdown', close);
    window.addEventListener('blur', closeForViewportChange);
    window.addEventListener('resize', closeForViewportChange);
    window.addEventListener('scroll', closeForViewportChange, true);
    return () => {
      document.removeEventListener('pointerdown', close);
      window.removeEventListener('blur', closeForViewportChange);
      window.removeEventListener('resize', closeForViewportChange);
      window.removeEventListener('scroll', closeForViewportChange, true);
    };
  }, [menu, onClose]);

  useEffect(() => {
    if (!menu) return undefined;
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [menu, onClose]);

  const items = useMemo(() => (menu?.type === 'table' ? [
    { action: 'create', label: '新增桌台', Icon: Plus },
    { action: 'edit', label: '编辑桌台', Icon: Edit3 },
    { action: 'duplicate', label: '复制桌台', Icon: Copy },
    { action: 'disable', label: '停用桌台', Icon: PowerOff },
    { action: 'delete', label: '永久删除…', Icon: Trash2, danger: true },
  ] : [
    { action: 'create', label: '在这里新增桌台', Icon: Plus },
  ]), [menu?.type]);

  if (!menu) return null;

  const left = Math.min(menu.clientX, window.innerWidth - 224);
  const top = Math.min(menu.clientY, window.innerHeight - (items.length * 44 + 24));

  return (
    <div
      ref={menuRef}
      className="fixed z-[80] w-52 rounded-2xl border border-stone-200 bg-white p-1.5 shadow-2xl"
      style={{ left: Math.max(8, left), top: Math.max(8, top) }}
      role="menu"
      aria-label={menu.type === 'table' ? `${menu.table.name}操作` : '画布操作'}
    >
      {menu.type === 'table' ? (
        <p className="truncate border-b border-stone-100 px-3 py-2 text-xs font-black text-stone-500">
          {menu.table.name}
        </p>
      ) : null}
      {items.map(({ action, label, Icon, danger }) => (
        <button
          key={action}
          type="button"
          role="menuitem"
          className={`flex min-h-10 w-full items-center gap-2 rounded-xl px-3 text-left text-sm font-bold transition ${danger ? 'text-red-700 hover:bg-red-50' : 'text-stone-700 hover:bg-stone-100'}`}
          onClick={() => onAction(action, menu)}
        >
          <Icon size={16} />
          {label}
        </button>
      ))}
    </div>
  );
}
