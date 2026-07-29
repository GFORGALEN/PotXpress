import { v4 as uuidv4 } from 'uuid';
import { tableRepository } from '../repositories/table.repository.js';
import { unitOfWorkRepository } from '../repositories/unitOfWork.repository.js';
import { AppError } from '../utils/appError.js';
import { writeAuditLogBestEffort } from '../utils/audit.js';
import { planTableLayouts } from '../utils/tablePlacement.js';

const TABLE_LIMIT = 200;

function tableAuditSnapshot(table) {
  return {
    id: table.id,
    storeId: table.storeId,
    name: table.name,
    number: table.number,
    sortOrder: table.sortOrder,
    enabled: table.enabled,
    layout: table.layout,
  };
}

function assertEnabledStore(stores, storeId) {
  const store = stores.findById(storeId);

  if (!store) {
    throw new AppError(404, 'STORE_NOT_FOUND', '门店不存在');
  }

  if (!store.enabled) {
    throw new AppError(403, 'STORE_DISABLED', '门店已停用，不能修改业务数据');
  }

  return store;
}

function getStoreLayout(layouts, storeId) {
  const layout = layouts.findById(storeId);

  if (!layout) {
    throw new AppError(404, 'LAYOUT_NOT_FOUND', '门店布局不存在');
  }

  return layout;
}

function assertAvailableNumbers(storeTables, numbers, ignoredTableId = null) {
  const requested = new Set(numbers);
  const conflicts = storeTables
    .filter(
      (table) => table.id !== ignoredTableId && requested.has(table.number),
    )
    .map((table) => table.number);

  if (conflicts.length > 0) {
    throw new AppError(
      409,
      'TABLE_NUMBER_TAKEN',
      '桌台编号已存在',
      { numbers: [...new Set(conflicts)].sort((left, right) => left - right) },
    );
  }
}

function bumpLayout(layouts, storeId, userId, timestamp) {
  const current = getStoreLayout(layouts, storeId);
  return layouts.update(storeId, {
    ...current,
    layoutVersion: current.layoutVersion + 1,
    updatedAt: timestamp,
    updatedBy: userId,
  });
}

function reorderEnabledTables(tables, storeId, targetId, desiredOrder, timestamp) {
  const enabled = tables.findByStoreId(storeId)
    .filter((table) => table.enabled)
    .sort((left, right) => (
      left.sortOrder - right.sortOrder || left.number - right.number
    ));
  const targetIndex = enabled.findIndex((table) => table.id === targetId);

  if (targetIndex !== -1 && desiredOrder !== undefined) {
    const [target] = enabled.splice(targetIndex, 1);
    const insertionIndex = Math.min(
      Math.max(desiredOrder - 1, 0),
      enabled.length,
    );
    enabled.splice(insertionIndex, 0, target);
  }

  enabled.forEach((table, index) => {
    const nextOrder = index + 1;

    if (table.sortOrder !== nextOrder) {
      tables.update(table.id, {
        ...table,
        sortOrder: nextOrder,
        updatedAt: timestamp,
      });
    }
  });
}

function planNewTables({
  storeId,
  specifications,
  storeTables,
  layoutRecord,
  timestamp,
}) {
  if (storeTables.length + specifications.length > TABLE_LIMIT) {
    throw new AppError(
      409,
      'TABLE_LIMIT_REACHED',
      `每家门店最多只能有 ${TABLE_LIMIT} 张桌台`,
    );
  }

  assertAvailableNumbers(
    storeTables,
    specifications.map((specification) => specification.number),
  );

  const maxZIndex = storeTables.reduce(
    (maximum, table) => Math.max(maximum, table.layout.zIndex),
    0,
  );
  const placements = planTableLayouts({
    canvas: layoutRecord.canvas,
    existingLayouts: storeTables
      .filter((table) => table.enabled)
      .map((table) => table.layout),
    count: specifications.length,
    startingZIndex: maxZIndex + 1,
  });

  if (!placements) {
    throw new AppError(409, 'LAYOUT_FULL', '当前布局没有足够空间放置新桌台');
  }

  const maxSortOrder = storeTables
    .filter((table) => table.enabled)
    .reduce((maximum, table) => Math.max(maximum, table.sortOrder), 0);

  return specifications.map((specification, index) => ({
    id: `table_${uuidv4()}`,
    storeId,
    name: specification.name.trim(),
    number: specification.number,
    sortOrder: maxSortOrder + index + 1,
    enabled: true,
    layout: placements[index],
    createdAt: timestamp,
    updatedAt: timestamp,
  }));
}

async function createTablesInTransaction(storeId, specifications, user) {
  const timestamp = new Date().toISOString();
  let createdTables;

  await unitOfWorkRepository.run(
    {
      lockFiles: ['stores.json', 'tables.json', 'layouts.json'],
      writeOrder: ['tables.json', 'layouts.json'],
    },
    ({ stores, tables, layouts }) => {
      assertEnabledStore(stores, storeId);
      const storeTables = tables.findByStoreId(storeId);
      const layoutRecord = getStoreLayout(layouts, storeId);
      createdTables = planNewTables({
        storeId,
        specifications,
        storeTables,
        layoutRecord,
        timestamp,
      });

      for (const table of createdTables) {
        tables.create(table);
      }

      bumpLayout(layouts, storeId, user.userId, timestamp);
    },
  );

  return createdTables;
}

export async function listTables(storeId) {
  const tables = await tableRepository.findByStoreId(storeId);
  return tables.sort(
    (left, right) => left.sortOrder - right.sortOrder || left.number - right.number,
  );
}

export async function createTable(storeId, input, user) {
  const [table] = await createTablesInTransaction(storeId, [input], user);

  await writeAuditLogBestEffort({
    userId: user.userId,
    userNameSnapshot: user.displayName,
    storeId,
    action: 'table.create',
    targetType: 'table',
    targetId: table.id,
    dataBefore: null,
    dataAfter: tableAuditSnapshot(table),
  });

  return table;
}

export async function createTableBatch(storeId, input, user) {
  const pattern = input.namePattern ?? '{n}号桌';
  const specifications = Array.from({ length: input.count }, (_, index) => {
    const number = input.startNumber + index;
    const name = pattern.replaceAll('{n}', String(number)).trim();

    if (name.length < 1 || name.length > 50) {
      throw new AppError(
        400,
        'VALIDATION_ERROR',
        'namePattern 展开后的桌台名称长度必须为 1-50',
        { number },
      );
    }

    return { name, number };
  });
  const tables = await createTablesInTransaction(storeId, specifications, user);

  await writeAuditLogBestEffort({
    userId: user.userId,
    userNameSnapshot: user.displayName,
    storeId,
    action: 'table.batch_create',
    targetType: 'table_batch',
    targetId: null,
    dataBefore: null,
    dataAfter: {
      count: tables.length,
      tableIds: tables.map((table) => table.id),
      numbers: tables.map((table) => table.number),
    },
  });

  return tables;
}

async function updateTableState(storeId, tableId, input, user, action) {
  let before;
  let updated;
  let layoutVersion = null;

  await unitOfWorkRepository.run(
    {
      lockFiles: [
        'stores.json',
        'tables.json',
        'layouts.json',
        'activeTimers.json',
      ],
      writeOrder: ['tables.json', 'layouts.json'],
    },
    ({ stores, tables, layouts, activeTimers }) => {
      assertEnabledStore(stores, storeId);
      const current = tables.findById(tableId);

      if (!current || current.storeId !== storeId) {
        throw new AppError(404, 'TABLE_NOT_FOUND', '桌台不存在');
      }

      const disabling = current.enabled && input.enabled === false;

      if (
        disabling
        && activeTimers.findOne((timer) => timer.tableId === tableId)
      ) {
        throw new AppError(
          409,
          'TABLE_HAS_ACTIVE_TIMER',
          '桌台存在活动计时，不能停用',
        );
      }

      const storeTables = tables.findByStoreId(storeId);

      if (input.number !== undefined) {
        assertAvailableNumbers(storeTables, [input.number], tableId);
      }

      before = structuredClone(current);
      const timestamp = new Date().toISOString();
      const membershipChanged = (
        input.enabled !== undefined
        && input.enabled !== current.enabled
      );
      const enabling = !current.enabled && input.enabled === true;
      updated = tables.update(tableId, {
        ...current,
        ...(input.name !== undefined ? { name: input.name.trim() } : {}),
        ...(input.number !== undefined ? { number: input.number } : {}),
        ...(input.sortOrder !== undefined ? { sortOrder: input.sortOrder } : {}),
        ...(input.enabled !== undefined ? { enabled: input.enabled } : {}),
        updatedAt: timestamp,
      });

      if (disabling) {
        reorderEnabledTables(tables, storeId, tableId, undefined, timestamp);
      } else if (updated.enabled && (input.sortOrder !== undefined || enabling)) {
        const enabledCount = tables.findByStoreId(storeId)
          .filter((table) => table.enabled).length;
        reorderEnabledTables(
          tables,
          storeId,
          tableId,
          input.sortOrder ?? enabledCount,
          timestamp,
        );
      }

      updated = tables.findById(tableId);

      if (membershipChanged) {
        const nextLayout = bumpLayout(
          layouts,
          storeId,
          user.userId,
          timestamp,
        );
        layoutVersion = nextLayout.layoutVersion;
      }
    },
  );

  await writeAuditLogBestEffort({
    userId: user.userId,
    userNameSnapshot: user.displayName,
    storeId,
    action,
    targetType: 'table',
    targetId: tableId,
    dataBefore: tableAuditSnapshot(before),
    dataAfter: {
      ...tableAuditSnapshot(updated),
      ...(layoutVersion ? { layoutVersion } : {}),
    },
  });

  return updated;
}

export async function updateTable(storeId, tableId, input, user) {
  return updateTableState(storeId, tableId, input, user, 'table.update');
}

export async function deleteTable(storeId, tableId, user) {
  return updateTableState(
    storeId,
    tableId,
    { enabled: false },
    user,
    'table.delete',
  );
}
