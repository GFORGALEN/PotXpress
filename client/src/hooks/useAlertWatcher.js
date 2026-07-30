import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { acknowledgeTimerAlert } from '../api/timers.ts';
import { useSound } from '../contexts/SoundContext.jsx';
import { useStore } from '../contexts/StoreContext.jsx';
import { useToast } from '../contexts/ToastContext.jsx';

const WARNING_STORAGE_PREFIX = 'potxpress_warning_seen_';
const MAX_WARNING_IDS = 500;

function uniqueTimerTables(tables) {
  const seen = new Set();
  return tables.filter((table) => {
    const key = table.timerId ?? table.tableId;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function readWarningIds(storeId) {
  try {
    const parsed = JSON.parse(
      localStorage.getItem(`${WARNING_STORAGE_PREFIX}${storeId}`) || '[]',
    );
    return Array.isArray(parsed) ? parsed.slice(-MAX_WARNING_IDS) : [];
  } catch (error) {
    return [];
  }
}

export function useAlertWatcher(tables, refreshTimers) {
  const { selectedStoreId } = useStore();
  const { showToast } = useToast();
  const {
    playWarning,
    startOvertimeAlarm,
    stopOvertimeAlarm,
    setAlertCounts,
  } = useSound();
  const seenWarningIdsRef = useRef(new Set());
  const dismissedOvertimeIdsRef = useRef(new Set());
  const [newWarningTables, setNewWarningTables] = useState([]);
  const [overtimeDialogOpen, setOvertimeDialogOpen] = useState(false);
  const [acknowledging, setAcknowledging] = useState(false);
  const warningTables = useMemo(
    () => uniqueTimerTables(
      tables.filter((table) => table.status === 'warning'),
    ),
    [tables],
  );
  const overtimeTables = useMemo(
    () => uniqueTimerTables(
      tables.filter((table) => table.status === 'overtime'),
    ),
    [tables],
  );
  const unacknowledgedOvertime = useMemo(
    () => overtimeTables.filter(
      (table) => table.timer?.overtimeAcknowledged === false,
    ),
    [overtimeTables],
  );

  useEffect(() => {
    seenWarningIdsRef.current = new Set(readWarningIds(selectedStoreId));
    dismissedOvertimeIdsRef.current = new Set();
    setNewWarningTables([]);
    setOvertimeDialogOpen(false);
    stopOvertimeAlarm();
  }, [selectedStoreId, stopOvertimeAlarm]);

  useEffect(() => {
    const nextWarnings = warningTables.filter(
      (table) => table.timerId
        && !seenWarningIdsRef.current.has(table.timerId),
    );

    if (nextWarnings.length === 0) {
      return;
    }

    for (const table of nextWarnings) {
      seenWarningIdsRef.current.add(table.timerId);
    }

    const boundedIds = [...seenWarningIdsRef.current].slice(-MAX_WARNING_IDS);
    seenWarningIdsRef.current = new Set(boundedIds);
    localStorage.setItem(
      `${WARNING_STORAGE_PREFIX}${selectedStoreId}`,
      JSON.stringify(boundedIds),
    );
    setNewWarningTables(nextWarnings);
    playWarning();
  }, [playWarning, selectedStoreId, warningTables]);

  useEffect(() => {
    setAlertCounts({
      warning: warningTables.length,
      overtime: overtimeTables.length,
    });

    if (unacknowledgedOvertime.length === 0) {
      stopOvertimeAlarm();
      setOvertimeDialogOpen(false);
      return;
    }

    startOvertimeAlarm();
    const hasNewUndismissedTimer = unacknowledgedOvertime.some(
      (table) => !dismissedOvertimeIdsRef.current.has(table.timerId),
    );

    if (hasNewUndismissedTimer) {
      setOvertimeDialogOpen(true);
    }
  }, [
    overtimeTables.length,
    setAlertCounts,
    startOvertimeAlarm,
    stopOvertimeAlarm,
    unacknowledgedOvertime,
    warningTables.length,
  ]);

  const acknowledgeAll = useCallback(async () => {
    setAcknowledging(true);
    const results = await Promise.allSettled(
      unacknowledgedOvertime.map((table) => acknowledgeTimerAlert(
        selectedStoreId,
        table.tableId,
      )),
    );
    await refreshTimers();
    const failed = results.filter((result) => result.status === 'rejected');

    if (failed.length > 0) {
      showToast(`${failed.length} 张桌台确认失败，请重试`, 'error');
    } else {
      stopOvertimeAlarm();
      setOvertimeDialogOpen(false);
      showToast('超时提醒已确认', 'success');
    }

    setAcknowledging(false);
  }, [
    refreshTimers,
    selectedStoreId,
    showToast,
    stopOvertimeAlarm,
    unacknowledgedOvertime,
  ]);

  const goHandle = useCallback(() => {
    for (const table of unacknowledgedOvertime) {
      dismissedOvertimeIdsRef.current.add(table.timerId);
    }
    setOvertimeDialogOpen(false);
  }, [unacknowledgedOvertime]);

  return {
    newWarningTables,
    closeWarningDialog: () => setNewWarningTables([]),
    unacknowledgedOvertime,
    overtimeDialogOpen,
    acknowledging,
    acknowledgeAll,
    goHandle,
    reopenOvertime: () => setOvertimeDialogOpen(true),
  };
}
