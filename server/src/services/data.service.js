import { unitOfWorkRepository } from '../repositories/unitOfWork.repository.js';
import { databasePool } from '../storage/database.js';
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

function periodWindow(store, period, now, date) {
  const today = formatDateInTimezone(now, store.timezone);
  const days = period === '7d' ? 7 : period === '30d' ? 30 : 1;
  const endDate = period === 'date' ? date : shiftDate(today, period === 'yesterday' ? -1 : 0);
  return { days, endDate, startDate: shiftDate(endDate, 1 - days) };
}

function isInWindow(value, store, window) {
  const localDate = formatDateInTimezone(value, store.timezone);
  return localDate >= window.startDate && localDate <= window.endDate;
}

function increment(counts, key, amount = 1) {
  counts[key] = (counts[key] ?? 0) + amount;
}

/**
 * 历史记录的统计口径（内存版）。生产路径使用 readRecordStats 在 SQL 中
 * 计算同样的结果；这里保留同一口径用于单元测试与 SQL 结果对照。
 */
export function aggregateRecords(records, store, window, activeTimerIds = new Set()) {
  const stats = {
    sessions: 0, automatic: 0, overtime: 0, durationSum: 0,
    byDay: {}, byHour: {}, byTable: {}, recent: [],
    timerIdsWithRecords: records
      .filter((record) => activeTimerIds.has(record.timerId))
      .map((record) => record.timerId),
  };
  const selected = records.filter((record) => isInWindow(record.startTime, store, window));
  for (const record of selected) {
    stats.sessions += 1;
    if (record.resetBy === 'system_automation') stats.automatic += 1;
    if (Date.parse(record.actualEndTime) > Date.parse(record.effectiveEndTimeAtReset)) stats.overtime += 1;
    stats.durationSum += record.actualDurationSeconds;
    increment(stats.byDay, formatDateInTimezone(record.startTime, store.timezone));
    increment(stats.byHour, Number(formatDateTimeInTimezone(record.startTime, store.timezone).slice(11, 13)));
    for (const id of record.memberTableIds) increment(stats.byTable, id);
  }
  stats.recent = selected
    .sort((a, b) => Date.parse(b.startTime) - Date.parse(a.startTime))
    .slice(0, 20)
    .map((record) => ({
      timerId: record.timerId,
      id: record.id,
      tableNameSnapshot: record.tableNameSnapshot,
      startTime: record.startTime,
      actualDurationSeconds: record.actualDurationSeconds,
      resetBy: record.resetBy,
      memberCount: record.memberTableIds.length,
    }));
  return stats;
}

/**
 * 在 PostgreSQL 中按门店本地日期窗口聚合历史记录。返回体积只与
 * 门店数 × (天数 + 24 小时 + 桌台数 + 20) 有关，与历史记录条数无关。
 */
export async function readRecordStats(windows, activeTimerIds) {
  if (windows.length === 0) return new Map();
  const { rows } = await databasePool.query(
    `WITH windows AS (
       SELECT * FROM unnest($1::text[], $2::text[], $3::date[], $4::date[])
         AS window_row(store_id, timezone, start_date, end_date)
     ),
     picked AS MATERIALIZED (
       SELECT record.id, record.store_id, record.timer_id, record.start_time,
         record.actual_end_time, record.effective_end_time_at_reset,
         record.actual_duration_seconds, record.reset_by, record.table_name_snapshot,
         record.start_time AT TIME ZONE windows.timezone AS local_start
       FROM windows
       JOIN timer_records record
         ON record.store_id = windows.store_id
        AND record.start_time >= windows.start_date::timestamp AT TIME ZONE windows.timezone
        AND record.start_time < (windows.end_date + 1)::timestamp AT TIME ZONE windows.timezone
     )
     SELECT windows.store_id,
       (SELECT jsonb_build_object(
          'sessions', COUNT(*),
          'automatic', COUNT(*) FILTER (WHERE picked.reset_by = 'system_automation'),
          'overtime', COUNT(*) FILTER (WHERE picked.actual_end_time > picked.effective_end_time_at_reset),
          'durationSum', COALESCE(SUM(picked.actual_duration_seconds), 0))
        FROM picked WHERE picked.store_id = windows.store_id) AS totals,
       (SELECT COALESCE(jsonb_object_agg(day_count.local_day, day_count.total), '{}'::jsonb)
        FROM (SELECT picked.local_start::date::text AS local_day, COUNT(*) AS total
              FROM picked WHERE picked.store_id = windows.store_id GROUP BY 1) day_count) AS by_day,
       (SELECT COALESCE(jsonb_object_agg(hour_count.local_hour, hour_count.total), '{}'::jsonb)
        FROM (SELECT EXTRACT(HOUR FROM picked.local_start)::int AS local_hour, COUNT(*) AS total
              FROM picked WHERE picked.store_id = windows.store_id GROUP BY 1) hour_count) AS by_hour,
       (SELECT COALESCE(jsonb_object_agg(table_count.table_id, table_count.total), '{}'::jsonb)
        FROM (SELECT member.table_id, COUNT(*) AS total
              FROM picked JOIN timer_record_members member ON member.record_id = picked.id
              WHERE picked.store_id = windows.store_id GROUP BY 1) table_count) AS by_table,
       (SELECT COALESCE(jsonb_agg(recent_row ORDER BY recent_row."startTime" DESC, recent_row.id DESC), '[]'::jsonb)
        FROM (SELECT picked.timer_id AS "timerId", picked.id,
                picked.table_name_snapshot AS "tableNameSnapshot", picked.start_time AS "startTime",
                picked.actual_duration_seconds AS "actualDurationSeconds", picked.reset_by AS "resetBy",
                (SELECT COUNT(*) FROM timer_record_members member
                 WHERE member.record_id = picked.id)::int AS "memberCount"
              FROM picked WHERE picked.store_id = windows.store_id
              ORDER BY picked.start_time DESC, picked.id DESC LIMIT 20) recent_row) AS recent,
       (SELECT COALESCE(jsonb_agg(record.timer_id), '[]'::jsonb)
        FROM timer_records record
        WHERE record.store_id = windows.store_id AND record.timer_id = ANY($5::text[])) AS timer_ids_with_records
     FROM windows`,
    [
      windows.map((window) => window.storeId),
      windows.map((window) => window.timezone),
      windows.map((window) => window.startDate),
      windows.map((window) => window.endDate),
      [...activeTimerIds],
    ],
  );
  const numbers = (counts) => Object.fromEntries(
    Object.entries(counts).map(([key, value]) => [key, Number(value)]),
  );

  return new Map(rows.map((row) => [row.store_id, {
    sessions: Number(row.totals.sessions),
    automatic: Number(row.totals.automatic),
    overtime: Number(row.totals.overtime),
    durationSum: Number(row.totals.durationSum),
    byDay: numbers(row.by_day),
    byHour: numbers(row.by_hour),
    byTable: numbers(row.by_table),
    recent: row.recent.map((entry) => ({
      ...entry,
      startTime: new Date(entry.startTime).toISOString(),
    })),
    timerIdsWithRecords: row.timer_ids_with_records,
  }]));
}

export function summarizeStoreFromStats(store, tables, timers, stats, window, period, now) {
  const trend = Array.from({ length: window.days }, (_, index) => ({ date: shiftDate(window.startDate, index), count: 0 }));
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
  const recorded = new Set(stats.timerIdsWithRecords);
  const activeSessions = timers.filter((timer) => (
    !recorded.has(timer.id) && isInWindow(timer.startTime, store, window)
  ));

  const byDay = { ...stats.byDay };
  const byHour = { ...stats.byHour };
  const tableCounts = { ...stats.byTable };
  for (const timer of activeSessions) {
    increment(byDay, formatDateInTimezone(timer.startTime, store.timezone));
    increment(byHour, Number(formatDateTimeInTimezone(timer.startTime, store.timezone).slice(11, 13)));
    for (const id of timer.memberTableIds) increment(tableCounts, id);
  }
  for (const point of trend) point.count = byDay[point.date] ?? 0;
  for (const point of hours) point.count = byHour[point.hour] ?? 0;

  const sessions = stats.sessions + activeSessions.length;
  const completed = stats.sessions;
  const recent = [
    ...stats.recent.map((record) => ({ ...record, completed: true })),
    ...activeSessions.map((timer) => ({
      timerId: timer.id,
      id: timer.id,
      tableNameSnapshot: timer.tableNameSnapshot,
      startTime: timer.startTime,
      resetBy: null,
      memberCount: timer.memberTableIds.length,
      completed: false,
    })),
  ].sort((a, b) => Date.parse(b.startTime) - Date.parse(a.startTime)).slice(0, 20);

  return {
    id: store.id, name: store.name, timezone: store.timezone,
    startDate: window.startDate, endDate: window.endDate,
    tableCount: enabledTables.length, occupied: occupied.size,
    idle: enabledTables.length - occupied.size, overtime: overdue.size,
    utilization: enabledTables.length ? occupied.size / enabledTables.length : null,
    sessions, completed,
    manuallyCompleted: completed - stats.automatic,
    automaticallyCompleted: stats.automatic,
    automaticResetRate: completed ? stats.automatic / completed : null,
    perTable: enabledTables.length ? sessions / enabledTables.length : null,
    averageMinutes: completed ? stats.durationSum / completed / 60 : null,
    overtimeRate: completed ? stats.overtime / completed : null,
    trend, hours,
    tables: tables.map((table) => ({ id: table.id, name: table.name, enabled: table.enabled, sessions: tableCounts[table.id] ?? 0, occupied: occupied.has(table.id) })).sort((a, b) => b.sessions - a.sessions),
    recent: recent.map((session) => ({
      id: session.timerId ?? session.id, table: session.tableNameSnapshot,
      startTime: formatDateTimeInTimezone(session.startTime, store.timezone),
      completed: session.completed, minutes: session.completed ? Math.round(session.actualDurationSeconds / 60) : null,
      automaticallyCompleted: session.resetBy === 'system_automation',
      grouped: session.memberCount > 1,
    })),
  };
}

/** 内存版入口：给定原始记录数组计算门店概览（单元测试使用）。 */
export function summarizeStore(store, tables, timers, records, period, now, date) {
  const window = periodWindow(store, period, now, date);
  const stats = aggregateRecords(records, store, window, new Set(timers.map((timer) => timer.id)));
  return summarizeStoreFromStats(store, tables, timers, stats, window, period, now);
}

export async function getDataOverview(period, date) {
  const now = Date.now();

  // 门店、桌台、活动计时都是规模有上限的配置/实时数据；历史记录只取聚合结果。
  const snapshot = await unitOfWorkRepository.run({
    resources: ['stores', 'tables', 'activeTimers'],
    writeOrder: [],
  }, (repos) => ({
    stores: repos.stores.find((store) => store.enabled),
    tables: repos.tables.find(),
    timers: repos.activeTimers.find(),
  }));

  const windows = snapshot.stores.map((store) => ({
    storeId: store.id,
    timezone: store.timezone,
    ...periodWindow(store, period, now, date),
  }));
  const statsByStore = await readRecordStats(
    windows,
    new Set(snapshot.timers.map((timer) => timer.id)),
  );

  const stores = snapshot.stores.map((store, index) => summarizeStoreFromStats(
    store,
    snapshot.tables.filter((table) => table.storeId === store.id),
    snapshot.timers.filter((timer) => timer.storeId === store.id),
    statsByStore.get(store.id),
    windows[index],
    period,
    now,
  ));

  // 只读接口：需要结算的门店交给后台结算，不在 GET 请求里写库或重算。
  const storesRequiringSettlement = new Set(snapshot.timers
    .filter((timer) => (
      computeTimerState(timer, now, 0).overtimeSeconds
      >= MAX_OVERDUE_REMINDERS * OVERDUE_REMINDER_INTERVAL_SECONDS
    ))
    .map((timer) => timer.storeId));
  for (const storeId of storesRequiringSettlement) {
    timerService.requestSettlement(storeId);
  }

  return { generatedAt: new Date(now).toISOString(), period, stores };
}
