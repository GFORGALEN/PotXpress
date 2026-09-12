import { v4 as uuidv4 } from 'uuid';
import { unitOfWorkRepository } from '../repositories/unitOfWork.repository.js';
import { appendRealtimeEvent, getStoreEventVersion } from '../realtime/realtimeEvent.js';
import { realtimeHub } from '../realtime/realtimeHub.js';
import { AppError } from '../utils/appError.js';
import { appendAuditLog } from '../utils/audit.js';
import { runIdempotentMutation } from '../utils/idempotency.js';
import {
  computeRawRemainingSeconds,
  computeTimerState,
} from '../utils/timeCalculator.ts';

const MIN_DURATION_SECONDS = 60;
const MAX_DURATION_SECONDS = 28800;
export const OVERDUE_REMINDER_INTERVAL_SECONDS = 20 * 60;
export const MAX_OVERDUE_REMINDERS = 2;
const AUTOMATION_ACTOR = Object.freeze({
  userId: 'system_automation',
  displayName: '系统自动清台',
});
const TIMER_EVENT_TYPES = Object.freeze({
  'timer.pause': 'timer.paused',
  'timer.resume': 'timer.resumed',
  'timer.adjust': 'timer.adjusted',
  'timer.transfer': 'timer.transferred',
  'timer.acknowledge_alert': 'timer.alert_acknowledged',
});

function getSettings(settings, storeId) {
  const entry = settings.findById(storeId);

  if (!entry) {
    throw new AppError(404, 'SETTINGS_NOT_FOUND', '门店设置不存在');
  }

  return entry;
}

function assertTimerContext(
  repositories,
  { storeId, tableId, user, allowDisabledStore = false },
) {
  const store = repositories.stores.findById(storeId);

  if (!store) {
    throw new AppError(404, 'STORE_NOT_FOUND', '门店不存在');
  }

  if (
    !store.enabled
    && !(allowDisabledStore && user.role === 'system_admin')
  ) {
    throw new AppError(
      403,
      'STORE_DISABLED',
      '门店已停用，不能执行该计时操作',
    );
  }

  const table = repositories.tables.findById(tableId);

  if (!table || table.storeId !== storeId) {
    throw new AppError(404, 'TABLE_NOT_FOUND', '桌台不存在');
  }

  if (!table.enabled) {
    throw new AppError(
      409,
      'TIMER_STATE_CONFLICT',
      '桌台已停用，不能执行计时操作',
    );
  }

  const group = repositories.tableGroups?.findOne((candidate) => (
    candidate.enabled
    && candidate.storeId === storeId
    && candidate.tableIds.includes(tableId)
  )) ?? null;

  return { store, table, group };
}

function findTimer(activeTimers, storeId, tableId) {
  return activeTimers.findOne(
    (timer) => (
      timer.storeId === storeId
      && (timer.memberTableIds ?? [timer.tableId]).includes(tableId)
    ),
  );
}

function timerConflict(message) {
  throw new AppError(409, 'TIMER_STATE_CONFLICT', message);
}

function reminderCountForTimer(timerInterventionRecords, timer, now) {
  if (!timerInterventionRecords) {
    return 0;
  }

  const { effectiveEndMilliseconds } = computeRawRemainingSeconds(timer, now);

  return timerInterventionRecords.find((record) => (
    record.timerId === timer.id
    && record.reminderNumber !== null
    && Date.parse(record.createdAt) >= effectiveEndMilliseconds
  )).reduce(
    (count, record) => Math.max(count, record.reminderNumber),
    0,
  );
}

function timerResponse(
  timer,
  now,
  warningThresholdMinutes,
  overdueReminderCount = 0,
) {
  return {
    ...timer,
    ...computeTimerState(timer, now, warningThresholdMinutes),
    overdueReminderCount,
  };
}

function timerAuditSnapshot(timer) {
  return {
    id: timer.id,
    tableId: timer.tableId,
    targetType: timer.targetType,
    groupId: timer.groupId,
    memberTableIds: timer.memberTableIds,
    plannedDurationSeconds: timer.plannedDurationSeconds,
    status: timer.status,
    pauseStartedAt: timer.pauseStartedAt,
    totalPausedSeconds: timer.totalPausedSeconds,
    adjustmentCount: timer.adjustments.length,
    overtimeAcknowledged: timer.overtimeAcknowledged,
  };
}

function buildResetRecord(timer, now, timestamp, actor) {
  const currentPauseSeconds = timer.status === 'paused'
    ? Math.max(
      0,
      Math.round((now - Date.parse(timer.pauseStartedAt)) / 1000),
    )
    : 0;
  const totalPausedSeconds = timer.totalPausedSeconds + currentPauseSeconds;
  const elapsedSeconds = Math.max(
    0,
    Math.round((now - Date.parse(timer.startTime)) / 1000),
  );
  const startMilliseconds = Date.parse(timer.startTime);

  return {
    id: `record_${uuidv4()}`,
    timerId: timer.id,
    storeId: timer.storeId,
    tableId: timer.tableId,
    targetType: timer.targetType,
    groupId: timer.groupId,
    memberTableIds: structuredClone(timer.memberTableIds),
    tableNameSnapshot: timer.tableNameSnapshot,
    tableNumberSnapshot: timer.tableNumberSnapshot,
    startTime: timer.startTime,
    plannedEndTime: new Date(
      startMilliseconds + timer.plannedDurationSeconds * 1000,
    ).toISOString(),
    effectiveEndTimeAtReset: new Date(
      startMilliseconds + (
        timer.plannedDurationSeconds + totalPausedSeconds
      ) * 1000,
    ).toISOString(),
    actualEndTime: timestamp,
    plannedDurationSeconds: timer.plannedDurationSeconds,
    actualDurationSeconds: Math.max(0, elapsedSeconds - totalPausedSeconds),
    totalPausedSeconds,
    adjustments: structuredClone(timer.adjustments),
    startedBy: timer.startedBy,
    startedByNameSnapshot: timer.startedByNameSnapshot,
    resetBy: actor.userId,
    resetByNameSnapshot: actor.displayName,
    finalStatus: 'reset',
    createdAt: timestamp,
  };
}

function resetTimerInRepositories(repositories, timer, now, timestamp, actor) {
  if (
    repositories.records.findOne(
      (candidate) => candidate.timerId === timer.id,
    )
  ) {
    timerConflict('该计时器已经生成历史记录');
  }

  const record = buildResetRecord(timer, now, timestamp, actor);
  repositories.records.create(record);
  repositories.activeTimers.delete(timer.id);
  return record;
}

function buildInterventionRecord({
  timer,
  action,
  reminderNumber,
  overtimeSeconds,
  timerRecordId = null,
  actor = null,
  timestamp,
}) {
  return {
    id: `intervention_${uuidv4()}`,
    timerId: timer.id,
    storeId: timer.storeId,
    tableId: timer.tableId,
    targetType: timer.targetType,
    groupId: timer.groupId,
    memberTableIds: structuredClone(timer.memberTableIds),
    tableNameSnapshot: timer.tableNameSnapshot,
    tableNumberSnapshot: timer.tableNumberSnapshot,
    action,
    reminderNumber,
    thresholdSeconds: reminderNumber === null
      ? null
      : reminderNumber * OVERDUE_REMINDER_INTERVAL_SECONDS,
    overtimeSeconds,
    timerRecordId,
    actorUserId: actor?.userId ?? null,
    actorNameSnapshot: actor?.displayName ?? null,
    createdAt: timestamp,
  };
}

export class TimerService {
  constructor({ nowProvider = Date.now } = {}) {
    this.nowProvider = nowProvider;
  }

  setNowProvider(nowProvider) {
    this.nowProvider = nowProvider;
  }

  async list(storeId) {
    const now = this.nowProvider();

    return unitOfWorkRepository.run(
      {
        resources: [
          'settings',
          'activeTimers',
          'timerInterventionRecords',
          'realtimeEvents',
        ],
        writeOrder: [],
      },
      ({
        settings,
        activeTimers,
        timerInterventionRecords,
        realtimeEvents,
      }) => {
        const storeSettings = getSettings(settings, storeId);
        const timers = activeTimers.findByStoreId(storeId)
          .sort(
            (left, right) => (
              left.tableNumberSnapshot - right.tableNumberSnapshot
            ),
          )
          .map((timer) => timerResponse(
            timer,
            now,
            storeSettings.warningThresholdMinutes,
            reminderCountForTimer(timerInterventionRecords, timer, now),
          ));

        return {
          serverTime: new Date(now).toISOString(),
          eventVersion: getStoreEventVersion(realtimeEvents, storeId),
          timers,
        };
      },
    );
  }

  async start({
    storeId,
    tableId,
    durationMinutes,
    idempotencyKey,
    user,
  }) {
    const now = this.nowProvider();
    const timestamp = new Date(now).toISOString();
    let committedEvent = null;

    const outcome = await unitOfWorkRepository.run(
      {
        resources: [
          'stores',
          'tables',
          'settings',
          'activeTimers',
          'timerInterventionRecords',
          'tableGroups',
          'auditLogs',
          'idempotencyKeys',
          'realtimeEvents',
        ],
        writeOrder: [
          'activeTimers',
          'auditLogs',
          'idempotencyKeys',
          'realtimeEvents',
        ],
      },
      (repositories) => runIdempotentMutation({
        idempotencyKeys: repositories.idempotencyKeys,
        key: idempotencyKey,
        user,
        storeId,
        operation: 'timer.start',
        request: { tableId, durationMinutes: durationMinutes ?? null },
        now,
        execute: () => {
          const { table, group } = assertTimerContext(
            repositories,
            { storeId, tableId, user },
          );
          const storeSettings = getSettings(repositories.settings, storeId);
          const memberTableIds = group?.tableIds ?? [tableId];

          if (memberTableIds.some((memberId) => (
            findTimer(repositories.activeTimers, storeId, memberId)
          ))) {
            timerConflict(group ? '拼桌组已有活动计时' : '桌台已有活动计时');
          }

          const plannedDurationMinutes = (
            durationMinutes
            ?? table.defaultDurationMinutes
            ?? storeSettings.defaultDurationMinutes
          );
          const primaryTable = group
            ? repositories.tables.findById(group.tableIds[0])
            : table;
          const createdTimer = {
            id: `timer_${uuidv4()}`,
            storeId,
            tableId: primaryTable.id,
            targetType: group ? 'group' : 'table',
            groupId: group?.id ?? null,
            memberTableIds,
            tableNameSnapshot: group?.name ?? table.name,
            tableNumberSnapshot: primaryTable.number,
            startTime: timestamp,
            plannedDurationSeconds: plannedDurationMinutes * 60,
            status: 'running',
            pauseStartedAt: null,
            totalPausedSeconds: 0,
            adjustments: [],
            overtimeAcknowledged: false,
            startedBy: user.userId,
            startedByNameSnapshot: user.displayName,
            createdAt: timestamp,
            updatedAt: timestamp,
          };
          repositories.activeTimers.create(createdTimer);
          appendAuditLog(repositories.auditLogs, {
            userId: user.userId,
            userNameSnapshot: user.displayName,
            storeId,
            action: 'timer.start',
            targetType: 'timer',
            targetId: createdTimer.id,
            dataBefore: null,
            dataAfter: timerAuditSnapshot(createdTimer),
          }, { timestamp });
          committedEvent = appendRealtimeEvent(
            repositories.realtimeEvents,
            {
              storeId,
              type: 'timer.started',
              entityType: 'timer',
              entityId: createdTimer.id,
              payload: {
                tableId: createdTimer.tableId,
                groupId: createdTimer.groupId,
                memberTableIds: createdTimer.memberTableIds,
              },
              timestamp,
            },
          );

          return timerResponse(
            createdTimer,
            now,
            storeSettings.warningThresholdMinutes,
          );
        },
      }),
    );

    if (!outcome.replayed && committedEvent) {
      realtimeHub.publish(committedEvent);
    }
    return outcome;
  }

  async pause({ storeId, tableId, idempotencyKey, user }) {
    return this.updateTimer({
      storeId,
      tableId,
      idempotencyKey,
      user,
      action: 'timer.pause',
      request: { tableId },
      updater: (timer, now, timestamp) => {
        if (timer.status !== 'running') {
          timerConflict('计时器当前不是运行状态，不能暂停');
        }

        return {
          ...timer,
          status: 'paused',
          pauseStartedAt: timestamp,
          updatedAt: timestamp,
        };
      },
    });
  }

  async resume({ storeId, tableId, idempotencyKey, user }) {
    return this.updateTimer({
      storeId,
      tableId,
      idempotencyKey,
      user,
      action: 'timer.resume',
      request: { tableId },
      updater: (timer, now, timestamp) => {
        if (timer.status !== 'paused') {
          timerConflict('计时器当前不是暂停状态，不能继续');
        }

        const currentPauseSeconds = Math.max(
          0,
          Math.round((now - Date.parse(timer.pauseStartedAt)) / 1000),
        );

        return {
          ...timer,
          status: 'running',
          pauseStartedAt: null,
          totalPausedSeconds: (
            timer.totalPausedSeconds + currentPauseSeconds
          ),
          updatedAt: timestamp,
        };
      },
    });
  }

  async adjust({
    storeId,
    tableId,
    deltaSeconds,
    reason,
    idempotencyKey,
    user,
  }) {
    return this.updateTimer({
      storeId,
      tableId,
      idempotencyKey,
      user,
      action: 'timer.adjust',
      request: {
        tableId,
        deltaSeconds,
        reason: reason?.trim() || null,
      },
      updater: (timer, now, timestamp) => {
        const nextDuration = Math.min(
          MAX_DURATION_SECONDS,
          Math.max(
            MIN_DURATION_SECONDS,
            timer.plannedDurationSeconds + deltaSeconds,
          ),
        );
        const appliedDelta = nextDuration - timer.plannedDurationSeconds;

        if (appliedDelta === 0) {
          throw new AppError(
            400,
            'VALIDATION_ERROR',
            '调整后时长没有发生变化',
          );
        }

        const beforeRemaining = computeRawRemainingSeconds(
          timer,
          now,
        ).rawRemainingSeconds;
        const adjustedTimer = {
          ...timer,
          plannedDurationSeconds: nextDuration,
          adjustments: [
            ...timer.adjustments,
            {
              type: appliedDelta > 0 ? 'add' : 'subtract',
              seconds: Math.abs(appliedDelta),
              requestedSeconds: Math.abs(deltaSeconds),
              reason: reason?.trim() || null,
              by: user.userId,
              byNameSnapshot: user.displayName,
              at: timestamp,
            },
          ],
          updatedAt: timestamp,
        };
        const afterRemaining = computeRawRemainingSeconds(
          adjustedTimer,
          now,
        ).rawRemainingSeconds;

        if (beforeRemaining <= 0 && afterRemaining > 0) {
          adjustedTimer.overtimeAcknowledged = false;
        }

        return adjustedTimer;
      },
    });
  }

  async acknowledgeAlert({
    storeId,
    tableId,
    idempotencyKey,
    user,
  }) {
    return this.updateTimer({
      storeId,
      tableId,
      idempotencyKey,
      user,
      action: 'timer.acknowledge_alert',
      request: { tableId },
      auditWhenUnchanged: false,
      updater: (timer, now, timestamp, warningThresholdMinutes) => {
        const state = computeTimerState(
          timer,
          now,
          warningThresholdMinutes,
        );

        if (state.status !== 'overtime') {
          timerConflict('只有已超时的计时器可以确认提醒');
        }

        if (timer.overtimeAcknowledged) {
          return timer;
        }

        return {
          ...timer,
          overtimeAcknowledged: true,
          updatedAt: timestamp,
        };
      },
    });
  }

  async transfer({
    storeId,
    tableId,
    targetTableId,
    idempotencyKey,
    user,
  }) {
    const now = this.nowProvider();
    const timestamp = new Date(now).toISOString();
    let committedEvent = null;

    const outcome = await unitOfWorkRepository.run(
      {
        resources: [
          'stores',
          'tables',
          'settings',
          'activeTimers',
          'timerInterventionRecords',
          'tableGroups',
          'auditLogs',
          'idempotencyKeys',
          'realtimeEvents',
        ],
        writeOrder: [
          'activeTimers',
          'auditLogs',
          'idempotencyKeys',
          'realtimeEvents',
        ],
      },
      (repositories) => runIdempotentMutation({
        idempotencyKeys: repositories.idempotencyKeys,
        key: idempotencyKey,
        user,
        storeId,
        operation: 'timer.transfer',
        request: { tableId, targetTableId },
        now,
        execute: () => {
          if (tableId === targetTableId) {
            timerConflict('目标桌台不能与当前桌台相同');
          }

          const sourceContext = assertTimerContext(
            repositories,
            { storeId, tableId, user },
          );
          const timer = findTimer(
            repositories.activeTimers,
            storeId,
            tableId,
          );

          if (!timer) {
            timerConflict('当前桌台没有活动计时');
          }
          if (timer.targetType !== 'table' || sourceContext.group) {
            timerConflict('拼桌计时不能直接更换桌台');
          }

          const targetContext = assertTimerContext(
            repositories,
            { storeId, tableId: targetTableId, user },
          );
          if (targetContext.group) {
            timerConflict('目标桌台属于拼桌组，不能用于普通换桌');
          }
          if (findTimer(repositories.activeTimers, storeId, targetTableId)) {
            timerConflict('目标桌台已被占用，请重新选择');
          }

          const before = structuredClone(timer);
          const updated = repositories.activeTimers.update(timer.id, {
            ...timer,
            tableId: targetContext.table.id,
            memberTableIds: [targetContext.table.id],
            tableNameSnapshot: targetContext.table.name,
            tableNumberSnapshot: targetContext.table.number,
            updatedAt: timestamp,
          });
          appendAuditLog(repositories.auditLogs, {
            userId: user.userId,
            userNameSnapshot: user.displayName,
            storeId,
            action: 'timer.transfer',
            targetType: 'timer',
            targetId: updated.id,
            dataBefore: timerAuditSnapshot(before),
            dataAfter: timerAuditSnapshot(updated),
          }, { timestamp });
          committedEvent = appendRealtimeEvent(
            repositories.realtimeEvents,
            {
              storeId,
              type: 'timer.transferred',
              entityType: 'timer',
              entityId: updated.id,
              payload: {
                sourceTableId: tableId,
                targetTableId,
                tableId: updated.tableId,
                memberTableIds: updated.memberTableIds,
              },
              timestamp,
            },
          );

          return timerResponse(
            updated,
            now,
            getSettings(repositories.settings, storeId).warningThresholdMinutes,
            reminderCountForTimer(
              repositories.timerInterventionRecords,
              updated,
              now,
            ),
          );
        },
      }),
    );

    if (!outcome.replayed && committedEvent) {
      realtimeHub.publish(committedEvent);
    }
    return outcome;
  }

  async reset({ storeId, tableId, idempotencyKey, user }) {
    const now = this.nowProvider();
    const timestamp = new Date(now).toISOString();
    let committedEvent = null;

    const outcome = await unitOfWorkRepository.run(
      {
        resources: [
          'stores',
          'tables',
          'tableGroups',
          'activeTimers',
          'records',
          'auditLogs',
          'idempotencyKeys',
          'realtimeEvents',
        ],
        writeOrder: [
          'records',
          'activeTimers',
          'auditLogs',
          'idempotencyKeys',
          'realtimeEvents',
        ],
      },
      (repositories) => runIdempotentMutation({
        idempotencyKeys: repositories.idempotencyKeys,
        key: idempotencyKey,
        user,
        storeId,
        operation: 'timer.reset',
        request: { tableId },
        now,
        execute: () => {
          assertTimerContext(
            repositories,
            {
              storeId,
              tableId,
              user,
              allowDisabledStore: true,
            },
          );
          const timer = findTimer(
            repositories.activeTimers,
            storeId,
            tableId,
          );

          if (!timer) {
            timerConflict('桌台当前没有活动计时');
          }

          const timerBefore = structuredClone(timer);
          const record = resetTimerInRepositories(
            repositories,
            timer,
            now,
            timestamp,
            user,
          );
          appendAuditLog(repositories.auditLogs, {
            userId: user.userId,
            userNameSnapshot: user.displayName,
            storeId,
            action: 'timer.reset',
            targetType: 'timer',
            targetId: timerBefore.id,
            dataBefore: timerAuditSnapshot(timerBefore),
            dataAfter: {
              recordId: record.id,
              actualDurationSeconds: record.actualDurationSeconds,
              totalPausedSeconds: record.totalPausedSeconds,
            },
          }, { timestamp });
          committedEvent = appendRealtimeEvent(
            repositories.realtimeEvents,
            {
              storeId,
              type: 'timer.reset',
              entityType: 'timer',
              entityId: timerBefore.id,
              payload: {
                tableId: timerBefore.tableId,
                groupId: timerBefore.groupId,
                memberTableIds: timerBefore.memberTableIds,
                recordId: record.id,
              },
              timestamp,
            },
          );

          return {
            record,
            tableStatus: 'idle',
          };
        },
      }),
    );

    if (!outcome.replayed && committedEvent) {
      realtimeHub.publish(committedEvent);
    }
    return outcome;
  }

  async resetAll({ storeId, idempotencyKey, user }) {
    const now = this.nowProvider();
    const timestamp = new Date(now).toISOString();
    let committedEvent = null;

    const outcome = await unitOfWorkRepository.run(
      {
        resources: [
          'stores',
          'activeTimers',
          'records',
          'timerInterventionRecords',
          'auditLogs',
          'idempotencyKeys',
          'realtimeEvents',
        ],
        writeOrder: [
          'records',
          'timerInterventionRecords',
          'activeTimers',
          'auditLogs',
          'idempotencyKeys',
          'realtimeEvents',
        ],
      },
      (repositories) => runIdempotentMutation({
        idempotencyKeys: repositories.idempotencyKeys,
        key: idempotencyKey,
        user,
        storeId,
        operation: 'timer.reset_all',
        request: { storeId },
        now,
        execute: () => {
          const store = repositories.stores.findById(storeId);
          if (!store) {
            throw new AppError(404, 'STORE_NOT_FOUND', '门店不存在');
          }
          if (!store.enabled && user.role !== 'system_admin') {
            throw new AppError(403, 'STORE_DISABLED', '门店已停用');
          }

          const timers = repositories.activeTimers
            .findByStoreId(storeId)
            .sort(
              (left, right) => (
                left.tableNumberSnapshot - right.tableNumberSnapshot
              ),
            );
          const records = timers.map((timer) => {
            const record = resetTimerInRepositories(
              repositories,
              timer,
              now,
              timestamp,
              user,
            );
            const { rawRemainingSeconds } = computeRawRemainingSeconds(
              timer,
              now,
            );
            repositories.timerInterventionRecords.create(
              buildInterventionRecord({
                timer,
                action: 'admin_bulk_reset',
                reminderNumber: null,
                overtimeSeconds: Math.max(
                  0,
                  Math.floor(-rawRemainingSeconds),
                ),
                timerRecordId: record.id,
                actor: user,
                timestamp,
              }),
            );
            return record;
          });

          appendAuditLog(repositories.auditLogs, {
            userId: user.userId,
            userNameSnapshot: user.displayName,
            storeId,
            action: 'timer.reset_all',
            targetType: 'timer_batch',
            targetId: null,
            dataBefore: {
              count: timers.length,
              timerIds: timers.map((timer) => timer.id),
            },
            dataAfter: {
              count: records.length,
              recordIds: records.map((record) => record.id),
            },
          }, { timestamp });

          if (records.length > 0) {
            committedEvent = appendRealtimeEvent(
              repositories.realtimeEvents,
              {
                storeId,
                type: 'timer.bulk_reset',
                entityType: 'timer',
                entityId: null,
                payload: {
                  resetCount: records.length,
                  tableIds: records.map((record) => record.tableId),
                  tableNames: records.map(
                    (record) => record.tableNameSnapshot,
                  ),
                },
                timestamp,
              },
            );
          }

          return {
            records,
            resetCount: records.length,
          };
        },
      }),
    );

    if (!outcome.replayed && committedEvent) {
      realtimeHub.publish(committedEvent);
    }
    return outcome;
  }

  async processOverdueTimers() {
    const now = this.nowProvider();
    const timestamp = new Date(now).toISOString();
    const committedEvents = [];

    const result = await unitOfWorkRepository.run(
      {
        resources: [
          'activeTimers',
          'records',
          'timerInterventionRecords',
          'auditLogs',
          'realtimeEvents',
        ],
        writeOrder: [
          'records',
          'timerInterventionRecords',
          'activeTimers',
          'auditLogs',
          'realtimeEvents',
        ],
      },
      (repositories) => {
        const reminders = [];
        const automaticResets = [];

        for (const timer of repositories.activeTimers.find()) {
          const {
            rawRemainingSeconds,
            effectiveEndMilliseconds,
          } = computeRawRemainingSeconds(
            timer,
            now,
          );
          const overtimeSeconds = Math.max(
            0,
            Math.floor(-rawRemainingSeconds),
          );
          if (overtimeSeconds < OVERDUE_REMINDER_INTERVAL_SECONDS) {
            continue;
          }

          const existingReminderNumbers = new Set(
            repositories.timerInterventionRecords.find((record) => (
              record.timerId === timer.id
              && record.reminderNumber !== null
              && Date.parse(record.createdAt) >= effectiveEndMilliseconds
            )).map((record) => record.reminderNumber),
          );

          if (!existingReminderNumbers.has(1)) {
            const reminder = buildInterventionRecord({
              timer,
              action: 'overdue_reminder',
              reminderNumber: 1,
              overtimeSeconds,
              timestamp,
            });
            repositories.timerInterventionRecords.create(reminder);
            reminders.push(reminder);
          }

          if (
            overtimeSeconds
            < MAX_OVERDUE_REMINDERS * OVERDUE_REMINDER_INTERVAL_SECONDS
          ) {
            if (existingReminderNumbers.has(1)) {
              continue;
            }

            if (timer.overtimeAcknowledged) {
              repositories.activeTimers.update(timer.id, {
                ...timer,
                overtimeAcknowledged: false,
                updatedAt: timestamp,
              });
            }
            appendAuditLog(repositories.auditLogs, {
              userId: null,
              userNameSnapshot: null,
              storeId: timer.storeId,
              action: 'timer.overdue_reminder',
              targetType: 'timer',
              targetId: timer.id,
              dataBefore: timerAuditSnapshot(timer),
              dataAfter: {
                reminderNumber: 1,
                thresholdSeconds: OVERDUE_REMINDER_INTERVAL_SECONDS,
                overtimeSeconds,
              },
            }, { timestamp });
            committedEvents.push(appendRealtimeEvent(
              repositories.realtimeEvents,
              {
                storeId: timer.storeId,
                type: 'timer.overdue_reminder',
                entityType: 'timer',
                entityId: timer.id,
                payload: {
                  tableId: timer.tableId,
                  memberTableIds: timer.memberTableIds,
                  tableNameSnapshot: timer.tableNameSnapshot,
                  reminderNumber: 1,
                  overtimeSeconds,
                },
                timestamp,
              },
            ));
            continue;
          }

          if (existingReminderNumbers.has(2)) {
            continue;
          }

          const timerBefore = structuredClone(timer);
          const record = resetTimerInRepositories(
            repositories,
            timer,
            now,
            timestamp,
            AUTOMATION_ACTOR,
          );
          const intervention = buildInterventionRecord({
            timer,
            action: 'auto_reset',
            reminderNumber: 2,
            overtimeSeconds,
            timerRecordId: record.id,
            actor: AUTOMATION_ACTOR,
            timestamp,
          });
          repositories.timerInterventionRecords.create(intervention);
          automaticResets.push(intervention);
          appendAuditLog(repositories.auditLogs, {
            userId: null,
            userNameSnapshot: null,
            storeId: timer.storeId,
            action: 'timer.auto_reset',
            targetType: 'timer',
            targetId: timer.id,
            dataBefore: timerAuditSnapshot(timerBefore),
            dataAfter: {
              recordId: record.id,
              reminderNumber: 2,
              thresholdSeconds: (
                MAX_OVERDUE_REMINDERS
                * OVERDUE_REMINDER_INTERVAL_SECONDS
              ),
              overtimeSeconds,
            },
          }, { timestamp });
          committedEvents.push(appendRealtimeEvent(
            repositories.realtimeEvents,
            {
              storeId: timer.storeId,
              type: 'timer.auto_reset',
              entityType: 'timer',
              entityId: timer.id,
              payload: {
                tableId: timer.tableId,
                memberTableIds: timer.memberTableIds,
                tableNameSnapshot: timer.tableNameSnapshot,
                reminderNumber: 2,
                overtimeSeconds,
                recordId: record.id,
              },
              timestamp,
            },
          ));
        }

        return {
          remindersCreated: reminders.length,
          automaticResets: automaticResets.length,
          reminders,
          resetRecords: automaticResets,
        };
      },
    );

    for (const event of committedEvents) {
      realtimeHub.publish(event);
    }
    return result;
  }

  async updateTimer({
    storeId,
    tableId,
    idempotencyKey,
    user,
    action,
    request,
    updater,
    auditWhenUnchanged = true,
  }) {
    const now = this.nowProvider();
    const timestamp = new Date(now).toISOString();
    let committedEvent = null;
    const outcome = await unitOfWorkRepository.run(
      {
        resources: [
          'stores',
          'tables',
          'settings',
          'activeTimers',
          'timerInterventionRecords',
          'tableGroups',
          'auditLogs',
          'idempotencyKeys',
          'realtimeEvents',
        ],
        writeOrder: [
          'activeTimers',
          'auditLogs',
          'idempotencyKeys',
          'realtimeEvents',
        ],
      },
      (repositories) => runIdempotentMutation({
        idempotencyKeys: repositories.idempotencyKeys,
        key: idempotencyKey,
        user,
        storeId,
        operation: action,
        request,
        now,
        execute: () => {
          assertTimerContext(
            repositories,
            { storeId, tableId, user },
          );
          const settings = getSettings(repositories.settings, storeId);
          const timer = findTimer(
            repositories.activeTimers,
            storeId,
            tableId,
          );

          if (!timer) {
            timerConflict('桌台当前没有活动计时');
          }

          const before = structuredClone(timer);
          const next = updater(
            structuredClone(timer),
            now,
            timestamp,
            settings.warningThresholdMinutes,
          );
          const updated = repositories.activeTimers.update(timer.id, next);
          const changed = JSON.stringify(before) !== JSON.stringify(updated);

          if (changed || auditWhenUnchanged) {
            appendAuditLog(repositories.auditLogs, {
              userId: user.userId,
              userNameSnapshot: user.displayName,
              storeId,
              action,
              targetType: 'timer',
              targetId: updated.id,
              dataBefore: timerAuditSnapshot(before),
              dataAfter: timerAuditSnapshot(updated),
            }, { timestamp });
          }
          if (changed) {
            committedEvent = appendRealtimeEvent(
              repositories.realtimeEvents,
              {
                storeId,
                type: TIMER_EVENT_TYPES[action],
                entityType: 'timer',
                entityId: updated.id,
                payload: {
                  tableId: updated.tableId,
                  groupId: updated.groupId,
                  memberTableIds: updated.memberTableIds,
                },
                timestamp,
              },
            );
          }

          return timerResponse(
            updated,
            now,
            settings.warningThresholdMinutes,
            reminderCountForTimer(
              repositories.timerInterventionRecords,
              updated,
              now,
            ),
          );
        },
      }),
    );

    if (!outcome.replayed && committedEvent) {
      realtimeHub.publish(committedEvent);
    }
    return outcome;
  }
}

export const timerService = new TimerService();
