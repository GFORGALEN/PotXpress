import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { saveLayout as saveLayoutRequest } from '../api/layout.ts';
import { useAuth } from './AuthContext.jsx';
import { useStore } from './StoreContext.jsx';
import { useToast } from './ToastContext.jsx';
import {
  buildLayoutSavePayload,
  normalizeDecoration,
  normalizeTableLayout,
  serializeLayout,
} from '../utils/layoutEditor.js';

const LayoutEditorContext = createContext(null);

export function LayoutEditorProvider({ children }) {
  const { user } = useAuth();
  const { selectedStoreId, storeEpoch } = useStore();
  const { showToast } = useToast();
  const [mode, setMode] = useState('view');
  const [draftLayout, setDraftLayout] = useState(() => new Map());
  const [draftCanvas, setDraftCanvas] = useState(null);
  const [baseLayoutVersion, setBaseLayoutVersion] = useState(null);
  const [selectedTableId, setSelectedTableId] = useState(null);
  const [selectedTableIds, setSelectedTableIds] = useState([]);
  const [draftDecorations, setDraftDecorations] = useState([]);
  const [selectedDecorationId, setSelectedDecorationId] = useState(null);
  const [history, setHistory] = useState({ past: [], future: [] });
  const [saving, setSaving] = useState(false);
  const [conflictDetails, setConflictDetails] = useState(null);
  const snapshotRef = useRef('');
  const tablesRef = useRef([]);
  const callbacksRef = useRef({});

  const isDirty = useMemo(() => (
    mode !== 'view'
    && draftCanvas
    && serializeLayout(
      draftCanvas,
      draftLayout,
      draftDecorations,
    ) !== snapshotRef.current
  ), [draftCanvas, draftDecorations, draftLayout, mode]);

  const captureDraft = useCallback(() => ({
    canvas: structuredClone(draftCanvas),
    layout: new Map(
      [...draftLayout].map(([id, value]) => [id, structuredClone(value)]),
    ),
    decorations: structuredClone(draftDecorations),
  }), [draftCanvas, draftDecorations, draftLayout]);

  const rememberCurrent = useCallback(() => {
    const snapshot = captureDraft();
    setHistory((current) => ({
      past: [...current.past.slice(-49), snapshot],
      future: [],
    }));
  }, [captureDraft]);

  const exitEdit = useCallback(() => {
    setMode('view');
    setDraftLayout(new Map());
    setDraftCanvas(null);
    setBaseLayoutVersion(null);
    setSelectedTableId(null);
    setSelectedTableIds([]);
    setDraftDecorations([]);
    setSelectedDecorationId(null);
    setHistory({ past: [], future: [] });
    setConflictDetails(null);
    snapshotRef.current = '';
    tablesRef.current = [];
    callbacksRef.current = {};
  }, []);

  useEffect(() => {
    exitEdit();
  }, [exitEdit, selectedStoreId, storeEpoch]);

  useEffect(() => {
    if (!isDirty) {
      return undefined;
    }

    const handleBeforeUnload = (event) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [isDirty]);

  const enterEdit = useCallback((layout, callbacks = {}) => {
    if (!['system_admin', 'store_admin'].includes(user?.role)) {
      showToast('当前账号没有布局编辑权限', 'error');
      return false;
    }

    const nextMap = new Map(
      layout.tables.map((table) => [
        table.tableId,
        normalizeTableLayout(table.layout),
      ]),
    );
    const nextCanvas = structuredClone(layout.canvas);
    const nextDecorations = structuredClone(layout.decorations ?? []);
    tablesRef.current = structuredClone(layout.tables);
    callbacksRef.current = callbacks;
    snapshotRef.current = serializeLayout(
      nextCanvas,
      nextMap,
      nextDecorations,
    );
    setDraftLayout(nextMap);
    setDraftCanvas(nextCanvas);
    setDraftDecorations(nextDecorations);
    setBaseLayoutVersion(layout.layoutVersion);
    setSelectedTableId(null);
    setSelectedTableIds([]);
    setSelectedDecorationId(null);
    setHistory({ past: [], future: [] });
    setConflictDetails(null);
    setMode('editing');
    return true;
  }, [showToast, user?.role]);

  const selectTables = useCallback((tableIds) => {
    const uniqueIds = [...new Set((tableIds ?? []).filter(Boolean))];
    setSelectedTableIds(uniqueIds);
    setSelectedTableId(uniqueIds[0] ?? null);
    if (uniqueIds.length) setSelectedDecorationId(null);
  }, []);

  const selectTable = useCallback((tableId) => {
    selectTables(tableId ? [tableId] : []);
  }, [selectTables]);

  const commitTableChanges = useCallback((changes, focusTableId) => {
    rememberCurrent();
    const next = new Map(draftLayout);
    const maxZIndex = Math.max(
      0,
      ...[...draftLayout.values()].map((layout) => layout.zIndex ?? 0),
    );
    let geometryChanged = false;
    let changedRight = 0;
    let changedBottom = 0;

    changes.forEach(({ tableId, patch }) => {
      const current = draftLayout.get(tableId);
      if (!current) return;
      const merged = {
        ...current,
        ...patch,
        zIndex: patch.bringToFront
          ? maxZIndex + 1
          : patch.zIndex ?? current.zIndex,
      };
      next.set(tableId, merged);
      const changed = ['xRatio', 'yRatio', 'widthRatio', 'heightRatio']
        .some((key) => patch[key] !== undefined && Math.abs(merged[key] - current[key]) > 0.00001);
      if (changed) {
        geometryChanged = true;
        changedRight = Math.max(changedRight, merged.xRatio + merged.widthRatio);
        changedBottom = Math.max(changedBottom, merged.yRatio + merged.heightRatio);
      }
    });

    const oldWidth = draftCanvas.virtualWidth;
    const oldHeight = draftCanvas.virtualHeight;
    const edgeMargin = Math.max(120, draftCanvas.gridSize * 6);
    const growWidth = Math.max(800, Math.round(oldWidth * 0.25));
    const growHeight = Math.max(600, Math.round(oldHeight * 0.25));
    const requiredWidth = changedRight * oldWidth + edgeMargin;
    const requiredHeight = changedBottom * oldHeight + edgeMargin;
    const newWidth = geometryChanged && changedRight * oldWidth >= oldWidth - edgeMargin
      ? Math.min(50000, Math.max(
        oldWidth + growWidth,
        Math.ceil(requiredWidth / growWidth) * growWidth,
      ))
      : oldWidth;
    const newHeight = geometryChanged && changedBottom * oldHeight >= oldHeight - edgeMargin
      ? Math.min(50000, Math.max(
        oldHeight + growHeight,
        Math.ceil(requiredHeight / growHeight) * growHeight,
      ))
      : oldHeight;

    if (newWidth !== oldWidth || newHeight !== oldHeight) {
      const xScale = oldWidth / newWidth;
      const yScale = oldHeight / newHeight;
      next.forEach((layout, tableId) => {
        next.set(tableId, normalizeTableLayout({
          ...layout,
          xRatio: layout.xRatio * xScale,
          yRatio: layout.yRatio * yScale,
          widthRatio: layout.widthRatio * xScale,
          heightRatio: layout.heightRatio * yScale,
        }));
      });
      setDraftDecorations((current) => current.map((item) => normalizeDecoration({
        ...item,
        xRatio: item.xRatio * xScale,
        yRatio: item.yRatio * yScale,
        widthRatio: item.widthRatio * xScale,
        heightRatio: item.heightRatio * yScale,
      })));
      setDraftCanvas((current) => ({
        ...current,
        virtualWidth: newWidth,
        virtualHeight: newHeight,
        aspectRatio: 'auto',
      }));
    } else {
      next.forEach((layout, tableId) => {
        next.set(tableId, normalizeTableLayout(layout));
      });
    }

    setDraftLayout(next);
    if (focusTableId) {
      setSelectedTableId(focusTableId);
      setSelectedDecorationId(null);
    }
  }, [draftCanvas, draftLayout, rememberCurrent]);

  const updateTableLayout = useCallback((tableId, nextLayout) => {
    commitTableChanges([{ tableId, patch: nextLayout }], tableId);
    if (!selectedTableIds.includes(tableId)) {
      setSelectedTableIds([tableId]);
    }
  }, [commitTableChanges, selectedTableIds]);

  const moveSelectedTables = useCallback((activeTableId, deltaXRatio, deltaYRatio) => {
    const ids = selectedTableIds.includes(activeTableId)
      ? selectedTableIds
      : [activeTableId];
    const layouts = ids.map((id) => draftLayout.get(id)).filter(Boolean);
    if (!layouts.length) return;
    const minX = Math.min(...layouts.map((layout) => layout.xRatio));
    const minY = Math.min(...layouts.map((layout) => layout.yRatio));
    const safeDeltaX = Math.max(-minX, deltaXRatio);
    const safeDeltaY = Math.max(-minY, deltaYRatio);
    commitTableChanges(ids.map((tableId) => {
      const layout = draftLayout.get(tableId);
      return {
        tableId,
        patch: {
          xRatio: layout.xRatio + safeDeltaX,
          yRatio: layout.yRatio + safeDeltaY,
          bringToFront: tableId === activeTableId,
        },
      };
    }), activeTableId);
  }, [commitTableChanges, draftLayout, selectedTableIds]);

  const updateCanvas = useCallback((patch) => {
    rememberCurrent();
    setDraftCanvas((current) => ({ ...current, ...patch }));
  }, [rememberCurrent]);

  const addDecoration = useCallback((type) => {
    rememberCurrent();
    const id = `decoration_${crypto.randomUUID()}`;
    const maxZIndex = Math.max(
      1,
      ...tablesRef.current.map((table) => table.layout.zIndex ?? 1),
      ...draftDecorations.map((item) => item.zIndex ?? 1),
    );
    const defaults = {
      wall: { label: '墙体', xRatio: 0.39, yRatio: 0.08, widthRatio: 0.22, heightRatio: 0.025 },
      entrance: { label: '入口', xRatio: 0.72, yRatio: 0.08, widthRatio: 0.1, heightRatio: 0.07 },
      cashier: { label: '收银台', xRatio: 0.72, yRatio: 0.2, widthRatio: 0.14, heightRatio: 0.09 },
      area: { label: '区域', xRatio: 0.35, yRatio: 0.34, widthRatio: 0.28, heightRatio: 0.24 },
      seat: { label: '座位', xRatio: 0.45, yRatio: 0.4, widthRatio: 0.07, heightRatio: 0.075 },
    }[type];
    setDraftDecorations((current) => [...current, {
      id,
      type,
      ...defaults,
      rotation: 0,
      zIndex: type === 'area' ? 0 : maxZIndex + 1,
    }]);
    setSelectedTableId(null);
    setSelectedTableIds([]);
    setSelectedDecorationId(id);
  }, [draftDecorations, rememberCurrent]);

  const updateDecoration = useCallback((id, patch) => {
    rememberCurrent();
    const currentItem = draftDecorations.find((item) => item.id === id);
    const nextItem = currentItem
      ? { ...currentItem, ...patch }
      : null;
    let nextDecorations = draftDecorations.map((item) => (
      item.id === id ? nextItem : item
    ));
    const geometryChanged = nextItem && ['xRatio', 'yRatio', 'widthRatio', 'heightRatio']
      .some((key) => patch[key] !== undefined && Math.abs(nextItem[key] - currentItem[key]) > 0.00001);
    const oldWidth = draftCanvas.virtualWidth;
    const oldHeight = draftCanvas.virtualHeight;
    const edgeMargin = Math.max(120, draftCanvas.gridSize * 6);
    const growWidth = Math.max(800, Math.round(oldWidth * 0.25));
    const growHeight = Math.max(600, Math.round(oldHeight * 0.25));
    const nextRight = nextItem ? nextItem.xRatio + nextItem.widthRatio : 0;
    const nextBottom = nextItem ? nextItem.yRatio + nextItem.heightRatio : 0;
    const newWidth = geometryChanged
      && nextRight * oldWidth >= oldWidth - edgeMargin
      ? Math.min(50000, Math.max(
        oldWidth + growWidth,
        Math.ceil((nextRight * oldWidth + edgeMargin) / growWidth) * growWidth,
      ))
      : oldWidth;
    const newHeight = geometryChanged
      && nextBottom * oldHeight >= oldHeight - edgeMargin
      ? Math.min(50000, Math.max(
        oldHeight + growHeight,
        Math.ceil((nextBottom * oldHeight + edgeMargin) / growHeight) * growHeight,
      ))
      : oldHeight;
    if (newWidth !== oldWidth || newHeight !== oldHeight) {
      const xScale = oldWidth / newWidth;
      const yScale = oldHeight / newHeight;
      nextDecorations = nextDecorations.map((item) => normalizeDecoration({
        ...item,
        xRatio: item.xRatio * xScale,
        yRatio: item.yRatio * yScale,
        widthRatio: item.widthRatio * xScale,
        heightRatio: item.heightRatio * yScale,
      }));
      setDraftLayout((current) => new Map([...current].map(([tableId, layout]) => [
        tableId,
        normalizeTableLayout({
          ...layout,
          xRatio: layout.xRatio * xScale,
          yRatio: layout.yRatio * yScale,
          widthRatio: layout.widthRatio * xScale,
          heightRatio: layout.heightRatio * yScale,
        }),
      ])));
      setDraftCanvas((current) => ({
        ...current,
        virtualWidth: newWidth,
        virtualHeight: newHeight,
        aspectRatio: 'auto',
      }));
    } else {
      nextDecorations = nextDecorations.map(normalizeDecoration);
    }
    setDraftDecorations(nextDecorations);
    setSelectedDecorationId(id);
    setSelectedTableId(null);
    setSelectedTableIds([]);
  }, [draftCanvas, draftDecorations, rememberCurrent]);

  const deleteSelectedDecoration = useCallback(() => {
    if (!selectedDecorationId) return;
    rememberCurrent();
    setDraftDecorations((current) => (
      current.filter((item) => item.id !== selectedDecorationId)
    ));
    setSelectedDecorationId(null);
  }, [rememberCurrent, selectedDecorationId]);

  const deleteTables = useCallback((tableIds) => {
    const ids = new Set((tableIds ?? []).filter((id) => draftLayout.has(id)));
    if (!ids.size) return;
    rememberCurrent();
    setDraftLayout((current) => new Map(
      [...current].filter(([tableId]) => !ids.has(tableId)),
    ));
    setSelectedTableId(null);
    setSelectedTableIds([]);
  }, [draftLayout, rememberCurrent]);

  const restoreSnapshot = useCallback((snapshot) => {
    setDraftCanvas(structuredClone(snapshot.canvas));
    setDraftLayout(new Map(snapshot.layout));
    setDraftDecorations(structuredClone(snapshot.decorations));
    setSelectedTableId(null);
    setSelectedTableIds([]);
    setSelectedDecorationId(null);
  }, []);

  const undo = useCallback(() => {
    setHistory((current) => {
      if (!current.past.length) return current;
      const previous = current.past[current.past.length - 1];
      restoreSnapshot(previous);
      return {
        past: current.past.slice(0, -1),
        future: [captureDraft(), ...current.future].slice(0, 50),
      };
    });
  }, [captureDraft, restoreSnapshot]);

  const redo = useCallback(() => {
    setHistory((current) => {
      if (!current.future.length) return current;
      const next = current.future[0];
      restoreSnapshot(next);
      return {
        past: [...current.past, captureDraft()].slice(-50),
        future: current.future.slice(1),
      };
    });
  }, [captureDraft, restoreSnapshot]);

  const saveLayout = useCallback(async () => {
    if (!isDirty) {
      showToast('未做任何修改', 'info');
      return { unchanged: true };
    }

    setSaving(true);

    try {
      const result = await saveLayoutRequest(
        selectedStoreId,
        buildLayoutSavePayload({
          layoutVersion: baseLayoutVersion,
          canvas: draftCanvas,
          tables: tablesRef.current,
          layoutMap: draftLayout,
          decorations: draftDecorations,
        }),
      );
      const savedLayout = {
        layoutVersion: result.layoutVersion,
        canvas: structuredClone(draftCanvas),
        decorations: structuredClone(draftDecorations),
        tables: tablesRef.current
          .filter((table) => draftLayout.has(table.tableId))
          .map((table) => ({
          ...table,
          layout: normalizeTableLayout(draftLayout.get(table.tableId)),
          })),
      };
      callbacksRef.current.onSaved?.(savedLayout);
      showToast('布局已保存', 'success');
      exitEdit();
      return { saved: true };
    } catch (error) {
      if (error.code === 'LAYOUT_CONFLICT') {
        setConflictDetails(error.details ?? null);
        setMode('conflict');
        return { conflict: true };
      }

      const firstIssue = error.details?.issues?.[0];
      showToast(
        firstIssue
          ? `${error.message}：${firstIssue.path} ${firstIssue.message}`
          : error.message,
        'error',
      );
      return { error };
    } finally {
      setSaving(false);
    }
  }, [
    baseLayoutVersion,
    draftCanvas,
    draftDecorations,
    draftLayout,
    draftDecorations,
    exitEdit,
    isDirty,
    selectedStoreId,
    showToast,
  ]);

  const loadLatest = useCallback(async () => {
    setSaving(true);

    try {
      await callbacksRef.current.onReload?.();
      showToast('已加载最新布局，本地草稿已丢弃', 'info');
      exitEdit();
    } catch (error) {
      showToast(error.message, 'error');
    } finally {
      setSaving(false);
    }
  }, [exitEdit, showToast]);

  const value = useMemo(() => ({
    mode,
    draftLayout,
    draftCanvas,
    draftDecorations,
    baseLayoutVersion,
    isDirty,
    selectedTableId,
    selectedTableIds,
    selectedDecorationId,
    saving,
    conflictDetails,
    tables: tablesRef.current,
    enterEdit,
    exitEdit,
    updateTableLayout,
    moveSelectedTables,
    updateCanvas,
    addDecoration,
    updateDecoration,
    deleteSelectedDecoration,
    deleteTables,
    undo,
    redo,
    canUndo: history.past.length > 0,
    canRedo: history.future.length > 0,
    saveLayout,
    loadLatest,
    setSelectedTableId: selectTable,
    selectTables,
    setSelectedDecorationId,
  }), [
    baseLayoutVersion,
    conflictDetails,
    draftCanvas,
    draftDecorations,
    draftLayout,
    enterEdit,
    exitEdit,
    isDirty,
    loadLatest,
    mode,
    saveLayout,
    saving,
    selectedTableId,
    selectedTableIds,
    selectedDecorationId,
    history,
    updateCanvas,
    updateTableLayout,
    moveSelectedTables,
    selectTable,
    selectTables,
    addDecoration,
    updateDecoration,
    deleteSelectedDecoration,
    deleteTables,
    undo,
    redo,
  ]);

  return (
    <LayoutEditorContext.Provider value={value}>
      {children}
    </LayoutEditorContext.Provider>
  );
}

export function useLayoutEditor() {
  const context = useContext(LayoutEditorContext);

  if (!context) {
    throw new Error('useLayoutEditor 必须在 LayoutEditorProvider 内使用');
  }

  return context;
}
