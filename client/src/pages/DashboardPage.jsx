import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { ArrowUpRight, Radio, RotateCw } from 'lucide-react';
import { getLayout } from '../api/layout.js';
import { listTimers } from '../api/timers.js';
import { TimerStatusBanner } from '../components/alerts/TimerStatusBanner.jsx';
import { EmptyState } from '../components/common/EmptyState.jsx';
import { ErrorMessage } from '../components/common/ErrorMessage.jsx';
import { LoadingSpinner } from '../components/common/LoadingSpinner.jsx';
import { FloorCanvas } from '../components/layout/FloorCanvas.jsx';
import { EditorToolbar } from '../components/layout/EditorToolbar.jsx';
import { LayoutConflictDialog } from '../components/layout/LayoutConflictDialog.jsx';
import { TableDetailDialog } from '../components/tables/TableDetailDialog.jsx';
import { TableFilter } from '../components/tables/TableFilter.jsx';
import { useAuth } from '../contexts/AuthContext.jsx';
import { useStore } from '../contexts/StoreContext.jsx';
import { useToast } from '../contexts/ToastContext.jsx';
import { useLayoutEditor } from '../contexts/LayoutEditorContext.jsx';
import { usePolling } from '../hooks/usePolling.js';
import { useSecondTick } from '../hooks/useSecondTick.js';
import {
  calculateClockOffset,
  deriveTimerDisplay,
} from '../utils/timerDisplay.js';

const TIMER_POLL_INTERVAL = 3000;
const CLOCK_RECALIBRATION_POLLS = 30;

export function DashboardPage() {
  const { user } = useAuth();
  const {
    currentStore,
    selectedStoreId,
    storeEpoch,
    registerStoreRequest,
  } = useStore();
  const { showToast } = useToast();
  const layoutEditor = useLayoutEditor();
  const [layout, setLayout] = useState(null);
  const [timers, setTimers] = useState([]);
  const [layoutError, setLayoutError] = useState(null);
  const [timersError, setTimersError] = useState(null);
  const [layoutRetryEpoch, setLayoutRetryEpoch] = useState(0);
  const [statusFilter, setStatusFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [selectedTableId, setSelectedTableId] = useState(null);
  const clockOffsetRef = useRef(0);
  const timerPollCountRef = useRef(0);
  const timersLoadedRef = useRef(false);
  const pollingFailedRef = useRef(false);
  const now = useSecondTick(Boolean(selectedStoreId));

  useEffect(() => {
    setLayout(null);
    setTimers([]);
    setLayoutError(null);
    setTimersError(null);
    setSelectedTableId(null);
    clockOffsetRef.current = 0;
    timerPollCountRef.current = 0;
    timersLoadedRef.current = false;
    pollingFailedRef.current = false;
  }, [selectedStoreId, storeEpoch]);

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
    }

    timerPollCountRef.current += 1;
    setTimers(result.timers);
    setTimersError(null);

    if (pollingFailedRef.current && timersLoadedRef.current) {
      pollingFailedRef.current = false;
      showToast('连接已恢复', 'success');
    }

    timersLoadedRef.current = true;
  }, [showToast]);

  const handleTimersError = useCallback((error) => {
    if (!timersLoadedRef.current) {
      setTimersError(error);
      return;
    }

    pollingFailedRef.current = true;
  }, []);

  const refreshTimers = usePolling(
    fetchTimers,
    TIMER_POLL_INTERVAL,
    {
      enabled: Boolean(selectedStoreId),
      hiddenIntervalMs: 15000,
      onSuccess: handleTimersSuccess,
      onError: handleTimersError,
      registerController: registerStoreRequest,
    },
  );

  const timerByTableId = useMemo(
    () => new Map(timers.map((timer) => [timer.tableId, timer])),
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
        };
      })
  ), [correctedNow, displayTables, timerByTableId]);
  const normalizedSearch = search.trim().toLocaleLowerCase('zh-CN');
  const visibleTables = useMemo(() => allTables
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
    })), [allTables, normalizedSearch, statusFilter]);
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
    () => allTables.filter((table) => table.status === 'warning'),
    [allTables],
  );
  const overtimeTables = useMemo(
    () => allTables.filter((table) => table.status === 'overtime'),
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

      <TimerStatusBanner
        status="overtime"
        tables={overtimeTables}
      />
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
          <TableFilter
            status={statusFilter}
            search={search}
            counts={counts}
            onStatusChange={setStatusFilter}
            onSearchChange={setSearch}
          />

          {visibleTables.length === 0 ? (
            <EmptyState
              title="没有符合条件的桌台"
              description="请调整状态筛选或清空搜索关键词。"
            />
          ) : (
            <div className="h-[clamp(30rem,68vh,46rem)] min-h-0">
              <FloorCanvas
                canvas={layoutEditor.mode === 'view'
                  ? layout.canvas
                  : layoutEditor.draftCanvas}
                tables={visibleTables}
                timezone={currentStore?.timezone}
                onTableClick={handleTableClick}
                editing={layoutEditor.mode === 'editing'}
                selectedTableId={layoutEditor.selectedTableId}
                onSelectTable={layoutEditor.setSelectedTableId}
                onUpdateTableLayout={layoutEditor.updateTableLayout}
              />
            </div>
          )}
        </>
      )}

      <TableDetailDialog
        table={layoutEditor.mode === 'view' ? selectedTable : null}
        timezone={currentStore?.timezone}
        onClose={handleCloseDialog}
      />
      <LayoutConflictDialog />
    </div>
  );
}
