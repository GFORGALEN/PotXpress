import { randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import pg from 'pg';
import {
  canvasSchema,
  decorationSchema,
  tableSchema,
} from '@potxpress/contracts';
import { BRANCH_FLOOR_PLANS } from '../src/layoutPresets/branchFloorPlans.js';

const { Pool } = pg;
const DEFAULT_LOCAL_DATABASE_URL = 'postgres://potxpress:potxpress@127.0.0.1:5432/potxpress';
const LOCAL_HOSTNAMES = new Set(['127.0.0.1', 'localhost', '::1', '[::1]']);

function parseArguments(argv) {
  const options = { apply: false };
  for (const argument of argv) {
    if (argument === '--apply') options.apply = true;
    else throw new Error(`未知参数：${argument}`);
  }
  return options;
}

function assertLocalDatabase(connectionString) {
  const url = new URL(connectionString);
  const databaseName = url.pathname.replace(/^\//, '');
  if (!LOCAL_HOSTNAMES.has(url.hostname) || databaseName !== 'potxpress') {
    throw new Error(
      '为保护线上数据，本脚本只允许连接本机 127.0.0.1/localhost 的 potxpress 数据库',
    );
  }
}

function validateFloorPlans() {
  for (const plan of BRANCH_FLOOR_PLANS) {
    const canvas = canvasSchema.parse(plan.canvas);
    plan.decorations.forEach((item) => decorationSchema.parse(item));
    plan.tables.forEach((item, index) => tableSchema.parse({
      ...item,
      id: `table_preview_${plan.key}_${String(index + 1).padStart(3, '0')}`,
      storeId: plan.store.id,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    }));
    for (const item of plan.tables) {
      const width = item.layout.widthRatio * canvas.virtualWidth;
      const height = item.layout.heightRatio * canvas.virtualHeight;
      if (width < canvas.minTableWidth || height < canvas.minTableHeight) {
        throw new Error(`${plan.store.code} 的 ${item.name} 小于画布最小桌台尺寸`);
      }
      if (
        item.layout.xRatio + item.layout.widthRatio > 1.000001
        || item.layout.yRatio + item.layout.heightRatio > 1.000001
      ) {
        throw new Error(`${plan.store.code} 的 ${item.name} 超出画布`);
      }
    }
  }
}

async function readExisting(client, plan) {
  const storeResult = await client.query(
    `SELECT id, code, name, address, timezone, enabled,
            created_at AS "createdAt", updated_at AS "updatedAt"
     FROM stores
     WHERE normalized_code = $1`,
    [plan.store.code.toLowerCase()],
  );
  const store = storeResult.rows[0] ?? null;
  if (!store) return { store: null, tables: [], layout: null };

  const tablesResult = await client.query(
    `SELECT id, store_id AS "storeId", name, number,
            sort_order AS "sortOrder", enabled, shape, capacity, area, note,
            default_duration_minutes AS "defaultDurationMinutes", layout,
            created_at AS "createdAt", updated_at AS "updatedAt"
     FROM restaurant_tables WHERE store_id = $1
     ORDER BY sort_order, number`,
    [store.id],
  );
  const layoutResult = await client.query(
    `SELECT store_id AS "storeId", layout_version AS "layoutVersion",
            canvas, decorations, updated_at AS "updatedAt", updated_by AS "updatedBy"
     FROM store_layouts WHERE store_id = $1`,
    [store.id],
  );

  return {
    store,
    tables: tablesResult.rows,
    layout: layoutResult.rows[0] ?? null,
  };
}

function summarize(plan, existing) {
  const desiredNames = new Set(plan.tables.map((item) => item.name.toLowerCase()));
  const existingNames = new Set(existing.tables.map((item) => item.name.trim().toLowerCase()));
  return {
    code: plan.store.code,
    name: plan.store.name,
    orientation: plan.canvas.virtualWidth > plan.canvas.virtualHeight ? '横向' : '纵向',
    canvas: `${plan.canvas.virtualWidth}×${plan.canvas.virtualHeight}`,
    desiredTables: plan.tables.length,
    create: plan.tables.filter((item) => !existingNames.has(item.name.toLowerCase())).length,
    update: plan.tables.filter((item) => existingNames.has(item.name.toLowerCase())).length,
    archive: existing.tables.filter((item) => !desiredNames.has(item.name.trim().toLowerCase())).length,
    decorations: plan.decorations.length,
  };
}

async function lockResources(client) {
  for (const resource of ['layouts.json', 'settings.json', 'stores.json', 'tables.json']) {
    await client.query(
      `INSERT INTO resource_locks (resource_name) VALUES ($1)
       ON CONFLICT (resource_name) DO NOTHING`,
      [resource],
    );
    await client.query(
      'SELECT resource_name FROM resource_locks WHERE resource_name = $1 FOR UPDATE',
      [resource],
    );
  }
}

async function writeBackup(snapshots) {
  const timestamp = new Date().toISOString().replaceAll(':', '-');
  const directory = path.resolve('data', 'backups');
  const filename = path.join(directory, `local-branch-layouts-${timestamp}.json`);
  await fs.mkdir(directory, { recursive: true });
  await fs.writeFile(
    filename,
    `${JSON.stringify({ createdAt: new Date().toISOString(), snapshots }, null, 2)}\n`,
    { encoding: 'utf8', flag: 'wx' },
  );
  return filename;
}

async function applyPlan(client, plan, existing) {
  const timestamp = new Date().toISOString();
  const storeId = existing.store?.id ?? plan.store.id;
  const existingByName = new Map(existing.tables.map((item) => [
    item.name.trim().toLocaleLowerCase('zh-CN'),
    item,
  ]));
  const desiredNames = new Set(plan.tables.map((item) => (
    item.name.trim().toLocaleLowerCase('zh-CN')
  )));
  const archivedTables = existing.tables.filter((item) => (
    !desiredNames.has(item.name.trim().toLocaleLowerCase('zh-CN'))
  ));
  if (archivedTables.length) {
    const timers = await client.query(
      `SELECT table_id AS "tableId" FROM active_timers
       WHERE store_id = $1 AND table_id = ANY($2::text[])`,
      [storeId, archivedTables.map((item) => item.id)],
    );
    if (timers.rowCount > 0) {
      throw new Error(
        `${plan.store.code} 有待归档桌台正在计时：${timers.rows.map((item) => item.tableId).join(', ')}`,
      );
    }
  }

  await client.query(
    `INSERT INTO stores (
       id, name, code, normalized_code, address, timezone, enabled, created_at, updated_at
     ) VALUES ($1, $2, $3, $4, $5, $6, TRUE, $7, $7)
     ON CONFLICT (normalized_code) DO UPDATE SET
       name = EXCLUDED.name,
       address = EXCLUDED.address,
       timezone = EXCLUDED.timezone,
       enabled = TRUE,
       updated_at = EXCLUDED.updated_at`,
    [
      storeId,
      plan.store.name,
      plan.store.code,
      plan.store.code.toLowerCase(),
      plan.store.address,
      plan.store.timezone,
      timestamp,
    ],
  );
  await client.query(
    `INSERT INTO store_settings (
       store_id, default_duration_minutes, warning_threshold_minutes,
       timezone, sound_enabled, updated_at
     ) VALUES ($1, 90, 10, $2, TRUE, $3)
     ON CONFLICT (store_id) DO NOTHING`,
    [storeId, plan.store.timezone, timestamp],
  );

  if (existing.tables.length) {
    await client.query(
      `WITH numbered AS (
         SELECT id, ROW_NUMBER() OVER (ORDER BY id) AS position
         FROM restaurant_tables WHERE store_id = $1
       )
       UPDATE restaurant_tables AS target
       SET number = -100000 - numbered.position
       FROM numbered WHERE target.id = numbered.id`,
      [storeId],
    );
  }

  for (const item of plan.tables) {
    const existingTable = existingByName.get(item.name.toLocaleLowerCase('zh-CN'));
    const tableId = existingTable?.id
      ?? `table_preview_${plan.key}_${randomUUID()}`;
    await client.query(
      `INSERT INTO restaurant_tables (
         id, store_id, name, number, sort_order, enabled, shape, capacity,
         area, note, default_duration_minutes, layout, created_at, updated_at
       ) VALUES (
         $1, $2, $3, $4, $5, TRUE, $6, $7, $8, $9, $10, $11::jsonb, $12, $13
       )
       ON CONFLICT (id) DO UPDATE SET
         name = EXCLUDED.name,
         number = EXCLUDED.number,
         sort_order = EXCLUDED.sort_order,
         enabled = TRUE,
         shape = EXCLUDED.shape,
         capacity = EXCLUDED.capacity,
         area = EXCLUDED.area,
         note = EXCLUDED.note,
         default_duration_minutes = EXCLUDED.default_duration_minutes,
         layout = EXCLUDED.layout,
         updated_at = EXCLUDED.updated_at`,
      [
        tableId,
        storeId,
        item.name,
        item.number,
        item.sortOrder,
        item.shape,
        item.capacity,
        item.area,
        item.note,
        item.defaultDurationMinutes,
        JSON.stringify(item.layout),
        existingTable?.createdAt ?? timestamp,
        timestamp,
      ],
    );
  }

  for (const [index, item] of archivedTables.entries()) {
    await client.query(
      `UPDATE restaurant_tables
       SET number = $2, sort_order = $3, enabled = FALSE, updated_at = $4
       WHERE id = $1 AND store_id = $5`,
      [item.id, 9999 - index, plan.tables.length + index + 1, timestamp, storeId],
    );
  }

  await client.query(
    `INSERT INTO store_layouts (
       store_id, layout_version, canvas, decorations, updated_at, updated_by
     ) VALUES ($1, 1, $2::jsonb, $3::jsonb, $4, NULL)
     ON CONFLICT (store_id) DO UPDATE SET
       layout_version = store_layouts.layout_version + 1,
       canvas = EXCLUDED.canvas,
       decorations = EXCLUDED.decorations,
       updated_at = EXCLUDED.updated_at,
       updated_by = NULL`,
    [storeId, JSON.stringify(plan.canvas), JSON.stringify(plan.decorations), timestamp],
  );
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  const connectionString = process.env.LOCAL_DATABASE_URL ?? DEFAULT_LOCAL_DATABASE_URL;
  assertLocalDatabase(connectionString);
  validateFloorPlans();
  const pool = new Pool({ connectionString, max: 2 });

  try {
    const snapshots = [];
    for (const plan of BRANCH_FLOOR_PLANS) {
      snapshots.push({ plan, existing: await readExisting(pool, plan) });
    }
    console.log(JSON.stringify(
      snapshots.map(({ plan, existing }) => summarize(plan, existing)),
      null,
      2,
    ));

    if (!options.apply) {
      console.log('\nDRY RUN：本地数据库没有变化。确认后添加 --apply。');
      return;
    }

    const backupFile = await writeBackup(snapshots.map(({ plan, existing }) => ({
      code: plan.store.code,
      existing,
    })));
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await lockResources(client);
      for (const plan of BRANCH_FLOOR_PLANS) {
        const existing = await readExisting(client, plan);
        await applyPlan(client, plan, existing);
      }
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {});
      throw error;
    } finally {
      client.release();
    }
    console.log(`\n三家门店平面图已写入本地数据库。备份：${backupFile}`);
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error(`本地平面图更新失败：${error.message}`);
  process.exitCode = 1;
});
