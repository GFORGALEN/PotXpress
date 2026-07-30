import { v4 as uuidv4 } from 'uuid';
import { unitOfWorkRepository } from '../repositories/unitOfWork.repository.js';
import { appendRealtimeEvent } from '../realtime/realtimeEvent.js';
import { realtimeHub } from '../realtime/realtimeHub.js';
import { AppError } from '../utils/appError.js';
import { appendAuditLog } from '../utils/audit.js';
import { runIdempotentMutation } from '../utils/idempotency.js';

function publicGroup(group, tables) {
  return {
    ...group,
    tables: group.tableIds.map((tableId) => {
      const table = tables.findById(tableId);
      return table
        ? { id: table.id, name: table.name, number: table.number }
        : { id: tableId, name: tableId, number: null };
    }),
  };
}

function assertStore(stores, storeId) {
  const store = stores.findById(storeId);
  if (!store) throw new AppError(404, 'STORE_NOT_FOUND', '门店不存在');
  if (!store.enabled) {
    throw new AppError(403, 'STORE_DISABLED', '门店已停用，不能修改拼桌');
  }
}

export async function listTableGroups(storeId) {
  return unitOfWorkRepository.run(
    { resources: ['tableGroups', 'tables'], writeOrder: [] },
    ({ tableGroups, tables }) => tableGroups.findByStoreId(storeId)
      .filter((group) => group.enabled)
      .map((group) => publicGroup(group, tables)),
  );
}

export async function createTableGroup(
  storeId,
  input,
  user,
  idempotencyKey,
) {
  const now = Date.now();
  const timestamp = new Date(now).toISOString();
  let committedEvent = null;

  const outcome = await unitOfWorkRepository.run(
    {
      resources: [
        'stores',
        'tables',
        'tableGroups',
        'activeTimers',
        'auditLogs',
        'idempotencyKeys',
        'realtimeEvents',
      ],
      writeOrder: [
        'tableGroups',
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
      operation: 'table_group.create',
      request: input,
      now,
      execute: () => {
        const {
          stores,
          tables,
          tableGroups,
          activeTimers,
          auditLogs,
        } = repositories;
        assertStore(stores, storeId);
        const members = input.tableIds.map(
          (tableId) => tables.findById(tableId),
        );
        if (members.some((table) => !table || table.storeId !== storeId)) {
          throw new AppError(404, 'TABLE_NOT_FOUND', '部分拼桌成员不存在');
        }
        if (members.some((table) => !table.enabled)) {
          throw new AppError(409, 'TABLE_DISABLED', '停用桌台不能加入拼桌');
        }

        const memberSet = new Set(input.tableIds);
        const conflictingGroup = tableGroups.findOne((group) => (
          group.enabled && group.storeId === storeId
          && group.tableIds.some((tableId) => memberSet.has(tableId))
        ));
        if (conflictingGroup) {
          throw new AppError(
            409,
            'TABLE_ALREADY_GROUPED',
            '部分桌台已属于其他拼桌组',
          );
        }
        const activeTimer = activeTimers.findOne((timer) => (
          timer.storeId === storeId
          && (timer.memberTableIds ?? [timer.tableId])
            .some((tableId) => memberSet.has(tableId))
        ));
        if (activeTimer) {
          throw new AppError(
            409,
            'TABLE_HAS_ACTIVE_TIMER',
            '正在计时的桌台不能创建拼桌，请先重置清台',
          );
        }

        const sortedMembers = [...members].sort(
          (left, right) => left.sortOrder - right.sortOrder,
        );
        const created = tableGroups.create({
          id: `group_${uuidv4()}`,
          storeId,
          name: input.name?.trim()
            || `${sortedMembers.map((table) => table.name).join('+')}拼桌`,
          tableIds: sortedMembers.map((table) => table.id),
          type: input.type,
          enabled: true,
          createdAt: timestamp,
          updatedAt: timestamp,
          createdBy: user.userId,
        });
        appendAuditLog(auditLogs, {
          userId: user.userId,
          userNameSnapshot: user.displayName,
          storeId,
          action: 'table_group.create',
          targetType: 'table_group',
          targetId: created.id,
          dataBefore: null,
          dataAfter: created,
        }, { timestamp });
        committedEvent = appendRealtimeEvent(
          repositories.realtimeEvents,
          {
            storeId,
            type: 'table_group.created',
            entityType: 'table_group',
            entityId: created.id,
            payload: {
              tableIds: created.tableIds,
              groupType: created.type,
            },
            timestamp,
          },
        );
        return created;
      },
    }),
  );

  if (!outcome.replayed && committedEvent) {
    realtimeHub.publish(committedEvent);
  }
  return outcome;
}

export async function deleteTableGroup(
  storeId,
  groupId,
  user,
  idempotencyKey,
) {
  const now = Date.now();
  const timestamp = new Date(now).toISOString();
  let committedEvent = null;

  const outcome = await unitOfWorkRepository.run(
    {
      resources: [
        'stores',
        'tableGroups',
        'activeTimers',
        'auditLogs',
        'idempotencyKeys',
        'realtimeEvents',
      ],
      writeOrder: [
        'tableGroups',
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
      operation: 'table_group.delete',
      request: { groupId },
      now,
      execute: () => {
        const {
          stores,
          tableGroups,
          activeTimers,
          auditLogs,
        } = repositories;
        assertStore(stores, storeId);
        const group = tableGroups.findById(groupId);
        if (!group || group.storeId !== storeId || !group.enabled) {
          throw new AppError(404, 'TABLE_GROUP_NOT_FOUND', '拼桌组不存在');
        }
        if (activeTimers.findOne((timer) => timer.groupId === groupId)) {
          throw new AppError(
            409,
            'GROUP_HAS_ACTIVE_TIMER',
            '拼桌正在计时，请先重置清台',
          );
        }
        const removed = tableGroups.delete(groupId);
        appendAuditLog(auditLogs, {
          userId: user.userId,
          userNameSnapshot: user.displayName,
          storeId,
          action: 'table_group.delete',
          targetType: 'table_group',
          targetId: groupId,
          dataBefore: removed,
          dataAfter: null,
        }, { timestamp });
        committedEvent = appendRealtimeEvent(
          repositories.realtimeEvents,
          {
            storeId,
            type: 'table_group.deleted',
            entityType: 'table_group',
            entityId: groupId,
            payload: {
              tableIds: removed.tableIds,
              groupType: removed.type,
            },
            timestamp,
          },
        );
        return removed;
      },
    }),
  );

  if (!outcome.replayed && committedEvent) {
    realtimeHub.publish(committedEvent);
  }
  return outcome;
}
