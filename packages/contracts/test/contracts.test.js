import assert from 'node:assert/strict';
import test from 'node:test';
import {
  timerListSnapshotSchema,
  webSocketServerMessageSchema,
} from '../dist/index.js';

const activeTimer = {
  id: 'timer_1',
  storeId: 'store_1',
  tableId: 'table_1',
  targetType: 'table',
  groupId: null,
  memberTableIds: ['table_1'],
  tableNameSnapshot: '1号桌',
  tableNumberSnapshot: 1,
  startTime: '2026-07-30T10:00:00.000Z',
  plannedDurationSeconds: 3600,
  status: 'warning',
  pauseStartedAt: null,
  totalPausedSeconds: 0,
  adjustments: [],
  overtimeAcknowledged: false,
  startedBy: 'user_1',
  startedByNameSnapshot: '店员',
  createdAt: '2026-07-30T10:00:00.000Z',
  updatedAt: '2026-07-30T10:30:00.000Z',
  remainingSeconds: 1800,
  overtimeSeconds: 0,
  effectiveEndTime: '2026-07-30T11:00:00.000Z',
};

test('Timer 快照契约同时校验持久字段与计算字段', () => {
  const result = timerListSnapshotSchema.parse({
    serverTime: '2026-07-30T10:30:00.000Z',
    eventVersion: 4,
    timers: [activeTimer],
  });

  assert.equal(result.timers[0].status, 'warning');
  assert.equal(result.eventVersion, 4);
});

test('WebSocket 服务消息使用可辨识联合并拒绝未知事件类型', () => {
  const envelope = {
    type: 'event',
    serverInstanceId: 'instance_1',
    event: {
      id: 'event_1',
      storeId: 'store_1',
      version: 5,
      type: 'timer.paused',
      entityType: 'timer',
      entityId: 'timer_1',
      payload: { tableId: 'table_1' },
      createdAt: '2026-07-30T10:31:00.000Z',
    },
  };

  assert.equal(webSocketServerMessageSchema.parse(envelope).type, 'event');
  assert.equal(
    webSocketServerMessageSchema.safeParse({
      ...envelope,
      event: {
        ...envelope.event,
        type: 'timer.unknown',
      },
    }).success,
    false,
  );
});
