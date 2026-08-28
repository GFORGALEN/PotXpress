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
  arrangeTableSelection,
  buildLayoutSavePayload,
  readLayoutIntoWorld,
  serializeLayout,
} from '../utils/layoutEditor.js';
import {
  clampWorldLayout,
  isLayoutInsideBounds,
  ratioBoundsToWorld,
  worldBoundsToRatios,
  worldDecorationToApi,
  worldLayoutToApi,
} from '../utils/layoutCoordinates.js';

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
  const [syncSelectedResize, setSyncSelectedResize] = useState(false);
  const [draftDecorations, setDraftDecorations] = useState([]);
  const [selectedDecorationId, setSelectedDecorationId] = useState(null);
  const [multiSelectMode, setMultiSelectMode] = useState(false);
  const [viewport, setViewport] = useState({ x: 0, y: 0, zoom: 1 });
  const [viewportInitialized, setViewportInitialized] = useState(false);
  const [visibleWorldBounds, setVisibleWorldBounds] = useState(null);
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
    setSyncSelectedResize(false);
    setDraftDecorations([]);
    setSelectedDecorationId(null);
    setMultiSelectMode(false);
    setHistory({ past: [], future: [] });
    setConflictDetails(null);
    snapshotRef.current = '';
    tablesRef.current = [];
    callbacksRef.current = {};
  }, []);

  useEffect(() => {
    exitEdit();
    setViewport({ x: 0, y: 0, zoom: 1 });
    setViewportInitialized(false);
    setVisibleWorldBounds(null);
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

    const worldLayout = readLayoutIntoWorld(layout);
    const nextMap = new Map(
      worldLayout.tables.map((table) => [
        table.tableId,
        table.layout,
      ]),
    );
    const nextCanvas = worldLayout.canvas;
    const nextDecorations = worldLayout.decorations;
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
    setSyncSelectedResize(false);
    setSelectedDecorationId(null);
    setMultiSelectMode(false);
    setHistory({ past: [], future: [] });
    setConflictDetails(null);
    setMode('editing');
    return true;
  }, [showToast, user?.role]);

  const selectTables = useCallback((tableIds) => {
    const uniqueIds = [...new Set((tableIds ?? []).filter(Boolean))];
    setSelectedTableIds((current) => (
      current.length === uniqueIds.length
      && current.every((id, index) => id === uniqueIds[index])
        ? current
        : uniqueIds
    ));
    setSelectedTableId((current) => (
      current === (uniqueIds[0] ?? null) ? current : uniqueIds[0] ?? null
    ));
    if (uniqueIds.length) setSelectedDecorationId(null);
  }, []);

  const selectTable = useCallback((tableId) => {
    selectTables(tableId ? [tableId] : []);
  }, [selectTables]);

  const commitTableChanges = useCallback((changes, focusTableId) => {
    const next = new Map(draftLayout);
    let changed = false;

    changes.forEach(({ tableId, patch }) => {
      const current = draftLayout.get(tableId);
      if (!current) return;
      const merged = clampWorldLayout({
        ...current,
        ...patch,
      }, draftCanvas);
      const geometryChanged = ['x', 'y', 'width', 'height']
        .some((key) => patch[key] !== undefined
          && Math.abs(merged[key] - current[key]) > 0.000001);
      if (!geometryChanged) return;
      changed = true;
      next.set(tableId, merged);
    });

    if (!changed) return false;
    rememberCurrent();
    setDraftLayout(next);
    if (focusTableId) {
      setSelectedTableId(focusTableId);
      setSelectedDecorationId(null);
    }
    return true;
  }, [draftCanvas, draftLayout, rememberCurrent]);

  const updateTableLayout = useCallback((tableId, nextLayout) => {
    commitTableChanges([{ tableId, patch: nextLayout }], tableId);
    if (!selectedTableIds.includes(tableId)) {
      setSelectedTableIds([tableId]);
    }
  }, [commitTableChanges, selectedTableIds]);

  const moveSelectedTables = useCallback((activeTableId, deltaX, deltaY) => {
    const ids = selectedTableIds.includes(activeTableId)
      ? selectedTableIds
      : [activeTableId];
    const layouts = ids.map((id) => draftLayout.get(id)).filter(Boolean);
    if (!layouts.length) return;
    const minX = Math.min(...layouts.map((layout) => layout.x));
    const minY = Math.min(...layouts.map((layout) => layout.y));
    const maxRight = Math.max(...layouts.map((layout) => layout.x + layout.width));
    const maxBottom = Math.max(...layouts.map((layout) => layout.y + layout.height));
    const safeDeltaX = Math.max(
      -minX,
      Math.min(draftCanvas.virtualWidth - maxRight, deltaX),
    );
    const safeDeltaY = Math.max(
      -minY,
      Math.min(draftCanvas.virtualHeight - maxBottom, deltaY),
    );
    commitTableChanges(ids.map((tableId) => {
      const layout = draftLayout.get(tableId);
      return {
        tableId,
        patch: {
          x: layout.x + safeDeltaX,
          y: layout.y + safeDeltaY,
        },
      };
    }), activeTableId);
  }, [commitTableChanges, draftCanvas, draftLayout, selectedTableIds]);

  const resizeSelectedTables = useCallback((activeTableId, nextLayouts) => {
    const selectedIds = new Set(selectedTableIds.includes(activeTableId)
      ? selectedTableIds
      : [activeTableId]);
    const changes = nextLayouts
      .filter(({ tableId }) => selectedIds.has(tableId) && draftLayout.has(tableId))
      .map(({ tableId, layout }) => ({
        tableId,
        patch: {
          ...layout,
        },
      }));
    if (changes.length) commitTableChanges(changes, activeTableId);
  }, [commitTableChanges, draftLayout, selectedTableIds]);

  const arrangeSelectedTables = useCallback((operation) => {
    const entries = selectedTableIds
      .map((tableId) => ({ tableId, layout: draftLayout.get(tableId) }))
      .filter(({ layout }) => Boolean(layout));
    if (entries.length < 2) return;

    const arranged = arrangeTableSelection(entries, operation, selectedTableId);
    commitTableChanges(arranged.map(({ tableId, layout }) => ({
      tableId,
      patch: layout,
    })), selectedTableId);
  }, [commitTableChanges, draftLayout, selectedTableId, selectedTableIds]);

  const updateCanvas = useCallback((patch) => {
    const changed = Object.entries(patch).some(([key, value]) => (
      JSON.stringify(draftCanvas?.[key]) !== JSON.stringify(value)
    ));
    if (!changed) return;
    rememberCurrent();
    setDraftCanvas((current) => ({ ...current, ...patch }));
  }, [draftCanvas, rememberCurrent]);

  const addDecoration = useCallback((type) => {
    rememberCurrent();
    const id = `decoration_${crypto.randomUUID()}`;
    const maxZIndex = Math.max(
      1,
      ...tablesRef.current.map((table) => table.layout.zIndex ?? 1),
      ...draftDecorations.map((item) => item.zIndex ?? 1),
    );
    const preset = {
      wall: { label: '墙体', x: 0.39, y: 0.08, width: 0.22, height: 0.025 },
      entrance: { label: '入口', x: 0.72, y: 0.08, width: 0.1, height: 0.07 },
      cashier: { label: '收银台', x: 0.72, y: 0.2, width: 0.14, height: 0.09 },
      area: { label: '区域', x: 0.35, y: 0.34, width: 0.28, height: 0.24 },
      seat: { label: '座位', x: 0.45, y: 0.4, width: 0.07, height: 0.075 },
    }[type];
    const defaults = clampWorldLayout({
      id,
      type,
      label: preset.label,
      x: preset.x * draftCanvas.virtualWidth,
      y: preset.y * draftCanvas.virtualHeight,
      width: preset.width * draftCanvas.virtualWidth,
      height: preset.height * draftCanvas.virtualHeight,
      rotation: 0,
      zIndex: type === 'area' ? 0 : maxZIndex + 1,
    }, draftCanvas);
    setDraftDecorations((current) => [...current, {
      ...defaults,
    }]);
    setSelectedTableId(null);
    setSelectedTableIds([]);
    setSelectedDecorationId(id);
  }, [draftCanvas, draftDecorations, rememberCurrent]);

  const updateDecoration = useCallback((id, patch) => {
    const currentItem = draftDecorations.find((item) => item.id === id);
    if (!currentItem) return;
    const nextItem = clampWorldLayout({ ...currentItem, ...patch }, draftCanvas);
    const changed = Object.keys(patch).some((key) => (
      typeof patch[key] === 'number'
        ? Math.abs(nextItem[key] - currentItem[key]) > 0.000001
        : nextItem[key] !== currentItem[key]
    ));
    if (!changed) return;
    rememberCurrent();
    setDraftDecorations((current) => current.map((item) => (
      item.id === id ? nextItem : item
    )));
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

  const initializeViewport = useCallback((nextViewport) => {
    setViewport(nextViewport);
    setViewportInitialized(true);
  }, []);

  const setDefaultViewFromViewport = useCallback(() => {
    if (!draftCanvas || !visibleWorldBounds) return false;
    updateCanvas({
      defaultViewBounds: worldBoundsToRatios(visibleWorldBounds, draftCanvas),
    });
    return true;
  }, [draftCanvas, updateCanvas, visibleWorldBounds]);

  const clearDefaultView = useCallback(() => {
    updateCanvas({ defaultViewBounds: null });
  }, [updateCanvas]);

  const tablesOutsideDefaultView = useMemo(() => {
    if (!draftCanvas?.defaultViewBounds) return [];
    const bounds = ratioBoundsToWorld(
      draftCanvas.defaultViewBounds,
      draftCanvas,
    );
    return tablesRef.current
      .filter((table) => draftLayout.has(table.tableId))
      .filter((table) => !isLayoutInsideBounds(
        draftLayout.get(table.tableId),
        bounds,
      ));
  }, [draftCanvas, draftLayout]);

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
        decorations: draftDecorations.map((item) => (
          worldDecorationToApi(item, draftCanvas)
        )),
        tables: tablesRef.current
          .filter((table) => draftLayout.has(table.tableId))
          .map((table) => ({
          ...table,
          layout: worldLayoutToApi(
            draftLayout.get(table.tableId),
            draftCanvas,
          ),
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
    syncSelectedResize,
    selectedDecorationId,
    multiSelectMode,
    viewport,
    viewportInitialized,
    visibleWorldBounds,
    tablesOutsideDefaultView,
    saving,
    conflictDetails,
    tables: tablesRef.current,
    enterEdit,
    exitEdit,
    updateTableLayout,
    moveSelectedTables,
    resizeSelectedTables,
    arrangeSelectedTables,
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
    setSyncSelectedResize,
    setSelectedDecorationId,
    setMultiSelectMode,
    setViewport,
    initializeViewport,
    setVisibleWorldBounds,
    setDefaultViewFromViewport,
    clearDefaultView,
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
    syncSelectedResize,
    selectedDecorationId,
    multiSelectMode,
    viewport,
    viewportInitialized,
    visibleWorldBounds,
    tablesOutsideDefaultView,
    history,
    updateCanvas,
    updateTableLayout,
    moveSelectedTables,
    resizeSelectedTables,
    arrangeSelectedTables,
    selectTable,
    selectTables,
    addDecoration,
    updateDecoration,
    deleteSelectedDecoration,
    deleteTables,
    undo,
    redo,
    initializeViewport,
    setDefaultViewFromViewport,
    clearDefaultView,
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
