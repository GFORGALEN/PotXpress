import { unitOfWorkRepository } from '../repositories/unitOfWork.repository.js';
import { formatDateInTimezone, formatDateTimeInTimezone } from '../utils/dateTime.js';
import { computeTimerState } from '../utils/timeCalculator.ts';
import {
  MAX_OVERDUE_REMINDERS,
  OVERDUE_REMINDER_INTERVAL_SECONDS,
  timerService,
} from './timer.service.js';

function shiftDate(date, offset) {
  return new Date(Date.parse(`${date}T12:00:00Z`) + offset * 86400000).toISOString().slice(0, 10);
}

export function summarizeStore(store, tables, timers, records, period, now, date) {
  const today = formatDateInTimezone(now, store.timezone);
  const days = period === '7d' ? 7 : period === '30d' ? 30 : 1;
  const endDate = period === 'date' ? date : shiftDate(today, period === 'yesterday' ? -1 : 0);
  const startDate = shiftDate(endDate, 1 - days);
  const trend = Array.from({ length: days }, (_, index) => ({ date: shiftDate(startDate, index), count: 0 }));
  const hours = Array.from({ length: 24 }, (_, hour) => ({ hour, count: 0 }));
  const enabledTables = tables.filter((table) => table.enabled);
  const enabledIds = new Set(enabledTables.map((table) => table.id));
  const occupied = new Set();
  const overdue = new Set();
  for (const timer of timers) {
    const isOverdue = computeTimerState(timer, now, 5).status === 'overtime';
    for (const id of timer.memberTableIds) {
      if (enabledIds.has(id)) {
        occupied.add(id);
        if (isOverdue) overdue.add(id);
      }
    }
  }
  // A group has one timer; historical and active copies must never count twice.
  const sessions = new Map(records.map((record) => [record.timerId, { ...record, completed: true }]));
  for (const timer of timers) {
    if (!sessions.has(timer.id)) sessions.set(timer.id, { ...timer, completed: false });
  }
  const selected = [...sessions.values()].filter((session) => {
    const date = formatDateInTimezone(session.startTime, store.timezone);
    return date >= startDate && date <= endDate;
  });
  const tableCounts = new Map();
  for (const session of selected) {
    const date = formatDateInTimezone(session.startTime, store.timezone);
    trend.find((point) => point.date === date).count += 1;
    const hour = Number(formatDateTimeInTimezone(session.startTime, store.timezone).slice(11, 13));
    hours[hour].count += 1;
    for (const id of session.memberTableIds) tableCounts.set(id, (tableCounts.get(id) ?? 0) + 1);
  }
  const completed = selected.filter((session) => session.completed);
  const automaticallyCompleted = completed.filter(
    (session) => session.resetBy === 'system_automation',
  );
  const overtimeCount = completed.filter((session) => Date.parse(session.actualEndTime) > Date.parse(session.effectiveEndTimeAtReset)).length;
  return {
    id: store.id, name: store.name, timezone: store.timezone, startDate, endDate,
    tableCount: enabledTables.length, occupied: occupied.size,
    idle: enabledTables.length - occupied.size, overtime: overdue.size,
    utilization: enabledTables.length ? occupied.size / enabledTables.length : null,
    sessions: selected.length, completed: completed.length,
    manuallyCompleted: completed.length - automaticallyCompleted.length,
    automaticallyCompleted: automaticallyCompleted.length,
    automaticResetRate: completed.length
      ? automaticallyCompleted.length / completed.length
      : null,
    perTable: enabledTables.length ? selected.length / enabledTables.length : null,
    averageMinutes: completed.length ? completed.reduce((sum, session) => sum + session.actualDurationSeconds, 0) / completed.length / 60 : null,
    overtimeRate: completed.length ? overtimeCount / completed.length : null,
    trend, hours,
    tables: tables.map((table) => ({ id: table.id, name: table.name, enabled: table.enabled, sessions: tableCounts.get(table.id) ?? 0, occupied: occupied.has(table.id) })).sort((a, b) => b.sessions - a.sessions),
    recent: selected.sort((a, b) => Date.parse(b.startTime) - Date.parse(a.startTime)).slice(0, 20).map((session) => ({
      id: session.timerId ?? session.id, table: session.tableNameSnapshot,
      startTime: formatDateTimeInTimezone(session.startTime, store.timezone),
      completed: session.completed, minutes: session.completed ? Math.round(session.actualDurationSeconds / 60) : null,
      automaticallyCompleted: session.resetBy === 'system_automation',
      grouped: session.memberTableIds.length > 1,
    })),
  };
}

export async function getDataOverview(
  period,
  date,
  { settleOverdue = true } = {},
) {
  const now = Date.now();
  const day = 86400000;
  const reference = period === 'date'
    ? Date.parse(`${date}T00:00:00Z`)
    : now;
  const lookbackDays = period === '30d' ? 32 : period === '7d' ? 9 : 3;
  const startTimeFrom = new Date(reference - lookbackDays * day).toISOString();
  const startTimeTo = new Date(reference + 2 * day).toISOString();

  const snapshot = await unitOfWorkRepository.run({
    resources: ['stores', 'tables', 'activeTimers', 'records'],
    writeOrder: [],
    readScopes: {
      records: { startTimeFrom, startTimeTo },
    },
  }, (repos) => {
    const timers = repos.activeTimers.find();
    const stores = repos.stores.find((store) => store.enabled).map((store) => summarizeStore(
        store, repos.tables.findByStoreId(store.id), repos.activeTimers.findByStoreId(store.id),
        repos.records.findByStoreId(store.id), period, now, date,
      ));
    const storesRequiringSettlement = [...new Set(timers
      .filter((timer) => (
        computeTimerState(timer, now, 0).overtimeSeconds
        >= MAX_OVERDUE_REMINDERS * OVERDUE_REMINDER_INTERVAL_SECONDS
      ))
      .map((timer) => timer.storeId))];
    return {
      overview: {
        generatedAt: new Date(now).toISOString(), period, stores,
      },
      storesRequiringSettlement,
    };
  });

  if (settleOverdue && snapshot.storesRequiringSettlement.length > 0) {
    for (const storeId of snapshot.storesRequiringSettlement) {
      await timerService.processOverdueTimers({ storeId, now });
    }
    return getDataOverview(period, date, { settleOverdue: false });
  }

  return snapshot.overview;
}
