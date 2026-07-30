import { useMemo, useState } from 'react';
import {
  Grid3X3,
  RotateCcw,
  Save,
  X,
} from 'lucide-react';
import { ConfirmDialog } from '../common/ConfirmDialog.jsx';
import { useLayoutEditor } from '../../contexts/LayoutEditorContext.jsx';
import { findSignificantOverlaps } from '../../utils/layoutEditor.js';

export function EditorToolbar() {
  const {
    draftCanvas,
    draftLayout,
    tables,
    isDirty,
    saving,
    updateCanvas,
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
          <div className="flex flex-wrap items-center gap-2">
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
