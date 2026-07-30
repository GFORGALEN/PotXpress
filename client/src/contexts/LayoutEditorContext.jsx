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

    if (window.innerWidth < 768) {
      showToast('请在平板或电脑上编辑布局', 'info');
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
    setSelectedDecorationId(null);
    setHistory({ past: [], future: [] });
    setConflictDetails(null);
    setMode('editing');
    return true;
  }, [showToast, user?.role]);

  const updateTableLayout = useCallback((tableId, nextLayout) => {
    rememberCurrent();
    setDraftLayout((current) => {
      const next = new Map(current);
      const maxZIndex = Math.max(
        0,
        ...[...current.values()].map((layout) => layout.zIndex ?? 0),
      );
      next.set(tableId, normalizeTableLayout({
        ...current.get(tableId),
        ...nextLayout,
        zIndex: nextLayout.bringToFront
          ? maxZIndex + 1
          : nextLayout.zIndex ?? current.get(tableId)?.zIndex,
      }));
      return next;
    });
    setSelectedTableId(tableId);
  }, [rememberCurrent]);

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
    }[type];
    setDraftDecorations((current) => [...current, {
      id,
      type,
      ...defaults,
      rotation: 0,
      zIndex: type === 'area' ? 0 : maxZIndex + 1,
    }]);
    setSelectedTableId(null);
    setSelectedDecorationId(id);
  }, [draftDecorations, rememberCurrent]);

  const updateDecoration = useCallback((id, patch) => {
    rememberCurrent();
    setDraftDecorations((current) => current.map((item) => (
      item.id === id ? normalizeDecoration({ ...item, ...patch }) : item
    )));
    setSelectedDecorationId(id);
    setSelectedTableId(null);
  }, [rememberCurrent]);

  const deleteSelectedDecoration = useCallback(() => {
    if (!selectedDecorationId) return;
    rememberCurrent();
    setDraftDecorations((current) => (
      current.filter((item) => item.id !== selectedDecorationId)
    ));
    setSelectedDecorationId(null);
  }, [rememberCurrent, selectedDecorationId]);

  const restoreSnapshot = useCallback((snapshot) => {
    setDraftCanvas(structuredClone(snapshot.canvas));
    setDraftLayout(new Map(snapshot.layout));
    setDraftDecorations(structuredClone(snapshot.decorations));
    setSelectedTableId(null);
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
        tables: tablesRef.current.map((table) => ({
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
    selectedDecorationId,
    saving,
    conflictDetails,
    tables: tablesRef.current,
    enterEdit,
    exitEdit,
    updateTableLayout,
    updateCanvas,
    addDecoration,
    updateDecoration,
    deleteSelectedDecoration,
    undo,
    redo,
    canUndo: history.past.length > 0,
    canRedo: history.future.length > 0,
    saveLayout,
    loadLatest,
    setSelectedTableId,
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
    selectedDecorationId,
    history,
    updateCanvas,
    updateTableLayout,
    addDecoration,
    updateDecoration,
    deleteSelectedDecoration,
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
