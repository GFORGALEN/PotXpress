import { fileDataSchemas } from './dataSchemas.js';
import { fileStore } from './fileStore.js';
import { normalizeStoreCode, normalizeUsername } from '../utils/normalization.js';

const ALL_FILES = Object.freeze(Object.keys(fileDataSchemas));

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
  await fileStore.withFiles(
    ['activeTimers.json', 'records.json'],
    (drafts) => {
      const completedTimerIds = new Set(
        drafts['records.json'].map((record) => record.timerId).filter(Boolean),
      );
      drafts['activeTimers.json'] = drafts['activeTimers.json'].filter(
        (timer) => !completedTimerIds.has(timer.id),
      );
    },
    {
      writeOrder: ['activeTimers.json'],
    },
  );
}

export async function checkDataConsistency() {
  await repairCompletedResetTransactions();

  const data = await fileStore.withFiles(
    ALL_FILES,
    (drafts) => drafts,
    { writeOrder: [] },
  );

  for (const [filename, schema] of Object.entries(fileDataSchemas)) {
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
  const timers = data['activeTimers.json'];
  const records = data['records.json'];
  const settings = data['settings.json'];
  const layouts = data['layouts.json'];
  const storeById = new Map(stores.map((store) => [store.id, store]));
  const tableById = new Map(tables.map((table) => [table.id, table]));

  assertUnique(stores, (store) => store.id, '门店 id');
  assertUnique(stores, (store) => normalizeStoreCode(store.code), '门店 code');
  assertUnique(users, (user) => user.id, '用户 id');
  assertUnique(users, (user) => normalizeUsername(user.username), '用户名');
  assertUnique(tables, (table) => table.id, '桌台 id');
  assertUnique(timers, (timer) => timer.id, '计时器 id');
  assertUnique(timers, (timer) => timer.tableId, '活动计时桌台');
  assertUnique(records, (record) => record.id, '记录 id');
  assertUnique(records, (record) => record.timerId, '记录 timerId');
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

    const width = layout.widthRatio * 1600;
    const height = layout.heightRatio * 900;

    if (width < 80 || width > 400 || height < 60 || height > 300) {
      throw new Error(`桌台 ${table.id} 布局尺寸超出允许范围`);
    }
  }

  for (const timer of timers) {
    const table = tableById.get(timer.tableId);

    if (!table || table.storeId !== timer.storeId) {
      throw new Error(`计时器 ${timer.id} 的桌台引用无效`);
    }

    if (!table.enabled) {
      throw new Error(`计时器 ${timer.id} 不能绑定 disabled 桌台`);
    }

    if (
      (timer.status === 'paused' && !timer.pauseStartedAt)
      || (timer.status === 'running' && timer.pauseStartedAt)
    ) {
      throw new Error(`计时器 ${timer.id} 的暂停字段不一致`);
    }
  }

  for (const record of records) {
    const table = tableById.get(record.tableId);

    if (!storeById.has(record.storeId) || !table || table.storeId !== record.storeId) {
      throw new Error(`记录 ${record.id} 的门店或桌台引用无效`);
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
