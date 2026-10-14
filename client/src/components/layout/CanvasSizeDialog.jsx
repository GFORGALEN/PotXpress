import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import clsx from 'clsx';
import { STORE_CHANGING_EVENT } from '../../contexts/StoreContext.jsx';
import {
  CANVAS_SIZE_LIMITS,
  CANVAS_SIZE_PRESETS,
  validateCanvasSizeInput,
} from '../../utils/layoutEditor.js';

/**
 * 画布尺寸设置：选择预设或自定义宽高，应用到草稿后仍由“保存布局”提交。
 * 修改尺寸只改变可摆放空间，桌台和装饰的位置与大小保持不变。
 */
export function CanvasSizeDialog({
  open,
  currentWidth,
  currentHeight,
  onApply,
  onClose,
}) {
  const [width, setWidth] = useState(String(currentWidth));
  const [height, setHeight] = useState(String(currentHeight));
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    setWidth(String(currentWidth));
    setHeight(String(currentHeight));
    setError('');
  }, [currentHeight, currentWidth, open]);

  useEffect(() => {
    if (!open) return undefined;
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener(STORE_CHANGING_EVENT, onClose);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener(STORE_CHANGING_EVENT, onClose);
    };
  }, [onClose, open]);

  if (!open) return null;

  const parsedWidth = Number(width);
  const parsedHeight = Number(height);
  const inputErrors = validateCanvasSizeInput(parsedWidth, parsedHeight);
  const unchanged = parsedWidth === currentWidth && parsedHeight === currentHeight;

  const apply = () => {
    if (inputErrors.length) {
      setError(inputErrors.join('；'));
      return;
    }
    const result = onApply(parsedWidth, parsedHeight);
    if (result?.ok) {
      onClose();
    } else {
      setError(result?.message ?? '无法应用这个尺寸');
    }
  };

  return (
    <div
      className="fixed inset-0 z-[90] flex items-end justify-center bg-ink-950/55 backdrop-blur-sm sm:items-center sm:p-4"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        data-potx-touch-scroll
        className="touch-scroll-region max-h-[min(100dvh,44rem)] w-full max-w-lg overflow-y-auto rounded-t-3xl border border-white/60 bg-white p-5 shadow-soft sm:rounded-3xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="canvas-size-title"
      >
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <h2 id="canvas-size-title" className="text-lg font-black text-ink-950">
              画布尺寸
            </h2>
            <p className="mt-1 text-xs leading-5 text-stone-500">
              当前 {currentWidth}×{currentHeight} 画布单位。修改后桌台和装饰的位置、大小不变，只增减可摆放的空白空间；缩放浏览比例请直接用手势或滚轮。
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl p-2 text-stone-400 transition hover:bg-stone-100 hover:text-stone-700"
            aria-label="关闭"
          >
            <X size={18} />
          </button>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
          {CANVAS_SIZE_PRESETS.map((preset) => {
            const active = parsedWidth === preset.width && parsedHeight === preset.height;
            return (
              <button
                key={preset.id}
                type="button"
                onClick={() => {
                  setWidth(String(preset.width));
                  setHeight(String(preset.height));
                  setError('');
                }}
                className={clsx(
                  'min-h-14 rounded-2xl border px-3 py-2 text-left transition',
                  active
                    ? 'border-sky-500 bg-sky-50 text-sky-950'
                    : 'border-stone-200 bg-white text-ink-900 hover:bg-stone-50',
                )}
                aria-pressed={active}
              >
                <span className="block text-sm font-black">{preset.label}</span>
                <span className="block font-mono text-xs text-stone-500">
                  {preset.width}×{preset.height}
                </span>
              </button>
            );
          })}
        </div>

        <div className="mt-4 rounded-2xl border border-stone-200 bg-stone-50 p-3">
          <p className="text-xs font-black text-stone-700">自定义 / 当前尺寸</p>
          <div className="mt-2 grid grid-cols-2 gap-3">
            <label className="text-xs font-bold text-stone-600">
              宽度
              <input
                type="number"
                inputMode="numeric"
                min={CANVAS_SIZE_LIMITS.minWidth}
                max={CANVAS_SIZE_LIMITS.maxWidth}
                step={1}
                value={width}
                onChange={(event) => {
                  setWidth(event.target.value);
                  setError('');
                }}
                className="mt-1 block min-h-11 w-full rounded-xl border border-stone-300 bg-white px-3 font-mono text-base text-ink-950"
              />
              <span className="mt-1 block font-normal text-stone-500">
                {CANVAS_SIZE_LIMITS.minWidth}–{CANVAS_SIZE_LIMITS.maxWidth} 画布单位
              </span>
            </label>
            <label className="text-xs font-bold text-stone-600">
              高度
              <input
                type="number"
                inputMode="numeric"
                min={CANVAS_SIZE_LIMITS.minHeight}
                max={CANVAS_SIZE_LIMITS.maxHeight}
                step={1}
                value={height}
                onChange={(event) => {
                  setHeight(event.target.value);
                  setError('');
                }}
                className="mt-1 block min-h-11 w-full rounded-xl border border-stone-300 bg-white px-3 font-mono text-base text-ink-950"
              />
              <span className="mt-1 block font-normal text-stone-500">
                {CANVAS_SIZE_LIMITS.minHeight}–{CANVAS_SIZE_LIMITS.maxHeight} 画布单位
              </span>
            </label>
          </div>
        </div>

        {error || (inputErrors.length && width !== '' && height !== '') ? (
          <p className="mt-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm font-bold text-red-700" role="alert">
            {error || inputErrors.join('；')}
          </p>
        ) : null}

        <div className="mt-5 flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="min-h-11 rounded-xl border border-stone-200 px-4 text-sm font-bold text-stone-700 transition hover:bg-stone-50"
          >
            取消
          </button>
          <button
            type="button"
            onClick={apply}
            disabled={unchanged || inputErrors.length > 0}
            className="min-h-11 rounded-xl bg-sky-600 px-4 text-sm font-black text-white transition hover:bg-sky-700 disabled:opacity-40"
          >
            应用到草稿
          </button>
        </div>
      </div>
    </div>
  );
}
