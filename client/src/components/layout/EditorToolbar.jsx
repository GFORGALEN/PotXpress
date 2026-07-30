import { useMemo, useState } from 'react';
import {
  BrickWall,
  DoorOpen,
  Grid3X3,
  Map,
  Pencil,
  Redo2,
  RotateCw,
  RotateCcw,
  Save,
  Store,
  Trash2,
  Undo2,
  X,
} from 'lucide-react';
import { ConfirmDialog } from '../common/ConfirmDialog.jsx';
import { useLayoutEditor } from '../../contexts/LayoutEditorContext.jsx';
import {
  buildCanvasResizePatch,
  CANVAS_SIZE_PRESETS,
  findSignificantOverlaps,
} from '../../utils/layoutEditor.js';

export function EditorToolbar() {
  const {
    draftCanvas,
    draftLayout,
    tables,
    isDirty,
    saving,
    selectedDecorationId,
    draftDecorations,
    updateCanvas,
    addDecoration,
    deleteSelectedDecoration,
    updateDecoration,
    undo,
    redo,
    canUndo,
    canRedo,
    exitEdit,
    saveLayout,
    loadLatest,
  } = useLayoutEditor();
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [confirmReload, setConfirmReload] = useState(false);
  const [overlaps, setOverlaps] = useState([]);
  const overlapDescription = useMemo(() => (
    overlaps.slice(0, 6)
      .map((item) => `${item.left}×${item.right}`)
      .join('、')
  ), [overlaps]);

  const requestSave = async () => {
    const nextOverlaps = findSignificantOverlaps(tables, draftLayout);

    if (nextOverlaps.length > 0) {
      setOverlaps(nextOverlaps);
      return;
    }

    await saveLayout();
  };

  return (
    <>
      <div className="rounded-3xl border border-sky-200 bg-sky-50 p-4 shadow-card">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <p className="text-sm font-black text-sky-950">
              编辑模式：拖动调整位置，拖角调整大小
            </p>
            <p className="mt-1 text-xs text-sky-700">
              滚轮仍可缩放，拖动画布空白区域可平移。
              {isDirty ? ' 当前有未保存修改。' : ' 当前布局未修改。'}
            </p>
          </div>
          <div className="flex max-w-full flex-nowrap items-center gap-2 overflow-x-auto pb-1 xl:flex-wrap xl:overflow-visible xl:pb-0">
            {[
              ['wall', '墙体', BrickWall],
              ['entrance', '入口', DoorOpen],
              ['cashier', '收银台', Store],
              ['area', '区域', Map],
            ].map(([type, label, Icon]) => (
              <button
                key={type}
                type="button"
                onClick={() => addDecoration(type)}
                disabled={saving}
                className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-sky-200 bg-white px-3 text-sm font-bold text-sky-900 disabled:opacity-50"
              >
                <Icon size={16} />
                {label}
              </button>
            ))}
            <button
              type="button"
              onClick={undo}
              disabled={saving || !canUndo}
              title="撤回"
              className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-stone-200 bg-white px-3 text-sm font-bold text-stone-600 disabled:opacity-40"
            >
              <Undo2 size={16} />撤回
            </button>
            <button
              type="button"
              onClick={redo}
              disabled={saving || !canRedo}
              title="重做"
              className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-stone-200 bg-white px-3 text-sm font-bold text-stone-600 disabled:opacity-40"
            >
              <Redo2 size={16} />重做
            </button>
            {selectedDecorationId ? (
              <>
                <button
                  type="button"
                  onClick={() => {
                    const item = draftDecorations.find(
                      (entry) => entry.id === selectedDecorationId,
                    );
                    if (item) {
                      updateDecoration(item.id, {
                        rotation: ((item.rotation ?? 0) + 90) % 360,
                      });
                    }
                  }}
                  disabled={saving}
                  className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-stone-200 bg-white px-3 text-sm font-bold text-stone-700 disabled:opacity-50"
                >
                  <RotateCw size={16} />旋转 90°
                </button>
                {draftDecorations.find((item) => (
                  item.id === selectedDecorationId
                  && item.type !== 'wall'
                )) ? (
                  <button
                    type="button"
                    onClick={() => {
                      const item = draftDecorations.find(
                        (entry) => entry.id === selectedDecorationId,
                      );
                      const label = window.prompt('元素名称', item?.label);
                      if (label?.trim()) {
                        updateDecoration(item.id, { label: label.trim() });
                      }
                    }}
                    disabled={saving}
                    className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-stone-200 bg-white px-3 text-sm font-bold text-stone-700 disabled:opacity-50"
                  >
                    <Pencil size={16} />命名
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={deleteSelectedDecoration}
                  disabled={saving}
                  className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-red-200 bg-white px-3 text-sm font-bold text-red-700 disabled:opacity-50"
                >
                  <Trash2 size={16} />删除元素
                </button>
              </>
            ) : null}
            <label className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-sky-200 bg-white px-3 text-sm font-bold text-sky-900">
              画布
              <select
                value={`${draftCanvas.virtualWidth}x${draftCanvas.virtualHeight}`}
                onChange={(event) => {
                  const preset = CANVAS_SIZE_PRESETS.find(
                    (item) => (
                      `${item.virtualWidth}x${item.virtualHeight}`
                      === event.target.value
                    ),
                  );
                  if (preset) {
                    updateCanvas(buildCanvasResizePatch(draftCanvas, preset));
                  }
                }}
                disabled={saving}
                className="rounded-lg border border-sky-100 bg-white px-1 py-0.5 text-xs font-bold text-sky-900"
                aria-label="画布尺寸"
              >
                {CANVAS_SIZE_PRESETS.map((preset) => (
                  <option
                    key={`${preset.virtualWidth}x${preset.virtualHeight}`}
                    value={`${preset.virtualWidth}x${preset.virtualHeight}`}
                  >
                    {preset.label}
                  </option>
                ))}
                {!CANVAS_SIZE_PRESETS.some((item) => (
                  item.virtualWidth === draftCanvas.virtualWidth
                  && item.virtualHeight === draftCanvas.virtualHeight
                )) ? (
                  <option
                    value={`${draftCanvas.virtualWidth}x${draftCanvas.virtualHeight}`}
                  >
                    {`自定义 ${draftCanvas.virtualWidth}×${draftCanvas.virtualHeight}`}
                  </option>
                ) : null}
              </select>
            </label>
            <label className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-sky-200 bg-white px-3 text-sm font-bold text-sky-900">
              <Grid3X3 size={16} />
              网格
              <input
                type="checkbox"
                checked={draftCanvas.gridEnabled}
                onChange={(event) => updateCanvas({
                  gridEnabled: event.target.checked,
                })}
              />
            </label>
            <label className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-sky-200 bg-white px-3 text-sm font-bold text-sky-900">
              吸附
              <input
                type="checkbox"
                checked={draftCanvas.snapToGrid}
                onChange={(event) => updateCanvas({
                  snapToGrid: event.target.checked,
                })}
              />
            </label>
            <button
              type="button"
              onClick={() => setConfirmReload(true)}
              disabled={saving}
              className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-stone-200 bg-white px-3 text-sm font-bold text-stone-600 disabled:opacity-50"
            >
              <RotateCcw size={16} />
              恢复上次保存
            </button>
            <button
              type="button"
              onClick={() => {
                if (isDirty) {
                  setConfirmDiscard(true);
                } else {
                  exitEdit();
                }
              }}
              disabled={saving}
              className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-stone-200 bg-white px-3 text-sm font-bold text-stone-600 disabled:opacity-50"
            >
              <X size={16} />
              取消
            </button>
            <button
              type="button"
              onClick={requestSave}
              disabled={saving}
              className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-sky-600 px-4 text-sm font-black text-white disabled:opacity-50"
            >
              <Save size={16} />
              {saving ? '正在保存…' : '保存布局'}
            </button>
          </div>
        </div>
      </div>

      <ConfirmDialog
        open={confirmDiscard}
        title="放弃未保存的布局？"
        description="布局未保存，确定离开？本地修改将无法恢复。"
        confirmText="放弃修改"
        danger
        onCancel={() => setConfirmDiscard(false)}
        onConfirm={() => {
          setConfirmDiscard(false);
          exitEdit();
        }}
      />
      <ConfirmDialog
        open={confirmReload}
        title="恢复上次保存的布局？"
        description="将重新从服务器读取最新布局，并丢弃当前本地草稿。"
        confirmText="加载最新布局"
        danger
        onCancel={() => setConfirmReload(false)}
        onConfirm={async () => {
          setConfirmReload(false);
          await loadLatest();
        }}
      />
      <ConfirmDialog
        open={overlaps.length > 0}
        title={`检测到 ${overlaps.length} 处桌台重叠`}
        description={`${overlapDescription}${overlaps.length > 6 ? '…' : ''}。真实店面可能需要特殊布局，仍要保存吗？`}
        confirmText="仍然保存"
        onCancel={() => setOverlaps([])}
        onConfirm={async () => {
          setOverlaps([]);
          await saveLayout();
        }}
      />
    </>
  );
}
