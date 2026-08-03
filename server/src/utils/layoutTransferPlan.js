import { createHash } from 'node:crypto';

function normalizedName(value) {
  return String(value).trim().toLocaleLowerCase('zh-CN');
}
function assertUniqueNames(tables, label) {
  const seen = new Map();

  for (const table of tables) {
    const key = normalizedName(table.name);
    const previous = seen.get(key);
    if (previous) {
      throw new Error(
        `${label}存在重名桌台：${previous.name} (${previous.id}) / ${table.name} (${table.id})`,
      );
    }
    seen.set(key, table);
  }

  return seen;
}

function transferredTableId(targetStoreId, sourceTableId) {
  const digest = createHash('sha256')
    .update(`${targetStoreId}\0${sourceTableId}`)
    .digest('hex')
    .slice(0, 32);
  return `table_xfer_${digest}`;
}

function archivedNumbers(sourceTables, count) {
  const reserved = new Set(sourceTables.map((table) => table.number));
  const values = [];

  for (let candidate = 9999; candidate >= 1 && values.length < count; candidate -= 1) {
    if (!reserved.has(candidate)) {
      values.push(candidate);
    }
  }

  if (values.length !== count) {
    throw new Error('没有足够的安全桌号用于归档目标门店的旧桌台');
  }

  return values;
}

export function buildLayoutTransferPlan({
  sourceTables,
  targetTables,
  targetStoreId,
  archiveTargetOnly = false,
}) {
  if (sourceTables.length === 0) {
    throw new Error('源门店没有可迁移的桌台');
  }

  const sourceByName = assertUniqueNames(sourceTables, '源门店');
  const targetByName = assertUniqueNames(targetTables, '目标门店');
  const sourceNumbers = new Set();
  for (const table of sourceTables) {
    if (sourceNumbers.has(table.number)) {
      throw new Error(`源门店存在重复桌号：${table.number}`);
    }
    sourceNumbers.add(table.number);
  }

  const matchedTargetIds = new Set();
  const desiredTables = sourceTables.map((sourceTable) => {
    const targetTable = targetByName.get(normalizedName(sourceTable.name));
    if (targetTable) {
      matchedTargetIds.add(targetTable.id);
    }

    return {
      ...sourceTable,
      id: targetTable?.id ?? transferredTableId(targetStoreId, sourceTable.id),
      storeId: targetStoreId,
      transferAction: targetTable ? 'update' : 'create',
      sourceTableId: sourceTable.id,
    };
  });

  const targetOnly = targetTables.filter(
    (table) => !matchedTargetIds.has(table.id),
  );

  if (targetOnly.length > 0 && !archiveTargetOnly) {
    throw new Error(
      `目标门店有 ${targetOnly.length} 张源门店不存在的桌台；如需隐藏它们，请显式使用 --archive-target-only`,
    );
  }

  const nextSortOrder = Math.max(
    0,
    ...sourceTables.map((table) => table.sortOrder),
  ) + 1;
  const archiveNumbers = archivedNumbers(sourceTables, targetOnly.length);
  const archivedTables = targetOnly.map((table, index) => ({
    ...table,
    number: archiveNumbers[index],
    sortOrder: nextSortOrder + index,
    enabled: false,
    transferAction: 'archive',
  }));

  const desiredIds = new Set();
  for (const table of desiredTables) {
    if (desiredIds.has(table.id)) {
      throw new Error(`迁移后桌台 ID 冲突：${table.id}`);
    }
    desiredIds.add(table.id);
  }

  return {
    desiredTables,
    archivedTables,
    createdCount: desiredTables.filter((table) => table.transferAction === 'create').length,
    updatedCount: desiredTables.filter((table) => table.transferAction === 'update').length,
    archivedCount: archivedTables.length,
    sourceNameCount: sourceByName.size,
  };
}
