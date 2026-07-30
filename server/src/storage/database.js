import pg from 'pg';
import { newDb } from 'pg-mem';
import { config } from '../config.js';

const { Pool } = pg;

const TABLE_DEFINITIONS = Object.freeze({
  'stores.json': { table: 'stores', idField: 'id' },
  'users.json': { table: 'users', idField: 'id' },
  'tables.json': { table: 'restaurant_tables', idField: 'id' },
  'tableGroups.json': { table: 'table_groups', idField: 'id' },
  'activeTimers.json': { table: 'active_timers', idField: 'id' },
  'records.json': { table: 'timer_records', idField: 'id' },
  'settings.json': { table: 'store_settings', idField: 'storeId' },
  'auditLogs.json': { table: 'audit_logs', idField: 'id' },
  'layouts.json': { table: 'store_layouts', idField: 'storeId' },
  'idempotencyKeys.json': { table: 'idempotency_keys', idField: 'id' },
  'realtimeEvents.json': { table: 'realtime_events', idField: 'id' },
  'metadata.json': { table: 'app_metadata', idField: null },
});

export const DATABASE_RESOURCES = TABLE_DEFINITIONS;

function createMemoryPool() {
  const memoryDatabase = newDb({
    autoCreateForeignKeyIndices: true,
  });
  const adapter = memoryDatabase.adapters.createPg();
  return new adapter.Pool();
}

function createPool() {
  if (config.useMemoryDatabase) {
    return createMemoryPool();
  }

  return new Pool({
    connectionString: config.databaseUrl,
    max: config.databasePoolSize,
    connectionTimeoutMillis: 10_000,
    idleTimeoutMillis: 30_000,
    ssl: config.databaseSsl ? { rejectUnauthorized: false } : false,
  });
}

export const databasePool = createPool();
let initializationPromise = null;

export async function initializeDatabase() {
  if (initializationPromise) return initializationPromise;

  initializationPromise = (async () => {
    await databasePool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
    `);
    await databasePool.query(`
    CREATE TABLE IF NOT EXISTS resource_locks (
      resource_name TEXT PRIMARY KEY
    )
    `);

    for (const [resourceName, definition] of Object.entries(TABLE_DEFINITIONS)) {
      await databasePool.query(`
      CREATE TABLE IF NOT EXISTS ${definition.table} (
        id TEXT PRIMARY KEY,
        store_id TEXT NULL,
        payload JSONB NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
      `);
      await databasePool.query(`
      CREATE INDEX IF NOT EXISTS ${definition.table}_store_id_idx
      ON ${definition.table} (store_id)
      `);
      await databasePool.query(
        `INSERT INTO resource_locks (resource_name)
         VALUES ($1)
         ON CONFLICT (resource_name) DO NOTHING`,
        [resourceName],
      );
    }

    await databasePool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS timer_records_timer_id_uq
    ON timer_records ((payload ->> 'timerId'))
    `);
    await databasePool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS idempotency_keys_scope_key_uq
    ON idempotency_keys (
      (payload ->> 'userId'),
      (payload ->> 'key')
    )
    `);
    await databasePool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS realtime_events_store_version_uq
    ON realtime_events (
      (payload ->> 'storeId'),
      (payload ->> 'version')
    )
    `);

    await databasePool.query(
      `INSERT INTO schema_migrations (version)
       VALUES (4)
       ON CONFLICT (version) DO NOTHING`,
    );
  })();

  try {
    await initializationPromise;
  } catch (error) {
    initializationPromise = null;
    throw error;
  }
}

export async function checkDatabaseHealth() {
  await databasePool.query('SELECT 1 AS ok');
  return 'ok';
}
