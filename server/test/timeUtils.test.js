import assert from 'node:assert/strict';
import test from 'node:test';
import { buildRecordsCsv } from '../src/utils/csv.js';
import {
  formatDateInTimezone,
  formatDateTimeInTimezone,
} from '../src/utils/dateTime.js';
import {
  computeTimerState,
  getTableStatus,
} from '../src/utils/timeCalculator.ts';

function makeTimer(overrides = {}) {
  return {
    startTime: '2026-01-01T00:00:00.000Z',
    plannedDurationSeconds: 60,
    status: 'running',
    pauseStartedAt: null,
    totalPausedSeconds: 0,
    ...overrides,
  };
}

test('timeCalculator 使用未取整边界并统一对外秒数', () => {
  const timer = makeTimer();
  assert.deepEqual(
    computeTimerState(timer, Date.parse(timer.startTime), 0.5),
    {
      status: 'running',
      remainingSeconds: 60,
      overtimeSeconds: 0,
      effectiveEndTime: '2026-01-01T00:01:00.000Z',
    },
  );

  assert.equal(
    computeTimerState(
      timer,
      Date.parse('2026-01-01T00:00:30.000Z'),
      0.5,
    ).status,
    'warning',
  );
  assert.deepEqual(
    computeTimerState(
      timer,
      Date.parse('2026-01-01T00:01:10.900Z'),
      0.5,
    ),
    {
      status: 'overtime',
      remainingSeconds: 0,
      overtimeSeconds: 10,
      effectiveEndTime: '2026-01-01T00:01:00.000Z',
    },
  );
  assert.equal(getTableStatus(null, Date.now(), 10), 'idle');
});

test('paused 状态在时间推进后保持冻结的剩余秒数', () => {
  const timer = makeTimer({
    plannedDurationSeconds: 300,
    status: 'paused',
    pauseStartedAt: '2026-01-01T00:00:30.000Z',
  });
  const atPause = computeTimerState(
    timer,
    Date.parse('2026-01-01T00:00:30.000Z'),
    1,
  );
  const afterOneMinute = computeTimerState(
    timer,
    Date.parse('2026-01-01T00:01:30.000Z'),
    1,
  );
  assert.equal(atPause.status, 'paused');
  assert.equal(atPause.remainingSeconds, 270);
  assert.equal(afterOneMinute.remainingSeconds, 270);
  assert.equal(
    afterOneMinute.effectiveEndTime,
    '2026-01-01T00:06:00.000Z',
  );
});

test('Pacific/Auckland 日期格式覆盖跨午夜和夏令时回拨', () => {
  const timezone = 'Pacific/Auckland';
  assert.equal(
    formatDateInTimezone('2026-01-01T10:59:00.000Z', timezone),
    '2026-01-01',
  );
  assert.equal(
    formatDateInTimezone('2026-01-01T11:01:00.000Z', timezone),
    '2026-01-02',
  );
  assert.equal(
    formatDateInTimezone('2026-04-04T13:30:00.000Z', timezone),
    '2026-04-05',
  );
  assert.equal(
    formatDateInTimezone('2026-04-04T14:30:00.000Z', timezone),
    '2026-04-05',
  );
  assert.equal(
    formatDateTimeInTimezone(
      '2026-04-04T14:30:00.000Z',
      timezone,
    ),
    '2026-04-05 02:30:00',
  );
});

test('CSV 包含 BOM、RFC 4180 转义和公式注入保护', () => {
  const record = {
    tableNameSnapshot: '=HYPERLINK("bad"),桌\n台',
    startTime: '2026-01-01T00:00:00.000Z',
    plannedEndTime: '2026-01-01T01:00:00.000Z',
    effectiveEndTimeAtReset: '2026-01-01T01:10:00.000Z',
    actualEndTime: '2026-01-01T01:20:00.000Z',
    plannedDurationSeconds: 3600,
    actualDurationSeconds: 4200,
    totalPausedSeconds: 600,
    adjustments: [{ type: 'add' }],
    startedByNameSnapshot: '+开台人',
    resetByNameSnapshot: '清"台人',
  };
  const csv = buildRecordsCsv([record], 'Pacific/Auckland');

  assert.equal(csv.startsWith('\uFEFF'), true);
  assert.match(csv, /"桌台"/);
  assert.match(csv, /"'=HYPERLINK\(""bad""\),桌\n台"/);
  assert.match(csv, /"'\+开台人"/);
  assert.match(csv, /"清""台人"/);
  assert.equal(csv.includes('\r\n'), true);
});
