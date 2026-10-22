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
const MAX_SCHEMA_ISSUES_PER_FILE = 20;

function isValidTimezone(timezone) {
  try {
    new Intl.DateTimeFormat('en-NZ', { timeZone: timezone }).format(new Date());
    return true;
  } catch (error) {
    return false;
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

function schemaIssues(filename, value) {
  const result = fileDataSchemas[filename].safeParse(value);
  if (result.success) return [];

  const messages = result.error.issues
    .slice(0, MAX_SCHEMA_ISSUES_PER_FILE)
    .map((issue) => {
      const [index, ...fieldPath] = issue.path;
      const row = Array.isArray(value) && typeof index === 'number'
        ? value[index]
        : null;
      const location = row
        ? `${row.id ?? row.storeId ?? `#${index}`} 的 ${fieldPath.join('.') || '(row)'}`
        : (issue.path.join('.') || '(root)');
      return `${filename} 数据结构无效：${location} ${issue.message}`;
    });
  const omitted = result.error.issues.length - messages.length;
  if (omitted > 0) messages.push(`${filename} 另有 ${omitted} 处数据结构问题未列出`);
  return messages;
}

/**
 * 检查配置类数据的业务约束，返回问题列表（每条都带出问题行的 ID），不抛错。
 *
 * 这些约束由业务代码维护、数据库无法表达；违反时通常只影响个别门店或桌台。
 * 启动时让一行坏数据阻止整个服务启动，代价远大于带着警告运行——Render 免费
 * 实例每次休眠唤醒都会重新启动，服务会因此一直起不来。
 */
export function findDataConsistencyIssues(data) {
  const issues = [];
  const report = (message) => issues.push(message);
  // 单行数据结构不完整时，后续检查可能读到 undefined；只记录这一行，继续检查其余数据。
  const inspect = (label, check) => {
    try {
      check();
    } catch (error) {
      report(`${label} 无法检查：${error.message}`);
    }
  };
  const reportDuplicates = (items, keySelector, label) => {
    const seen = new Map();
    for (const item of items) {
      const key = keySelector(item);
      const id = item.id ?? item.storeId;
      if (seen.has(key)) {
        report(`${label} 重复：${key}（${seen.get(key)} / ${id}）`);
      } else {
        seen.set(key, id);
      }
    }
  };

  for (const filename of BOUNDED_FILES) {
    schemaIssues(filename, data[filename]).forEach(report);
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

  inspect('唯一性', () => {
    reportDuplicates(stores, (store) => store.id, '门店 id');
    reportDuplicates(stores, (store) => normalizeStoreCode(store.code), '门店 code');
    reportDuplicates(users, (user) => user.id, '用户 id');
    reportDuplicates(users, (user) => normalizeUsername(user.username), '用户名');
    reportDuplicates(tables, (table) => table.id, '桌台 id');
    reportDuplicates(tableGroups, (group) => group.id, '拼桌组 id');
    reportDuplicates(timers, (timer) => timer.id, '计时器 id');
    reportDuplicates(timers, (timer) => timer.tableId, '活动计时桌台');
    reportDuplicates(settings, (entry) => entry.storeId, '门店设置');
    reportDuplicates(layouts, (entry) => entry.storeId, '门店布局');
  });

  for (const store of stores) {
    inspect(`门店 ${store.id}`, () => {
      if (!isValidTimezone(store.timezone)) {
        report(`门店 ${store.id} 的 timezone 无效：${store.timezone}`);
      }

      if (store.normalizedCode !== normalizeStoreCode(store.code)) {
        report(`门店 ${store.id} 的 normalizedCode 不一致`);
      }

      const settingsCount = settings.filter((entry) => entry.storeId === store.id).length;
      if (settingsCount !== 1) {
        report(`门店 ${store.id} 必须且只能有一条 settings（实际 ${settingsCount} 条）`);
      }

      const layoutCount = layouts.filter((entry) => entry.storeId === store.id).length;
      if (layoutCount !== 1) {
        report(`门店 ${store.id} 必须且只能有一条 layouts（实际 ${layoutCount} 条）`);
      }

      const storeTables = tables.filter((table) => table.storeId === store.id);

      if (storeTables.length > 200) {
        report(`门店 ${store.id} 桌台数量超过 200（实际 ${storeTables.length} 张）`);
      }

      reportDuplicates(storeTables, (table) => table.number, `门店 ${store.id} 桌台编号`);

      const enabledTables = storeTables
        .filter((table) => table.enabled)
        .sort((left, right) => left.sortOrder - right.sortOrder);
      const misplaced = enabledTables.filter((table, index) => table.sortOrder !== index + 1);
      if (misplaced.length > 0) {
        report(
          `门店 ${store.id} enabled 桌台 sortOrder 必须从 1 连续排列：`
          + misplaced.map((table) => `${table.id}=${table.sortOrder}`).join(', '),
        );
      }
    });
  }

  for (const user of users) {
    inspect(`用户 ${user.id}`, () => {
      if (user.normalizedUsername !== normalizeUsername(user.username)) {
        report(`用户 ${user.id} 的 normalizedUsername 不一致`);
      }

      if (user.role === 'system_admin' && user.storeId !== null) {
        report(`系统管理员 ${user.id} 的 storeId 必须为 null`);
      }

      if (user.role !== 'system_admin' && !storeById.has(user.storeId)) {
        report(`用户 ${user.id} 引用了不存在的门店 ${user.storeId}`);
      }
    });
  }

  for (const table of tables) {
    inspect(`桌台 ${table.id}`, () => {
      if (!storeById.has(table.storeId)) {
        report(`桌台 ${table.id} 引用了不存在的门店 ${table.storeId}`);
        return;
      }

      const { layout } = table;

      if (
        layout.xRatio + layout.widthRatio > 1.000001
        || layout.yRatio + layout.heightRatio > 1.000001
      ) {
        report(`桌台 ${table.id} 布局超出画布边界`);
      }

      const canvas = canvasByStoreId.get(table.storeId);

      if (!canvas) {
        report(`桌台 ${table.id} 所属门店 ${table.storeId} 缺少画布配置`);
        return;
      }

      const width = layout.widthRatio * canvas.virtualWidth;
      const height = layout.heightRatio * canvas.virtualHeight;

      const epsilon = 0.01;
      if (
        width < canvas.minTableWidth - epsilon
        || height < canvas.minTableHeight - epsilon
      ) {
        report(`桌台 ${table.id} 布局尺寸小于允许的最小值`);
      }
    });
  }

  const groupedTableIds = new Set();
  for (const group of tableGroups.filter((entry) => entry.enabled)) {
    inspect(`拼桌组 ${group.id}`, () => {
      if (!storeById.has(group.storeId)) {
        report(`拼桌组 ${group.id} 引用了不存在的门店 ${group.storeId}`);
      }
      for (const tableId of group.tableIds) {
        const table = tableById.get(tableId);
        if (!table || table.storeId !== group.storeId || !table.enabled) {
          report(`拼桌组 ${group.id} 的桌台引用无效：${tableId}`);
        }
        if (groupedTableIds.has(tableId)) {
          report(`桌台 ${tableId} 同时属于多个启用拼桌组（含 ${group.id}）`);
        }
        groupedTableIds.add(tableId);
      }
    });
  }

  const timedTableIds = new Set();
  for (const timer of timers) {
    inspect(`计时器 ${timer.id}`, () => {
      const table = tableById.get(timer.tableId);

      if (!table || table.storeId !== timer.storeId) {
        report(`计时器 ${timer.id} 的桌台引用无效：${timer.tableId}`);
      } else if (!table.enabled) {
        report(`计时器 ${timer.id} 不能绑定 disabled 桌台 ${timer.tableId}`);
      }

      for (const memberTableId of timer.memberTableIds) {
        const member = tableById.get(memberTableId);
        if (!member || member.storeId !== timer.storeId || !member.enabled) {
          report(`计时器 ${timer.id} 的成员桌台引用无效：${memberTableId}`);
        }
        if (timedTableIds.has(memberTableId)) {
          report(`桌台 ${memberTableId} 同时存在多个活动计时（含 ${timer.id}）`);
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
        report(`计时器 ${timer.id} 的拼桌组引用无效：${timer.groupId}`);
      }

      if (
        (timer.status === 'paused' && !timer.pauseStartedAt)
        || (timer.status === 'running' && timer.pauseStartedAt)
      ) {
        report(`计时器 ${timer.id} 的暂停字段不一致`);
      }
    });
  }

  for (const entry of settings) {
    inspect(`门店 ${entry.storeId} 的 settings`, () => {
      const store = storeById.get(entry.storeId);

      if (!store) {
        report(`settings 引用了不存在的门店 ${entry.storeId}`);
      } else if (entry.timezone !== store.timezone) {
        report(`门店 ${entry.storeId} 的 settings.timezone 与 stores 不一致`);
      }
    });
  }

  for (const entry of layouts) {
    if (!storeById.has(entry.storeId)) {
      report(`layouts 引用了不存在的门店 ${entry.storeId}`);
    }
  }

  return issues;
}

/**
 * 启动时的数据检查。数据库结构与迁移失败在此之前的 initStorage 中已是致命错误；
 * 读取数据本身失败（数据库不可用）也照常抛出。业务数据违反约束只记录警告并
 * 返回问题列表，让服务带着警告启动，由管理员修复对应数据。
 */
export async function checkDataConsistency({ logger = console } = {}) {
  await repairCompletedResetTransactions();

  const data = await databaseStore.withFiles(
    BOUNDED_FILES,
    (drafts) => drafts,
  );
  const issues = findDataConsistencyIssues(data);

  if (issues.length > 0) {
    logger.warn(
      `数据一致性检查发现 ${issues.length} 个问题，服务继续启动，请尽快修复：\n`
      + issues.map((issue) => `  - ${issue}`).join('\n'),
    );
  }
  return issues;
}
