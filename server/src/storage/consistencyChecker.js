import { fileDataSchemas } from './dataSchemas.js';
import { databasePool, GROWING_RESOURCES } from './database.js';
import { databaseStore } from './databaseStore.js';
import { normalizeStoreCode, normalizeUsername } from '../utils/normalization.js';

// 启动检查只覆盖规模有上限的配置类资源。历史表（计时记录、审计、干预、
// 幂等键、实时事件）的门店/记录引用与唯一性由数据库约束保证；历史桌台 ID
// 是允许保留的删除前快照。不在每次启动时整表读入内存，避免重启恢复变慢。
const BOUNDED_FILES = Object.freeze(
  Object.keys(fileDataSchemas).filter((filename) => !GROWING_RESOURCES.has(filename)),
);

function assertUnique(items, keySelector, label) {
  const seen = new Map();

  for (const item of items) {
    const key = keySelector(item);

    if (seen.has(key)) {
      throw new Error(`${label} 重复：${key}（${seen.get(key)} / ${item.id ?? item.storeId}）`);
    }
    seen.set(key, item.id ?? item.storeId);
  }
}

function assertValidTimezone(timezone, storeId) {
  try {
    new Intl.DateTimeFormat('en-NZ', { timeZone: timezone }).format(new Date());
  } catch (error) {
    throw new Error(`门店 ${storeId} 的 timezone 无效：${timezone}`);
  }
}

async function repairCompletedResetTransactions() {
  // 已生成历史记录的计时器不应仍处于活动状态（文件存储时代的半完成事务）。
  await databasePool.query(
    `DELETE FROM active_timers
     WHERE EXISTS (
       SELECT 1 FROM timer_records WHERE timer_records.timer_id = active_timers.id
     )`,
  );
}

export async function checkDataConsistency() {
  await repairCompletedResetTransactions();

  const data = await databaseStore.withFiles(
    BOUNDED_FILES,
    (drafts) => drafts,
  );

  for (const filename of BOUNDED_FILES) {
    const schema = fileDataSchemas[filename];
    const result = schema.safeParse(data[filename]);

    if (!result.success) {
      const issue = result.error.issues[0];
      throw new Error(
        `${filename} 数据结构无效：${issue.path.join('.') || '(root)'} ${issue.message}`,
      );
    }
  }

  const stores = data['stores.json'];
  const users = data['users.json'];
  const tables = data['tables.json'];
  const tableGroups = data['tableGroups.json'];
  const timers = data['activeTimers.json'];
  const settings = data['settings.json'];
  const layouts = data['layouts.json'];
  const storeById = new Map(stores.map((store) => [store.id, store]));
  const tableById = new Map(tables.map((table) => [table.id, table]));
  const canvasByStoreId = new Map(
    layouts.map((entry) => [entry.storeId, entry.canvas]),
  );

  assertUnique(stores, (store) => store.id, '门店 id');
  assertUnique(stores, (store) => normalizeStoreCode(store.code), '门店 code');
  assertUnique(users, (user) => user.id, '用户 id');
  assertUnique(users, (user) => normalizeUsername(user.username), '用户名');
  assertUnique(tables, (table) => table.id, '桌台 id');
  assertUnique(tableGroups, (group) => group.id, '拼桌组 id');
  assertUnique(timers, (timer) => timer.id, '计时器 id');
  assertUnique(timers, (timer) => timer.tableId, '活动计时桌台');
  assertUnique(settings, (entry) => entry.storeId, '门店设置');
  assertUnique(layouts, (entry) => entry.storeId, '门店布局');

  for (const store of stores) {
    assertValidTimezone(store.timezone, store.id);

    if (store.normalizedCode !== normalizeStoreCode(store.code)) {
      throw new Error(`门店 ${store.id} 的 normalizedCode 不一致`);
    }

    if (settings.filter((entry) => entry.storeId === store.id).length !== 1) {
      throw new Error(`门店 ${store.id} 必须且只能有一条 settings`);
    }

    if (layouts.filter((entry) => entry.storeId === store.id).length !== 1) {
      throw new Error(`门店 ${store.id} 必须且只能有一条 layouts`);
    }

    const storeTables = tables.filter((table) => table.storeId === store.id);

    if (storeTables.length > 200) {
      throw new Error(`门店 ${store.id} 桌台数量超过 200`);
    }

    assertUnique(storeTables, (table) => table.number, `门店 ${store.id} 桌台编号`);

    const enabledTables = storeTables
      .filter((table) => table.enabled)
      .sort((left, right) => left.sortOrder - right.sortOrder);
    assertUnique(enabledTables, (table) => table.sortOrder, `门店 ${store.id} sortOrder`);

    enabledTables.forEach((table, index) => {
      if (table.sortOrder !== index + 1) {
        throw new Error(`门店 ${store.id} enabled 桌台 sortOrder 必须从 1 连续排列`);
      }
    });
  }

  for (const user of users) {
    if (user.normalizedUsername !== normalizeUsername(user.username)) {
      throw new Error(`用户 ${user.id} 的 normalizedUsername 不一致`);
    }

    if (user.role === 'system_admin' && user.storeId !== null) {
      throw new Error(`系统管理员 ${user.id} 的 storeId 必须为 null`);
    }

    if (user.role !== 'system_admin' && !storeById.has(user.storeId)) {
      throw new Error(`用户 ${user.id} 引用了不存在的门店 ${user.storeId}`);
    }
  }

  for (const table of tables) {
    const store = storeById.get(table.storeId);

    if (!store) {
      throw new Error(`桌台 ${table.id} 引用了不存在的门店 ${table.storeId}`);
    }

    const { layout } = table;

    if (
      layout.xRatio + layout.widthRatio > 1.000001
      || layout.yRatio + layout.heightRatio > 1.000001
    ) {
      throw new Error(`桌台 ${table.id} 布局超出画布边界`);
    }

    const canvas = canvasByStoreId.get(table.storeId);

    if (!canvas) {
      throw new Error(`桌台 ${table.id} 所属门店缺少画布配置`);
    }

    const width = layout.widthRatio * canvas.virtualWidth;
    const height = layout.heightRatio * canvas.virtualHeight;

    const epsilon = 0.01;
    if (
      width < canvas.minTableWidth - epsilon
      || height < canvas.minTableHeight - epsilon
    ) {
      throw new Error(`桌台 ${table.id} 布局尺寸小于允许的最小值`);
    }
  }

  const groupedTableIds = new Set();
  for (const group of tableGroups.filter((entry) => entry.enabled)) {
    if (!storeById.has(group.storeId)) {
      throw new Error(`拼桌组 ${group.id} 引用了不存在的门店`);
    }
    for (const tableId of group.tableIds) {
      const table = tableById.get(tableId);
      if (!table || table.storeId !== group.storeId || !table.enabled) {
        throw new Error(`拼桌组 ${group.id} 的桌台引用无效`);
      }
      if (groupedTableIds.has(tableId)) {
        throw new Error(`桌台 ${tableId} 同时属于多个启用拼桌组`);
      }
      groupedTableIds.add(tableId);
    }
  }

  const timedTableIds = new Set();
  for (const timer of timers) {
    const table = tableById.get(timer.tableId);

    if (!table || table.storeId !== timer.storeId) {
      throw new Error(`计时器 ${timer.id} 的桌台引用无效`);
    }

    if (!table.enabled) {
      throw new Error(`计时器 ${timer.id} 不能绑定 disabled 桌台`);
    }

    for (const memberTableId of timer.memberTableIds) {
      const member = tableById.get(memberTableId);
      if (!member || member.storeId !== timer.storeId || !member.enabled) {
        throw new Error(`计时器 ${timer.id} 的成员桌台引用无效`);
      }
      if (timedTableIds.has(memberTableId)) {
        throw new Error(`桌台 ${memberTableId} 同时存在多个活动计时`);
      }
      timedTableIds.add(memberTableId);
    }

    if (
      timer.targetType === 'group'
      && !tableGroups.some((group) => (
        group.id === timer.groupId
        && group.enabled
        && group.tableIds.length === timer.memberTableIds.length
        && group.tableIds.every((id) => timer.memberTableIds.includes(id))
      ))
    ) {
      throw new Error(`计时器 ${timer.id} 的拼桌组引用无效`);
    }

    if (
      (timer.status === 'paused' && !timer.pauseStartedAt)
      || (timer.status === 'running' && timer.pauseStartedAt)
    ) {
      throw new Error(`计时器 ${timer.id} 的暂停字段不一致`);
    }
  }

  for (const entry of settings) {
    const store = storeById.get(entry.storeId);

    if (!store) {
      throw new Error(`settings 引用了不存在的门店 ${entry.storeId}`);
    }

    if (entry.timezone !== store.timezone) {
      throw new Error(`门店 ${entry.storeId} 的 settings.timezone 与 stores 不一致`);
    }
  }

  for (const entry of layouts) {
    if (!storeById.has(entry.storeId)) {
      throw new Error(`layouts 引用了不存在的门店 ${entry.storeId}`);
    }
  }
}
