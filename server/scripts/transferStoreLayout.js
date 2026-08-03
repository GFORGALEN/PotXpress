import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import pg from 'pg';
import {
  canvasSchema,
  decorationSchema,
  tableSchema,
} from '@potxpress/contracts';
import { buildLayoutTransferPlan } from '../src/utils/layoutTransferPlan.js';

const { Pool } = pg;
const LOCAL_DATABASE_URL = 'postgres://potxpress:potxpress@127.0.0.1:5432/potxpress';
const LOCKED_RESOURCES = [
  'activeTimers.json',
  'layouts.json',
  'tableGroups.json',
  'tables.json',
];

function parseArguments(argv) {
  const options = {
    apply: false,
    archiveTargetOnly: false,
    listStores: false,
    sourceStore: null,
    targetStore: null,
    confirmTargetId: null,
  };

  for (const argument of argv) {
    if (argument === '--apply') options.apply = true;
    else if (argument === '--archive-target-only') options.archiveTargetOnly = true;
    else if (argument === '--list-stores') options.listStores = true;
    else if (argument.startsWith('--source-store=')) {
      options.sourceStore = argument.slice('--source-store='.length).trim();
    } else if (argument.startsWith('--target-store=')) {
      options.targetStore = argument.slice('--target-store='.length).trim();
    } else if (argument.startsWith('--confirm-target-id=')) {
      options.confirmTargetId = argument.slice('--confirm-target-id='.length).trim();
    } else {
      throw new Error(`未知参数：${argument}`);
    }
  }

  if (!options.listStores && (!options.sourceStore || !options.targetStore)) {
    throw new Error('必须提供 --source-store 和 --target-store（可使用门店 ID 或 code）');
  }

  return options;
}

function parseBoolean(value, fallback = false) {
  if (value === undefined || value === '') return fallback;
  return String(value).toLowerCase() === 'true';
}

function poolFor(connectionString, sslEnabled) {
  return new Pool({
    connectionString,
    max: 2,
    ssl: sslEnabled ? { rejectUnauthorized: false } : undefined,
  });
}

async function resolveStore(client, selector, label) {
  const result = await client.query(
    `SELECT id, code, name
     FROM stores
     WHERE id = $1 OR UPPER(code) = UPPER($1) OR normalized_code = UPPER($1)
     ORDER BY CASE WHEN id = $1 THEN 0 ELSE 1 END`,
    [selector],
  );

  if (result.rowCount === 0) {
    const available = await client.query(
      'SELECT id, code, name FROM stores ORDER BY name',
    );
    const summary = available.rows
      .map((store) => `${store.code} (${store.id}, ${store.name})`)
      .join('；');
    throw new Error(`${label}不存在：${selector}。可用门店：${summary || '无'}`);
  }

  return result.rows[0];
}

async function listStores(client) {
  const result = await client.query(
    `SELECT id, code, name,
            (SELECT COUNT(*)::int FROM restaurant_tables WHERE store_id = stores.id) AS "tableCount"
     FROM stores ORDER BY name`,
  );
  return result.rows;
}

async function readStoreSnapshot(client, storeId, { lock = false } = {}) {
  const lockClause = lock ? ' FOR UPDATE' : '';
  const tablesResult = await client.query(
    `SELECT id, store_id AS "storeId", name, number,
            sort_order AS "sortOrder", enabled, shape, capacity, area, note,
            default_duration_minutes AS "defaultDurationMinutes", layout,
            created_at AS "createdAt", updated_at AS "updatedAt"
     FROM restaurant_tables
     WHERE store_id = $1
     ORDER BY sort_order, number${lockClause}`,
    [storeId],
  );
  const layoutResult = await client.query(
    `SELECT store_id AS "storeId", layout_version AS "layoutVersion",
            canvas, decorations, updated_at AS "updatedAt", updated_by AS "updatedBy"
     FROM store_layouts
     WHERE store_id = $1${lockClause}`,
    [storeId],
  );
  const timersResult = await client.query(
    `SELECT id, table_id AS "tableId", status
     FROM active_timers
     WHERE store_id = $1${lockClause}`,
    [storeId],
  );

  if (layoutResult.rowCount !== 1) {
    throw new Error(`门店 ${storeId} 必须且只能有一条布局记录`);
  }

  const tables = tablesResult.rows.map((table) => tableSchema.parse({
    ...table,
    createdAt: new Date(table.createdAt).toISOString(),
    updatedAt: new Date(table.updatedAt).toISOString(),
  }));
  const layout = layoutResult.rows[0];
  layout.canvas = canvasSchema.parse(layout.canvas);
  layout.decorations = layout.decorations.map((item) => decorationSchema.parse(item));

  return {
    tables,
    layout,
    activeTimers: timersResult.rows,
  };
}

async function lockResources(client) {
  for (const resource of [...LOCKED_RESOURCES].sort()) {
    await client.query(
      `INSERT INTO resource_locks (resource_name)
       VALUES ($1)
       ON CONFLICT (resource_name) DO NOTHING`,
      [resource],
    );
    await client.query(
      `SELECT resource_name FROM resource_locks
       WHERE resource_name = $1 FOR UPDATE`,
      [resource],
    );
  }
}

function publicPlan(sourceStore, targetStore, sourceSnapshot, targetSnapshot, plan) {
  return {
    source: {
      ...sourceStore,
      tableCount: sourceSnapshot.tables.length,
      layoutVersion: sourceSnapshot.layout.layoutVersion,
    },
    target: {
      ...targetStore,
      tableCountBefore: targetSnapshot.tables.length,
      layoutVersionBefore: targetSnapshot.layout.layoutVersion,
      layoutVersionAfter: targetSnapshot.layout.layoutVersion + 1,
    },
    actions: {
      create: plan.desiredTables
        .filter((table) => table.transferAction === 'create')
        .map((table) => table.name),
      update: plan.desiredTables
        .filter((table) => table.transferAction === 'update')
        .map((table) => table.name),
      archive: plan.archivedTables.map((table) => table.name),
    },
    untouched: [
      'stores', 'users', 'settings', 'table_groups', 'active_timers',
      'timer_records', 'audit_logs', 'realtime_events', 'idempotency_keys',
    ],
  };
}

async function writeBackup(targetStore, snapshot) {
  const timestamp = new Date().toISOString().replaceAll(':', '-');
  const directory = path.resolve('data', 'backups');
  const filename = path.join(
    directory,
    `layout-transfer-${targetStore.id}-${timestamp}.json`,
  );
  await fs.mkdir(directory, { recursive: true });
  await fs.writeFile(
    filename,
    `${JSON.stringify({
      createdAt: new Date().toISOString(),
      targetStore,
      tables: snapshot.tables,
      layout: snapshot.layout,
    }, null, 2)}\n`,
    { encoding: 'utf8', flag: 'wx' },
  );
  return filename;
}

async function assertNoIdCollisions(client, desiredTables, targetStoreId) {
  const ids = desiredTables.map((table) => table.id);
  const result = await client.query(
    `SELECT id, store_id AS "storeId"
     FROM restaurant_tables
     WHERE id = ANY($1::text[]) AND store_id <> $2`,
    [ids, targetStoreId],
  );
  if (result.rowCount > 0) {
    throw new Error(`目标数据库存在跨门店桌台 ID 冲突：${result.rows.map((row) => row.id).join(', ')}`);
  }
}

async function applyPlan(client, targetStore, sourceSnapshot, targetSnapshot, plan) {
  const archivedIds = new Set(plan.archivedTables.map((table) => table.id));
  const blockingTimers = targetSnapshot.activeTimers.filter(
    (timer) => archivedIds.has(timer.tableId),
  );
  if (blockingTimers.length > 0) {
    throw new Error(
      `以下待归档桌台仍在计时，迁移已中止：${blockingTimers.map((timer) => timer.tableId).join(', ')}`,
    );
  }

  await assertNoIdCollisions(client, plan.desiredTables, targetStore.id);
  const backupFile = await writeBackup(targetStore, targetSnapshot);
  const timestamp = new Date().toISOString();

  await client.query(
    `WITH numbered AS (
       SELECT id, ROW_NUMBER() OVER (ORDER BY id) AS position
       FROM restaurant_tables WHERE store_id = $1
     )
     UPDATE restaurant_tables AS target
     SET number = -100000 - numbered.position
     FROM numbered
     WHERE target.id = numbered.id`,
    [targetStore.id],
  );

  for (const table of plan.desiredTables) {
    await client.query(
      `INSERT INTO restaurant_tables (
         id, store_id, name, number, sort_order, enabled, shape, capacity,
         area, note, default_duration_minutes, layout, created_at, updated_at
       ) VALUES (
         $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::jsonb, $13, $14
       )
       ON CONFLICT (id) DO UPDATE SET
         name = EXCLUDED.name,
         number = EXCLUDED.number,
         sort_order = EXCLUDED.sort_order,
         enabled = EXCLUDED.enabled,
         shape = EXCLUDED.shape,
         capacity = EXCLUDED.capacity,
         area = EXCLUDED.area,
         note = EXCLUDED.note,
         default_duration_minutes = EXCLUDED.default_duration_minutes,
         layout = EXCLUDED.layout,
         updated_at = EXCLUDED.updated_at`,
      [
        table.id, targetStore.id, table.name, table.number, table.sortOrder,
        table.enabled, table.shape, table.capacity, table.area, table.note,
        table.defaultDurationMinutes, JSON.stringify(table.layout),
        table.transferAction === 'create' ? timestamp : table.createdAt,
        timestamp,
      ],
    );
  }

  for (const table of plan.archivedTables) {
    await client.query(
      `UPDATE restaurant_tables
       SET number = $2, sort_order = $3, enabled = FALSE, updated_at = $4
       WHERE id = $1 AND store_id = $5`,
      [table.id, table.number, table.sortOrder, timestamp, targetStore.id],
    );
  }

  await client.query(
    `UPDATE store_layouts
     SET layout_version = layout_version + 1,
         canvas = $2::jsonb,
         decorations = $3::jsonb,
         updated_at = $4
     WHERE store_id = $1`,
    [
      targetStore.id,
      JSON.stringify(sourceSnapshot.layout.canvas),
      JSON.stringify(sourceSnapshot.layout.decorations),
      timestamp,
    ],
  );

  const verification = await client.query(
    `SELECT COUNT(*)::int AS total,
            COUNT(*) FILTER (WHERE enabled)::int AS enabled
     FROM restaurant_tables WHERE store_id = $1`,
    [targetStore.id],
  );
  if (verification.rows[0].enabled !== sourceSnapshot.tables.filter((table) => table.enabled).length) {
    throw new Error('写入后的启用桌台数量与源门店不一致，事务已回滚');
  }

  return { backupFile, verification: verification.rows[0] };
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  const sourceUrl = process.env.SOURCE_DATABASE_URL || LOCAL_DATABASE_URL;
  const targetUrl = process.env.TARGET_DATABASE_URL;

  if (!targetUrl) {
    throw new Error('必须通过 TARGET_DATABASE_URL 环境变量提供 Render PostgreSQL 外部连接地址');
  }
  if (sourceUrl === targetUrl) {
    throw new Error('源数据库和目标数据库连接地址不能相同');
  }

  const sourcePool = poolFor(
    sourceUrl,
    parseBoolean(process.env.SOURCE_DATABASE_SSL),
  );
  const targetPool = poolFor(
    targetUrl,
    parseBoolean(process.env.TARGET_DATABASE_SSL, true),
  );

  try {
    if (options.listStores) {
      const [sourceStores, targetStores] = await Promise.all([
        listStores(sourcePool),
        listStores(targetPool),
      ]);
      console.log(JSON.stringify({ sourceStores, targetStores }, null, 2));
      return;
    }

    const [sourceStore, targetStore] = await Promise.all([
      resolveStore(sourcePool, options.sourceStore, '源门店'),
      resolveStore(targetPool, options.targetStore, '目标门店'),
    ]);
    const sourceSnapshot = await readStoreSnapshot(sourcePool, sourceStore.id);
    const targetSnapshot = await readStoreSnapshot(targetPool, targetStore.id);
    const previewPlan = buildLayoutTransferPlan({
      sourceTables: sourceSnapshot.tables,
      targetTables: targetSnapshot.tables,
      targetStoreId: targetStore.id,
      archiveTargetOnly: options.archiveTargetOnly,
    });
    const preview = publicPlan(
      sourceStore,
      targetStore,
      sourceSnapshot,
      targetSnapshot,
      previewPlan,
    );
    console.log(JSON.stringify(preview, null, 2));

    if (!options.apply) {
      console.log('\nDRY RUN：未写入任何数据。确认无误后添加 --apply 和 --confirm-target-id。');
      return;
    }
    if (options.confirmTargetId !== targetStore.id) {
      throw new Error(
        `写入确认失败：必须提供 --confirm-target-id=${targetStore.id}`,
      );
    }

    const client = await targetPool.connect();
    try {
      await client.query('BEGIN');
      await lockResources(client);
      const lockedSnapshot = await readStoreSnapshot(client, targetStore.id, { lock: true });
      const lockedPlan = buildLayoutTransferPlan({
        sourceTables: sourceSnapshot.tables,
        targetTables: lockedSnapshot.tables,
        targetStoreId: targetStore.id,
        archiveTargetOnly: options.archiveTargetOnly,
      });
      const result = await applyPlan(
        client,
        targetStore,
        sourceSnapshot,
        lockedSnapshot,
        lockedPlan,
      );
      await client.query('COMMIT');
      console.log(`\n迁移完成。备份文件：${result.backupFile}`);
      console.log(`目标桌台：共 ${result.verification.total} 张，启用 ${result.verification.enabled} 张。`);
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {});
      throw error;
    } finally {
      client.release();
    }
  } finally {
    await Promise.allSettled([sourcePool.end(), targetPool.end()]);
  }
}

main().catch((error) => {
  console.error(`布局迁移失败：${error.message}`);
  process.exitCode = 1;
});
