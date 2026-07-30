import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  ArrowUpRight,
  LayoutGrid,
  List,
  Maximize2,
  Minimize2,
  Radio,
  RotateCw,
} from 'lucide-react';
import { getLayout } from '../api/layout.ts';
import { listTimers } from '../api/timers.ts';
import { getSettings } from '../api/settings.js';
import {
  OvertimeAlertDialog,
  WarningAlertDialog,
} from '../components/alerts/AlertDialogs.jsx';
import { TimerStatusBanner } from '../components/alerts/TimerStatusBanner.jsx';
import { EmptyState } from '../components/common/EmptyState.jsx';
import { ErrorMessage } from '../components/common/ErrorMessage.jsx';
import { LoadingSpinner } from '../components/common/LoadingSpinner.jsx';
import { FloorCanvas } from '../components/layout/FloorCanvas.jsx';
import { EditorToolbar } from '../components/layout/EditorToolbar.jsx';
import { LayoutConflictDialog } from '../components/layout/LayoutConflictDialog.jsx';
import { TableActionDialog } from '../components/tables/TableActionDialog.jsx';
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

const TIMER_POLL_INTERVAL = 3000;
const CONNECTED_SAFETY_POLL_INTERVAL = 60000;
const CLOCK_RECALIBRATION_POLLS = 30;
const MOBILE_VIEW_STORAGE_KEY = 'potxpress_mobile_dashboard_view';

export function DashboardPage() {
  const { token, user } = useAuth();
  const {
    currentStore,
    selectedStoreId,
    storeEpoch,
    registerStoreRequest,
  } = useStore();
  const { showToast } = useToast();
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
  const [canvasFocused, setCanvasFocused] = useState(false);
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
    setCanvasFocused(false);
    setAreaFilter('all');
    setSettings(null);
    clockOffsetRef.current = 0;
    timerPollCountRef.current = 0;
    timersLoadedRef.current = false;
    pollingFailedRef.current = false;
    setTimerEventVersion(0);
  }, [selectedStoreId, storeEpoch]);

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
    (layout?.tables ?? []).map((table) => ({
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
  const handleTableClick = useCallback((tableId) => {
    if (layoutEditor.mode !== 'view') {
      layoutEditor.setSelectedTableId(tableId);
      return;
    }

    setSelectedTableId(tableId);
  }, [layoutEditor]);
  const handleCloseDialog = useCallback(() => {
    setSelectedTableId(null);
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
    <div className="mx-auto flex max-w-[92rem] flex-col gap-5">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.16em] text-emerald-700">
            <Radio size={14} />
            3 秒实时同步
          </div>
          <h1 className="mt-2 text-2xl font-black tracking-tight text-ink-950 sm:text-3xl">
            {currentStore?.name ?? '桌台看板'}
          </h1>
          <p className="mt-2 text-sm text-stone-500">
            拖动画布查看区域，滚轮或双指缩放；双击空白区域切换显示比例。
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={refreshTimers}
            className="inline-flex items-center gap-2 rounded-2xl border border-stone-200 bg-white px-4 py-2.5 text-sm font-bold text-stone-600 transition hover:border-stone-300 hover:bg-stone-50"
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
              className="hidden items-center gap-2 rounded-2xl bg-ink-900 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-ink-800 md:inline-flex"
            >
              进入布局编辑
              <ArrowUpRight size={16} />
            </button>
          ) : null}
        </div>
      </div>

      {layoutEditor.mode !== 'view' ? <EditorToolbar /> : null}

      {!soundAuthorized ? (
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

      <div className="grid grid-cols-2 gap-2 rounded-2xl bg-stone-200 p-1 md:hidden" aria-label="看板显示方式">
        <button type="button" className={`flex min-h-10 items-center justify-center gap-2 rounded-xl text-sm font-bold ${mobileView === 'list' ? 'bg-white text-ink-950 shadow-card' : 'text-stone-500'}`} onClick={() => changeMobileView('list')}><List size={17} />列表</button>
        <button type="button" className={`flex min-h-10 items-center justify-center gap-2 rounded-xl text-sm font-bold ${mobileView === 'canvas' ? 'bg-white text-ink-950 shadow-card' : 'text-stone-500'}`} onClick={() => changeMobileView('canvas')}><LayoutGrid size={17} />平面图</button>
      </div>
      <TimerStatusBanner
        status="warning"
        tables={warningTables}
        collapsible
      />

      {allTables.length === 0 ? (
        <EmptyState
          title="本店还没有桌台"
          description="请管理员先到 桌台管理 创建桌台。"
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
            isMobile && mobileView === 'list' ? (
              <TableListView
                tables={visibleTables}
                onTableClick={handleTableClick}
              />
            ) : (
            <div className={canvasFocused
              ? 'fixed inset-2 z-50 min-h-0 rounded-[2rem] bg-white p-2 shadow-2xl sm:inset-4'
              : 'relative h-[clamp(34rem,76vh,56rem)] min-h-0'}>
              <button
                type="button"
                onClick={() => setCanvasFocused((value) => !value)}
                className="absolute left-4 top-4 z-40 inline-flex min-h-10 items-center gap-2 rounded-xl border border-stone-200 bg-white/95 px-3 text-sm font-black text-ink-900 shadow-lg backdrop-blur transition hover:bg-stone-50"
                aria-label={canvasFocused ? '退出专注画布' : '专注画布'}
              >
                {canvasFocused ? <Minimize2 size={17} /> : <Maximize2 size={17} />}
                {canvasFocused ? '退出专注' : '专注画布'}
              </button>
              <FloorCanvas
                canvas={layoutEditor.mode === 'view'
                  ? layout.canvas
                  : layoutEditor.draftCanvas}
                tables={layoutEditor.mode === 'view'
                  ? visibleTables
                  : allTables}
                decorations={layoutEditor.mode === 'view'
                  ? layout.decorations ?? []
                  : layoutEditor.draftDecorations}
                timezone={currentStore?.timezone}
                onTableClick={handleTableClick}
                editing={layoutEditor.mode === 'editing'}
                selectedTableId={layoutEditor.selectedTableId}
                onSelectTable={layoutEditor.setSelectedTableId}
                onUpdateTableLayout={layoutEditor.updateTableLayout}
                selectedDecorationId={layoutEditor.selectedDecorationId}
                onSelectDecoration={(id) => {
                  layoutEditor.setSelectedDecorationId(id);
                  layoutEditor.setSelectedTableId(null);
                }}
                onUpdateDecoration={layoutEditor.updateDecoration}
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
        onRefresh={refreshTimers}
        onClose={handleCloseDialog}
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
