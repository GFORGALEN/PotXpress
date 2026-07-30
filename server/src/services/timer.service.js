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
const TIMER_EVENT_TYPES = Object.freeze({
  'timer.pause': 'timer.paused',
  'timer.resume': 'timer.resumed',
  'timer.adjust': 'timer.adjusted',
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

function timerResponse(timer, now, warningThresholdMinutes) {
  return {
    ...timer,
    ...computeTimerState(timer, now, warningThresholdMinutes),
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
        resources: ['settings', 'activeTimers', 'realtimeEvents'],
        writeOrder: [],
      },
      ({ settings, activeTimers, realtimeEvents }) => {
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

          if (
            repositories.records.findOne(
              (candidate) => candidate.timerId === timer.id,
            )
          ) {
            timerConflict('该计时器已经生成历史记录');
          }

          const timerBefore = structuredClone(timer);
          const currentPauseSeconds = timer.status === 'paused'
            ? Math.max(
              0,
              Math.round((now - Date.parse(timer.pauseStartedAt)) / 1000),
            )
            : 0;
          const totalPausedSeconds = (
            timer.totalPausedSeconds + currentPauseSeconds
          );
          const elapsedSeconds = Math.max(
            0,
            Math.round((now - Date.parse(timer.startTime)) / 1000),
          );
          const startMilliseconds = Date.parse(timer.startTime);
          const record = {
            id: `record_${uuidv4()}`,
            timerId: timer.id,
            storeId,
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
            actualDurationSeconds: Math.max(
              0,
              elapsedSeconds - totalPausedSeconds,
            ),
            totalPausedSeconds,
            adjustments: structuredClone(timer.adjustments),
            startedBy: timer.startedBy,
            startedByNameSnapshot: timer.startedByNameSnapshot,
            resetBy: user.userId,
            resetByNameSnapshot: user.displayName,
            finalStatus: 'reset',
            createdAt: timestamp,
          };
          repositories.records.create(record);
          repositories.activeTimers.delete(timer.id);
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
