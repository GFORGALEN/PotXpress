import { formatDateTimeInTimezone } from './dateTime.js';

const CSV_BOM = '\uFEFF';
const FORMULA_PREFIX_PATTERN = /^[=+\-@]/;

export function escapeCsvCell(value) {
  let text = value === null || value === undefined ? '' : String(value);

  if (FORMULA_PREFIX_PATTERN.test(text)) {
    text = `'${text}`;
  }

  return `"${text.replaceAll('"', '""')}"`;
}

function minutes(seconds) {
  return String(Number((seconds / 60).toFixed(2)));
}

export function buildRecordsCsv(records, timezone) {
  const headers = [
    '桌台',
    '开始时间',
    '计划结束(不含暂停)',
    '暂停后预计结束',
    '实际结束',
    '计划时长(分)',
    '实际时长(分)',
    '暂停时长(分)',
    '调整次数',
    '开台人',
    '清台人',
  ];
  const rows = records.map((record) => [
    record.tableNameSnapshot,
    formatDateTimeInTimezone(record.startTime, timezone),
    formatDateTimeInTimezone(record.plannedEndTime, timezone),
    formatDateTimeInTimezone(record.effectiveEndTimeAtReset, timezone),
    formatDateTimeInTimezone(record.actualEndTime, timezone),
    minutes(record.plannedDurationSeconds),
    minutes(record.actualDurationSeconds),
    minutes(record.totalPausedSeconds),
    record.adjustments.length,
    record.startedByNameSnapshot,
    record.resetByNameSnapshot,
  ]);

  return CSV_BOM + [headers, ...rows]
    .map((row) => row.map(escapeCsvCell).join(','))
    .join('\r\n');
}
