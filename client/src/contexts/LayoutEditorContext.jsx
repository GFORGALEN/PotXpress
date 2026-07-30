import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { saveLayout as saveLayoutRequest } from '../api/layout.js';
import { useAuth } from './AuthContext.jsx';
import { useStore } from './StoreContext.jsx';
import { useToast } from './ToastContext.jsx';
import {
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
  const [saving, setSaving] = useState(false);
  const [conflictDetails, setConflictDetails] = useState(null);
  const snapshotRef = useRef('');
  const tablesRef = useRef([]);
  const callbacksRef = useRef({});

  const isDirty = useMemo(() => (
    mode !== 'view'
    && draftCanvas
    && serializeLayout(draftCanvas, draftLayout) !== snapshotRef.current
  ), [draftCanvas, draftLayout, mode]);

  const exitEdit = useCallback(() => {
    setMode('view');
    setDraftLayout(new Map());
    setDraftCanvas(null);
    setBaseLayoutVersion(null);
    setSelectedTableId(null);
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
    tablesRef.current = structuredClone(layout.tables);
    callbacksRef.current = callbacks;
    snapshotRef.current = serializeLayout(nextCanvas, nextMap);
    setDraftLayout(nextMap);
    setDraftCanvas(nextCanvas);
    setBaseLayoutVersion(layout.layoutVersion);
    setSelectedTableId(null);
    setConflictDetails(null);
    setMode('editing');
    return true;
  }, [showToast, user?.role]);

  const updateTableLayout = useCallback((tableId, nextLayout) => {
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
  }, []);

  const updateCanvas = useCallback((patch) => {
    setDraftCanvas((current) => ({ ...current, ...patch }));
  }, []);

  const saveLayout = useCallback(async () => {
    if (!isDirty) {
      showToast('未做任何修改', 'info');
      return { unchanged: true };
    }

    setSaving(true);

    try {
      const result = await saveLayoutRequest(selectedStoreId, {
        layoutVersion: baseLayoutVersion,
        canvas: draftCanvas,
        tables: tablesRef.current.map((table) => ({
          tableId: table.tableId,
          layout: normalizeTableLayout(draftLayout.get(table.tableId)),
        })),
      });
      const savedLayout = {
        layoutVersion: result.layoutVersion,
        canvas: structuredClone(draftCanvas),
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

      showToast(error.message, 'error');
      return { error };
    } finally {
      setSaving(false);
    }
  }, [
    baseLayoutVersion,
    draftCanvas,
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
    baseLayoutVersion,
    isDirty,
    selectedTableId,
    saving,
    conflictDetails,
    tables: tablesRef.current,
    enterEdit,
    exitEdit,
    updateTableLayout,
    updateCanvas,
    saveLayout,
    loadLatest,
    setSelectedTableId,
  }), [
    baseLayoutVersion,
    conflictDetails,
    draftCanvas,
    draftLayout,
    enterEdit,
    exitEdit,
    isDirty,
    loadLatest,
    mode,
    saveLayout,
    saving,
    selectedTableId,
    updateCanvas,
    updateTableLayout,
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
