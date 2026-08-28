import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Link, useLocation } from 'react-router';
import {
  ArrowUpRight,
  Clock3,
  LayoutGrid,
  List,
  Maximize2,
  Minimize2,
  Radio,
  RotateCw,
} from 'lucide-react';
import {
  createTable,
  deleteTablePermanent,
  disableTable,
  updateTable,
} from '../api/admin.js';
import { getLayout } from '../api/layout.ts';
import { listTimers, startTimer } from '../api/timers.ts';
import { getSettings } from '../api/settings.js';
import {
  OvertimeAlertDialog,
  WarningAlertDialog,
} from '../components/alerts/AlertDialogs.jsx';
import { TimerStatusBanner } from '../components/alerts/TimerStatusBanner.jsx';
import { EmptyState } from '../components/common/EmptyState.jsx';
import { ErrorMessage } from '../components/common/ErrorMessage.jsx';
import { LoadingSpinner } from '../components/common/LoadingSpinner.jsx';
import { ConfirmDialog } from '../components/common/ConfirmDialog.jsx';
import { FloorCanvas } from '../components/layout/FloorCanvas.jsx';
import { EditorToolbar } from '../components/layout/EditorToolbar.jsx';
import { LayoutConflictDialog } from '../components/layout/LayoutConflictDialog.jsx';
import { TableActionDialog } from '../components/tables/TableActionDialog.jsx';
import { CanvasContextMenu } from '../components/tables/CanvasContextMenu.jsx';
import { CanvasTableDialog } from '../components/tables/CanvasTableDialog.jsx';
import { TableFilter } from '../components/tables/TableFilter.jsx';
import { TableListView } from '../components/layout/TableListView.jsx';
import { useAuth } from '../contexts/AuthContext.jsx';
import { useStore } from '../contexts/StoreContext.jsx';
import { useToast } from '../contexts/ToastContext.jsx';
import { useLayoutEditor } from '../contexts/LayoutEditorContext.jsx';
import { useSound } from '../contexts/SoundContext.jsx';
import { useAlertWatcher } from '../hooks/useAlertWatcher.js';
import { usePolling } from '../hooks/usePolling.js';
import { useStoreRealtime } from '../hooks/useStoreRealtime.js';
import { useSecondTick } from '../hooks/useSecondTick.js';
import { useMediaQuery } from '../hooks/useMediaQuery.js';
import {
  calculateClockOffset,
  deriveTimerDisplay,
} from '../utils/timerDisplay.js';
import { isFrontDeskMode } from '../utils/frontDeskMode.js';
import { formatStoreDisplayName } from '../utils/storeSelection.js';
import {
  apiDecorationToWorld,
  apiLayoutToWorld,
} from '../utils/layoutCoordinates.js';

const TIMER_POLL_INTERVAL = 3000;
const CONNECTED_SAFETY_POLL_INTERVAL = 60000;
const CLOCK_RECALIBRATION_POLLS = 30;
const MOBILE_VIEW_STORAGE_KEY = 'potxpress_mobile_dashboard_view';
const TABLE_DOUBLE_CLICK_DELAY = 320;

export function DashboardPage() {
  const location = useLocation();
  const frontDeskMode = isFrontDeskMode(location.search);
  const { token, user } = useAuth();
  const {
    currentStore,
    selectedStoreId,
    storeEpoch,
    registerStoreRequest,
  } = useStore();
  const { showToast } = useToast();
  const displayStoreName = formatStoreDisplayName(currentStore?.name) || '桌台看板';
  const layoutEditor = useLayoutEditor();
  const {
    authorized: soundAuthorized,
    enableSound,
    reason: soundReason,
    setStoreSettings,
  } = useSound();
  const [layout, setLayout] = useState(null);
  const [timers, setTimers] = useState([]);
  const [layoutError, setLayoutError] = useState(null);
  const [timersError, setTimersError] = useState(null);
  const [layoutRetryEpoch, setLayoutRetryEpoch] = useState(0);
  const [statusFilter, setStatusFilter] = useState('all');
  const [areaFilter, setAreaFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [selectedTableId, setSelectedTableId] = useState(null);
  const [customDurationTableId, setCustomDurationTableId] = useState(null);
  const [canvasFocused, setCanvasFocused] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [canvasMenu, setCanvasMenu] = useState(null);
  const [tableDialog, setTableDialog] = useState(null);
  const [tableMutation, setTableMutation] = useState(null);
  const [tableMutationBusy, setTableMutationBusy] = useState(false);
  const [settings, setSettings] = useState(null);
  const [timerEventVersion, setTimerEventVersion] = useState(0);
  const [mobileView, setMobileView] = useState(
    () => localStorage.getItem(MOBILE_VIEW_STORAGE_KEY) || 'list',
  );
  const isMobile = useMediaQuery('(max-width: 767px)');
  const clockOffsetRef = useRef(0);
  const timerPollCountRef = useRef(0);
  const timersLoadedRef = useRef(false);
  const pollingFailedRef = useRef(false);
  const realtimeRefreshRef = useRef(() => {});
  const fullscreenRootRef = useRef(null);
  const pendingTableClickRef = useRef(null);
  const quickStartTableIdsRef = useRef(new Set());
  const now = useSecondTick(Boolean(selectedStoreId));

  const loadSettings = useCallback(async () => {
    if (!selectedStoreId) {
      return null;
    }

    const controller = new AbortController();
    const unregister = registerStoreRequest(controller);

    try {
      const result = await getSettings(selectedStoreId, {
        signal: controller.signal,
      });
      setSettings(result);
      setStoreSettings(result);
      return result;
    } catch (error) {
      if (error.code !== 'REQUEST_CANCELED') {
        setStoreSettings(null);
      }
      return null;
    } finally {
      unregister();
    }
  }, [registerStoreRequest, selectedStoreId, setStoreSettings]);

  useEffect(() => {
    setLayout(null);
    setTimers([]);
    setLayoutError(null);
    setTimersError(null);
    setSelectedTableId(null);
    setCustomDurationTableId(null);
    clearTimeout(pendingTableClickRef.current);
    pendingTableClickRef.current = null;
    quickStartTableIdsRef.current.clear();
    setCanvasFocused(false);
    setCanvasMenu(null);
    setTableDialog(null);
    setTableMutation(null);
    setAreaFilter('all');
    setSettings(null);
    clockOffsetRef.current = 0;
    timerPollCountRef.current = 0;
    timersLoadedRef.current = false;
    pollingFailedRef.current = false;
    setTimerEventVersion(0);
  }, [selectedStoreId, storeEpoch]);

  useEffect(() => {
    const handleFullscreenChange = () => {
      const active = document.fullscreenElement === fullscreenRootRef.current;
      setIsFullscreen(active);
      if (!document.fullscreenElement) {
        setCanvasFocused(false);
      }
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener(
      'fullscreenchange',
      handleFullscreenChange,
    );
  }, []);

  useEffect(() => {
    loadSettings();
    const handleVisibilityChange = () => {
      if (!document.hidden) {
        loadSettings();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener(
      'visibilitychange',
      handleVisibilityChange,
    );
  }, [loadSettings]);

  useEffect(() => {
    if (!selectedStoreId) {
      return undefined;
    }

    let active = true;
    const controller = new AbortController();
    const unregister = registerStoreRequest(controller);
    setLayoutError(null);

    getLayout(selectedStoreId, { signal: controller.signal })
      .then((result) => {
        if (active) {
          setLayout(result);
        }
      })
      .catch((error) => {
        if (active && error.code !== 'REQUEST_CANCELED') {
          setLayoutError(error);
        }
      })
      .finally(unregister);

    return () => {
      active = false;
      controller.abort();
      unregister();
    };
  }, [
    layoutRetryEpoch,
    registerStoreRequest,
    selectedStoreId,
    storeEpoch,
  ]);

  const fetchTimers = useCallback(
    ({ signal }) => listTimers(selectedStoreId, { signal }),
    [selectedStoreId],
  );

  const handleTimersSuccess = useCallback((result) => {
    const pollNumber = timerPollCountRef.current;

    if (
      pollNumber === 0
      || pollNumber % CLOCK_RECALIBRATION_POLLS === 0
    ) {
      const nextOffset = calculateClockOffset(result);

      if (nextOffset !== null) {
        clockOffsetRef.current = nextOffset;
      }

      loadSettings();
    }

    timerPollCountRef.current += 1;
    setTimers(result.timers);
    setTimerEventVersion(
      Number.isSafeInteger(result.eventVersion) ? result.eventVersion : 0,
    );
    setTimersError(null);

    if (pollingFailedRef.current && timersLoadedRef.current) {
      pollingFailedRef.current = false;
      showToast('连接已恢复', 'success');
    }

    timersLoadedRef.current = true;
  }, [loadSettings, showToast]);

  const handleTimersError = useCallback((error) => {
    if (!timersLoadedRef.current) {
      setTimersError(error);
      return;
    }

    pollingFailedRef.current = true;
  }, []);

  const handleRealtimeSnapshotRequired = useCallback(() => (
    realtimeRefreshRef.current()
  ), []);
  const realtime = useStoreRealtime({
    storeId: selectedStoreId,
    token,
    snapshotVersion: timerEventVersion,
    onSnapshotRequired: handleRealtimeSnapshotRequired,
  });
  const refreshTimers = usePolling(
    fetchTimers,
    realtime.connected
      ? CONNECTED_SAFETY_POLL_INTERVAL
      : TIMER_POLL_INTERVAL,
    {
      enabled: Boolean(selectedStoreId),
      hiddenIntervalMs: realtime.connected
        ? CONNECTED_SAFETY_POLL_INTERVAL
        : 15000,
      onSuccess: handleTimersSuccess,
      onError: handleTimersError,
      registerController: registerStoreRequest,
    },
  );
  realtimeRefreshRef.current = refreshTimers;

  const timerByTableId = useMemo(
    () => new Map(timers.flatMap((timer) => (
      (timer.memberTableIds ?? [timer.tableId])
        .map((tableId) => [tableId, timer])
    ))),
    [timers],
  );
  const correctedNow = now + clockOffsetRef.current;
  const displayTables = useMemo(() => (
    (layout?.tables ?? [])
      .filter((table) => (
        layoutEditor.mode === 'view'
        || layoutEditor.draftLayout.has(table.tableId)
      ))
      .map((table) => ({
      ...table,
      layout: layoutEditor.mode === 'view'
        ? table.layout
        : layoutEditor.draftLayout.get(table.tableId) ?? table.layout,
    }))
  ), [layout?.tables, layoutEditor.draftLayout, layoutEditor.mode]);
  const allTables = useMemo(() => (
    displayTables
      .filter((table) => table.enabled)
      .map((table) => {
        const timer = timerByTableId.get(table.tableId) ?? null;
        const display = deriveTimerDisplay(timer, correctedNow);

        return {
          ...table,
          ...display,
          startTime: timer?.startTime ?? null,
          effectiveEndTime: timer?.effectiveEndTime ?? null,
          timerId: timer?.id ?? null,
          timer,
        };
      })
  ), [correctedNow, displayTables, timerByTableId]);
  const normalizedSearch = search.trim().toLocaleLowerCase('zh-CN');
  const visibleTables = useMemo(() => allTables
    .filter((table) => (
      areaFilter === 'all' || table.area === areaFilter
    ))
    .filter((table) => (
      statusFilter === 'all' || table.status === statusFilter
    ))
    .filter((table) => (
      !normalizedSearch
      || table.name.toLocaleLowerCase('zh-CN').includes(normalizedSearch)
    ))
    .map((table) => ({
      ...table,
      highlighted: Boolean(normalizedSearch),
    })), [allTables, areaFilter, normalizedSearch, statusFilter]);
  const canvasAllTables = useMemo(() => (
    layoutEditor.mode === 'view'
      ? allTables.map((table) => ({
        ...table,
        layout: apiLayoutToWorld(table.layout, layout?.canvas),
      }))
      : allTables
  ), [allTables, layout?.canvas, layoutEditor.mode]);
  const canvasVisibleTables = useMemo(() => (
    layoutEditor.mode === 'view'
      ? visibleTables.map((table) => ({
        ...table,
        layout: apiLayoutToWorld(table.layout, layout?.canvas),
      }))
      : visibleTables
  ), [layout?.canvas, layoutEditor.mode, visibleTables]);
  const canvasDecorations = useMemo(() => (
    layoutEditor.mode === 'view'
      ? (layout?.decorations ?? []).map((item) => (
        apiDecorationToWorld(item, layout?.canvas)
      ))
      : layoutEditor.draftDecorations
  ), [
    layout?.canvas,
    layout?.decorations,
    layoutEditor.draftDecorations,
    layoutEditor.mode,
  ]);
  const areas = useMemo(
    () => [...new Set(allTables.map((table) => table.area).filter(Boolean))]
      .sort((left, right) => left.localeCompare(right, 'zh-CN')),
    [allTables],
  );
  const counts = useMemo(() => {
    const result = {
      total: allTables.length,
      idle: 0,
      running: 0,
      paused: 0,
      warning: 0,
      overtime: 0,
    };

    for (const table of allTables) {
      result[table.status] += 1;
    }

    return result;
  }, [allTables]);
  const warningTables = useMemo(
    () => [...new Map(
      allTables
        .filter((table) => table.status === 'warning')
        .map((table) => [table.timerId ?? table.tableId, table]),
    ).values()],
    [allTables],
  );
  const overtimeTables = useMemo(
    () => [...new Map(
      allTables
        .filter((table) => table.status === 'overtime')
        .map((table) => [table.timerId ?? table.tableId, table]),
    ).values()],
    [allTables],
  );
  const selectedTable = useMemo(
    () => allTables.find((table) => table.tableId === selectedTableId) ?? null,
    [allTables, selectedTableId],
  );
  const currentTimeLabel = useMemo(() => {
    try {
      return new Intl.DateTimeFormat('zh-CN', {
        timeZone: currentStore?.timezone,
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hourCycle: 'h23',
      }).format(new Date(correctedNow));
    } catch {
      return new Date(correctedNow).toLocaleTimeString('zh-CN', {
        hourCycle: 'h23',
      });
    }
  }, [correctedNow, currentStore?.timezone]);
  useEffect(() => () => clearTimeout(pendingTableClickRef.current), []);

  const handleTableClick = useCallback((tableId) => {
    if (layoutEditor.mode !== 'view') {
      layoutEditor.setSelectedTableId(tableId);
      return;
    }

    const table = allTables.find((item) => item.tableId === tableId);
    if (!table || table.status !== 'idle') {
      setCustomDurationTableId(null);
      setSelectedTableId(tableId);
      return;
    }

    clearTimeout(pendingTableClickRef.current);
    pendingTableClickRef.current = setTimeout(async () => {
      pendingTableClickRef.current = null;
      if (quickStartTableIdsRef.current.has(tableId)) return;
      quickStartTableIdsRef.current.add(tableId);
      const durationMinutes = table.defaultDurationMinutes
        ?? settings?.defaultDurationMinutes
        ?? 90;
      try {
        await startTimer(selectedStoreId, tableId, durationMinutes);
        await refreshTimers();
        showToast(`${table.name} 已开始计时（${durationMinutes} 分钟）`, 'success');
      } catch (error) {
        showToast(
          error.code === 'TIMER_STATE_CONFLICT'
            ? '桌台状态已被其他设备更新，已同步最新状态'
            : error.message,
          'error',
        );
        await refreshTimers();
      } finally {
        quickStartTableIdsRef.current.delete(tableId);
      }
    }, TABLE_DOUBLE_CLICK_DELAY);
  }, [allTables, layoutEditor, refreshTimers, selectedStoreId, settings, showToast]);

  const handleTableDoubleClick = useCallback((tableId) => {
    if (layoutEditor.mode !== 'view') return;
    clearTimeout(pendingTableClickRef.current);
    pendingTableClickRef.current = null;
    setCustomDurationTableId(tableId);
    setSelectedTableId(tableId);
  }, [layoutEditor.mode]);

  const handleCloseDialog = useCallback(() => {
    setSelectedTableId(null);
    setCustomDurationTableId(null);
  }, []);
  const retryInitialLoad = useCallback(() => {
    setLayoutError(null);
    setTimersError(null);
    setLayoutRetryEpoch((value) => value + 1);
    refreshTimers();
  }, [refreshTimers]);
  const reloadLatestLayout = useCallback(async () => {
    const result = await getLayout(selectedStoreId);
    setLayout(result);
    return result;
  }, [selectedStoreId]);
  const canManageTables = ['system_admin', 'store_admin'].includes(user.role);
  const toggleCanvasFocus = useCallback(async () => {
    if (layoutEditor.mode !== 'view') {
      setCanvasFocused((value) => !value);
      return;
    }

    if (document.fullscreenElement) {
      await document.exitFullscreen?.();
      return;
    }

    if (canvasFocused) {
      setCanvasFocused(false);
      return;
    }

    setCanvasFocused(true);
    try {
      await fullscreenRootRef.current?.requestFullscreen?.();
    } catch {
      // Keep the focused canvas fallback when the browser blocks fullscreen.
      setIsFullscreen(false);
    }
  }, [canvasFocused, layoutEditor.mode]);
  const nextTableNumber = useMemo(() => {
    const used = new Set((layout?.tables ?? []).map((table) => table.number));
    for (let number = 1; number <= 9999; number += 1) {
      if (!used.has(number)) return number;
    }
    return 9999;
  }, [layout?.tables]);

  const openCreateTableDialog = useCallback((position = { xRatio: 0.45, yRatio: 0.445 }) => {
    setCanvasMenu(null);
    if (layoutEditor.mode === 'editing' && layoutEditor.isDirty) {
      showToast('请先保存当前布局，再新增桌台', 'info');
      return;
    }
    setTableDialog({
      mode: 'create',
      position: {
        xRatio: Math.max(0, position.xRatio - 0.05),
        yRatio: Math.max(0, position.yRatio - 0.055),
      },
      table: {
        name: `${nextTableNumber}号桌`,
        number: nextTableNumber,
        shape: 'rectangle',
        capacity: 4,
        area: '大厅',
        note: null,
        defaultDurationMinutes: null,
      },
    });
  }, [layoutEditor.isDirty, layoutEditor.mode, nextTableNumber, showToast]);

  const handleCanvasMenuAction = useCallback((action, menu) => {
    setCanvasMenu(null);
    if (
      action !== 'delete'
      && layoutEditor.mode === 'editing'
      && layoutEditor.isDirty
    ) {
      showToast('请先保存当前布局，再修改桌台资料', 'info');
      return;
    }
    if (action === 'create') {
      openCreateTableDialog(menu.type === 'table' ? {
        xRatio: Math.min(0.94, menu.table.layout.xRatio + menu.table.layout.widthRatio + 0.025),
        yRatio: menu.table.layout.yRatio,
      } : menu);
      return;
    }
    const table = menu.table;
    if (action === 'edit') {
      setTableDialog({ mode: 'edit', table });
    } else if (action === 'duplicate') {
      setTableDialog({
        mode: 'duplicate',
        table: {
          ...table,
          name: `${nextTableNumber}号桌`,
          number: nextTableNumber,
        },
        sourceTableId: table.tableId,
        position: {
          xRatio: Math.min(0.9, table.layout.xRatio + 0.025),
          yRatio: Math.min(0.89, table.layout.yRatio + 0.025),
        },
      });
    } else if (action === 'disable') {
      setTableMutation({ type: 'disable', table });
    } else if (action === 'delete') {
      setTableMutation({
        type: layoutEditor.mode === 'editing' ? 'stage-delete' : 'delete',
        table,
      });
    }
  }, [
    layoutEditor.isDirty,
    layoutEditor.mode,
    nextTableNumber,
    openCreateTableDialog,
    showToast,
  ]);

  const refreshAfterTableMutation = useCallback(async (continueEditing) => {
    const latestLayout = await reloadLatestLayout();
    refreshTimers();
    if (continueEditing) {
      layoutEditor.enterEdit(latestLayout, {
        onSaved: setLayout,
        onReload: reloadLatestLayout,
      });
    }
  }, [layoutEditor, refreshTimers, reloadLatestLayout]);

  const submitTableDialog = useCallback(async (form) => {
    if (!tableDialog || tableMutationBusy) return;
    const continueEditing = layoutEditor.mode === 'editing'
      || ['create', 'duplicate'].includes(tableDialog.mode);
    setTableMutationBusy(true);
    try {
      if (tableDialog.mode === 'edit') {
        await updateTable(selectedStoreId, tableDialog.table.tableId, form);
        showToast('桌台资料已更新', 'success');
      } else {
        await createTable(selectedStoreId, {
          ...form,
          placement: tableDialog.position,
        });
        showToast(tableDialog.mode === 'duplicate' ? '桌台已复制' : '桌台已创建', 'success');
      }
      setTableDialog(null);
      await refreshAfterTableMutation(continueEditing);
    } catch (error) {
      showToast(error.message, 'error');
    } finally {
      setTableMutationBusy(false);
    }
  }, [
    refreshAfterTableMutation,
    layoutEditor.mode,
    selectedStoreId,
    showToast,
    tableDialog,
    tableMutationBusy,
  ]);

  const confirmTableMutation = useCallback(async () => {
    if (!tableMutation || tableMutationBusy) return;
    if (tableMutation.type === 'stage-delete') {
      layoutEditor.deleteTables([tableMutation.table.tableId]);
      setTableMutation(null);
      showToast('桌台已从布局草稿移除，保存布局后生效', 'success');
      return;
    }
    const continueEditing = layoutEditor.mode === 'editing';
    setTableMutationBusy(true);
    try {
      if (tableMutation.type === 'disable') {
        await disableTable(selectedStoreId, tableMutation.table.tableId);
        showToast('桌台已停用，历史记录仍会保留', 'success');
      } else {
        await deleteTablePermanent(selectedStoreId, tableMutation.table.tableId);
        showToast('桌台已永久删除', 'success');
      }
      setTableMutation(null);
      await refreshAfterTableMutation(continueEditing);
    } catch (error) {
      showToast(
        error.code === 'TABLE_HAS_ACTIVE_TIMER'
          ? '该桌正在计时，请先重置清台'
          : error.message,
        'error',
      );
    } finally {
      setTableMutationBusy(false);
    }
  }, [
    refreshAfterTableMutation,
    layoutEditor,
    layoutEditor.mode,
    selectedStoreId,
    showToast,
    tableMutation,
    tableMutationBusy,
  ]);
  const alerts = useAlertWatcher(allTables, refreshTimers);

  const changeMobileView = useCallback((view) => {
    setMobileView(view);
    localStorage.setItem(MOBILE_VIEW_STORAGE_KEY, view);
  }, []);

  useEffect(() => {
    if (alerts.overtimeDialogOpen) {
      setSelectedTableId(null);
    }
  }, [alerts.overtimeDialogOpen]);

  const initialError = (!layout && layoutError)
    || (!timersLoadedRef.current && timersError);

  if (initialError) {
    return (
      <div className="mx-auto max-w-3xl py-10">
        <ErrorMessage
          message={initialError.message}
          onRetry={retryInitialLoad}
        />
      </div>
    );
  }

  if (!layout || !timersLoadedRef.current) {
    return <LoadingSpinner label="正在同步门店桌台" />;
  }

  return (
    <div
      ref={fullscreenRootRef}
      className={frontDeskMode
        ? 'flex h-full min-h-0 w-full flex-col gap-2 bg-canvas'
        : 'mx-auto flex max-w-[110rem] flex-col gap-4 bg-canvas'}
    >
      <section className={`relative flex shrink-0 flex-col justify-between gap-3 overflow-hidden border border-[#eadb62]/70 bg-[#fff8c7] text-ink-950 shadow-[0_20px_44px_-30px_rgba(80,70,20,.35)] sm:flex-row sm:items-center ${frontDeskMode ? 'rounded-2xl px-4 py-3 sm:px-5' : 'rounded-[1.75rem] px-5 py-4 sm:px-6'}`}>
        <div className="pointer-events-none absolute -right-12 -top-16 h-48 w-48 rounded-full bg-white/55 blur-3xl" />
        <div className="min-w-0">
          <p className="text-[10px] font-black uppercase tracking-[0.16em] text-ember-700">当前门店</p>
          <div className="mt-0.5 flex flex-wrap items-center gap-2">
            <h1 className="min-w-0 truncate text-xl font-black tracking-tight text-ink-950 sm:text-2xl" title={currentStore?.name}>
              {displayStoreName}
            </h1>
            <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-black ${realtime.connected ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}`}>
              <Radio size={12} />
              {realtime.connected ? '实时连接' : '自动重连中'}
            </span>
          </div>
          <p className="mt-0.5 text-xs font-medium text-stone-600">
            运行模式 · 点击桌台查看计时与操作
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 sm:flex-nowrap">
          {frontDeskMode ? (
            <Link
              to="/"
              className="inline-flex min-h-11 items-center rounded-xl border border-[#dfce54] bg-white/65 px-3 text-sm font-bold text-ink-900 transition hover:bg-white"
            >
              退出前台模式
            </Link>
          ) : null}
          <div className="mr-1 hidden min-w-24 text-right sm:block">
            <p className="flex items-center justify-end gap-1 text-[10px] font-bold uppercase tracking-wider text-stone-500">
              <Clock3 size={11} /> 门店时间
            </p>
            <p className="font-mono text-base font-black tabular-nums text-ink-950">{currentTimeLabel}</p>
          </div>
          <button
            type="button"
            onClick={refreshTimers}
            className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-[#dfce54] bg-white/65 px-3 text-sm font-bold text-ink-900 transition hover:bg-white"
          >
            <RotateCw size={16} />
            立即同步
          </button>
          {['system_admin', 'store_admin'].includes(user.role)
            && layoutEditor.mode === 'view' ? (
            <button
              type="button"
              onClick={() => layoutEditor.enterEdit(layout, {
                onSaved: setLayout,
                onReload: reloadLatestLayout,
              })}
              className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-ember-500 px-4 text-sm font-bold text-white shadow-sm transition hover:bg-ember-600"
            >
              进入布局编辑
              <ArrowUpRight size={16} />
            </button>
          ) : null}
        </div>
      </section>

      {layoutEditor.mode !== 'view' ? (
        <EditorToolbar onAddTable={() => openCreateTableDialog()} />
      ) : null}

      {!soundAuthorized && frontDeskMode ? (
        <button
          type="button"
          onClick={enableSound}
          className="min-h-12 rounded-2xl border border-amber-300 bg-amber-100 px-4 text-left text-sm font-black text-amber-950 shadow-card"
        >
          🔔 启用声音提醒
          <span className="ml-2 font-medium opacity-70">{soundReason}</span>
        </button>
      ) : null}

      <TimerStatusBanner
        status="overtime"
        tables={overtimeTables}
      />

      {layoutEditor.mode === 'view' ? (
        <div className="grid grid-cols-2 gap-2 rounded-2xl bg-stone-200 p-1 md:hidden" aria-label="看板显示方式">
          <button type="button" className={`flex min-h-10 items-center justify-center gap-2 rounded-xl text-sm font-bold ${mobileView === 'list' ? 'bg-white text-ink-950 shadow-card' : 'text-stone-500'}`} onClick={() => changeMobileView('list')}><List size={17} />列表</button>
          <button type="button" className={`flex min-h-10 items-center justify-center gap-2 rounded-xl text-sm font-bold ${mobileView === 'canvas' ? 'bg-white text-ink-950 shadow-card' : 'text-stone-500'}`} onClick={() => changeMobileView('canvas')}><LayoutGrid size={17} />平面图</button>
        </div>
      ) : null}
      <TimerStatusBanner
        status="warning"
        tables={warningTables}
        collapsible
      />

      {allTables.length === 0 ? (
        <EmptyState
          title="本店还没有桌台"
          description={canManageTables
            ? '点击上方“新增桌台”，创建后会立即出现在画布中。'
            : '请联系门店管理员创建桌台。'}
        />
      ) : (
        <>
          {layoutEditor.mode === 'view' ? (
            <TableFilter
              status={statusFilter}
              search={search}
              counts={counts}
              areas={areas}
              area={areaFilter}
              onStatusChange={setStatusFilter}
              onAreaChange={setAreaFilter}
              onSearchChange={setSearch}
            />
          ) : null}

          {visibleTables.length === 0 && layoutEditor.mode === 'view' ? (
            <EmptyState
              title="没有符合条件的桌台"
              description="请调整状态筛选或清空搜索关键词。"
            />
          ) : (
            isMobile && mobileView === 'list' && layoutEditor.mode === 'view' ? (
              <TableListView
                tables={visibleTables}
                onTableClick={handleTableClick}
                onTableDoubleClick={handleTableDoubleClick}
              />
            ) : (
            <div className={canvasFocused
              ? 'fixed inset-0 z-50 min-h-0 overflow-hidden bg-white'
              : frontDeskMode
                ? 'relative min-h-80 flex-1'
                : 'relative h-[clamp(38rem,calc(100vh-16rem),68rem)] min-h-0'}>
              {layoutEditor.mode === 'view' || canManageTables ? (
                <div className="absolute left-4 top-4 z-40 flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={toggleCanvasFocus}
                    className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-stone-200 bg-white/95 px-3 text-xs font-black text-ink-900 shadow-lg backdrop-blur transition hover:bg-stone-50"
                    aria-label={layoutEditor.mode === 'view'
                      ? (isFullscreen || canvasFocused
                        ? '退出全屏运营'
                        : '进入全屏运营')
                      : (canvasFocused ? '退出专注画布' : '进入专注画布')}
                  >
                    {canvasFocused ? <Minimize2 size={17} /> : <Maximize2 size={17} />}
                    {layoutEditor.mode === 'view'
                      ? (canvasFocused ? '退出全屏' : '全屏运营')
                      : (canvasFocused ? '退出专注' : '专注画布')}
                  </button>
                  {canvasFocused && layoutEditor.mode === 'view' ? (
                    <span className="rounded-xl border border-emerald-200 bg-emerald-50/95 px-3 py-2 text-xs font-black text-emerald-800 shadow-lg backdrop-blur">
                      点击桌台即可开始或调整计时
                    </span>
                  ) : null}
                </div>
              ) : null}
              <FloorCanvas
                key={selectedStoreId}
                canvas={layoutEditor.mode === 'view'
                  ? layout.canvas
                  : layoutEditor.draftCanvas}
                tables={layoutEditor.mode === 'view'
                  ? canvasVisibleTables
                  : canvasAllTables}
                fitTables={canvasAllTables}
                decorations={canvasDecorations}
                timezone={currentStore?.timezone}
                onTableClick={handleTableClick}
                onTableDoubleClick={handleTableDoubleClick}
                onCanvasContextMenu={canManageTables
                  ? (position) => {
                    const activeCanvas = layoutEditor.mode === 'view'
                      ? layout.canvas
                      : layoutEditor.draftCanvas;
                    setCanvasMenu({
                      type: 'canvas',
                      ...position,
                      xRatio: Math.max(0, Math.min(
                        1,
                        position.x / activeCanvas.virtualWidth,
                      )),
                      yRatio: Math.max(0, Math.min(
                        1,
                        position.y / activeCanvas.virtualHeight,
                      )),
                    });
                  }
                  : undefined}
                onTableContextMenu={canManageTables
                  ? ({ tableId, clientX, clientY }) => {
                    const table = allTables.find((item) => item.tableId === tableId);
                    if (table) setCanvasMenu({ type: 'table', table, clientX, clientY });
                  }
                  : undefined}
                editing={layoutEditor.mode === 'editing'}
                selectedTableId={layoutEditor.mode === 'view'
                  ? selectedTableId
                  : layoutEditor.selectedTableId}
                selectedTableIds={layoutEditor.mode === 'editing'
                  ? layoutEditor.selectedTableIds
                  : []}
                onSelectTable={layoutEditor.setSelectedTableId}
                onSelectTables={layoutEditor.selectTables}
                onUpdateTableLayout={layoutEditor.updateTableLayout}
                onMoveSelectedTables={layoutEditor.moveSelectedTables}
                syncSelectedResize={layoutEditor.syncSelectedResize}
                onResizeSelectedTables={layoutEditor.resizeSelectedTables}
                immersive={canvasFocused}
                viewportLocked={canvasFocused && layoutEditor.mode === 'editing'}
                selectedDecorationId={layoutEditor.selectedDecorationId}
                onSelectDecoration={(id) => {
                  layoutEditor.setSelectedDecorationId(id);
                  if (id) layoutEditor.setSelectedTableId(null);
                }}
                onUpdateDecoration={layoutEditor.updateDecoration}
                multiSelectMode={layoutEditor.multiSelectMode}
                viewport={layoutEditor.viewport}
                viewportInitialized={layoutEditor.viewportInitialized}
                onViewportChange={layoutEditor.setViewport}
                onInitializeViewport={layoutEditor.initializeViewport}
                onVisibleWorldBoundsChange={layoutEditor.setVisibleWorldBounds}
              />
            </div>
            )
          )}
        </>
      )}

      <TableActionDialog
        table={layoutEditor.mode === 'view' ? selectedTable : null}
        timezone={currentStore?.timezone}
        defaultDurationMinutes={
          selectedTable?.defaultDurationMinutes
          ?? settings?.defaultDurationMinutes
          ?? 90
        }
        initialCustomOpen={customDurationTableId === selectedTableId}
        onRefresh={refreshTimers}
        onClose={handleCloseDialog}
      />
      <CanvasContextMenu
        menu={canvasMenu}
        onClose={() => setCanvasMenu(null)}
        onAction={handleCanvasMenuAction}
      />
      <CanvasTableDialog
        dialog={tableDialog}
        busy={tableMutationBusy}
        onClose={() => setTableDialog(null)}
        onSubmit={submitTableDialog}
      />
      <ConfirmDialog
        open={Boolean(tableMutation)}
        title={['delete', 'stage-delete'].includes(tableMutation?.type)
          ? '永久删除桌台？'
          : '停用桌台？'}
        description={tableMutation?.type === 'stage-delete'
          ? `“${tableMutation?.table.name}”会先从当前草稿移除，点击“保存布局”后才永久删除。已有计时历史的桌台不能永久删除。`
          : tableMutation?.type === 'delete'
          ? `“${tableMutation?.table.name}”将被永久删除；存在计时历史或活动计时时不会执行。`
          : `“${tableMutation?.table.name}”将从当前画布隐藏，但历史记录会保留。`}
        confirmText={tableMutationBusy
          ? '处理中…'
          : tableMutation?.type === 'stage-delete'
            ? '从草稿移除'
            : tableMutation?.type === 'delete'
              ? '永久删除'
              : '确认停用'}
        danger
        onConfirm={confirmTableMutation}
        onCancel={() => {
          if (!tableMutationBusy) setTableMutation(null);
        }}
      />
      <LayoutConflictDialog />
      <WarningAlertDialog
        tables={alerts.newWarningTables}
        onClose={alerts.closeWarningDialog}
      />
      {alerts.overtimeDialogOpen ? (
        <OvertimeAlertDialog
          tables={alerts.unacknowledgedOvertime}
          acknowledging={alerts.acknowledging}
          onAcknowledge={alerts.acknowledgeAll}
          onHandle={() => {
            const firstTable = alerts.unacknowledgedOvertime[0];
            alerts.goHandle();

            if (firstTable) {
              setSelectedTableId(firstTable.tableId);
            }
          }}
        />
      ) : null}
    </div>
  );
}
