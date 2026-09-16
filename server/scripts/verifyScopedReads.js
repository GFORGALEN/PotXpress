import pg from 'pg';
import {
  readResources,
  syncResourceChangeBatch,
} from '../src/storage/database.js';

const connectionString = process.env.TARGET_DATABASE_URL;
if (!connectionString) throw new Error('TARGET_DATABASE_URL is required');

const pool = new pg.Pool({
  connectionString,
  max: 1,
  ssl: String(process.env.TARGET_DATABASE_SSL ?? 'true') === 'true'
    ? { rejectUnauthorized: false }
    : false,
});

const client = await pool.connect();
try {
  await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ');
  const sample = await client.query(`
    SELECT
      (SELECT id FROM stores WHERE enabled = TRUE ORDER BY id LIMIT 1) AS store_id,
      (SELECT id FROM users WHERE enabled = TRUE ORDER BY id LIMIT 1) AS user_id
  `);
  const { store_id: storeId, user_id: userId } = sample.rows[0];
  if (!storeId || !userId) throw new Error('No enabled store/user available');
  const tableResult = await client.query(
    'SELECT id FROM restaurant_tables WHERE store_id = $1 ORDER BY id LIMIT 1',
    [storeId],
  );
  const tableId = tableResult.rows[0]?.id;

  const authStartedAt = performance.now();
  await client.query(
    `SELECT users.id, users.token_version, users.enabled,
            stores.id AS store_id, stores.enabled AS store_enabled
     FROM users
     LEFT JOIN stores ON stores.id = users.store_id
     WHERE users.id = $1`,
    [userId],
  );
  console.log(`auth: ${Math.round(performance.now() - authStartedAt)}ms`);

  const cases = [
    ['list', [
      { filename: 'settings.json', scope: { id: storeId } },
      { filename: 'activeTimers.json', scope: { storeId } },
      { filename: 'timerInterventionRecords.json', scope: { storeId, activeTimersOnly: true } },
      { filename: 'realtimeEvents.json', scope: { storeId, orderBy: 'version', latest: true, limit: 1 } },
    ]],
    ['start', [
      { filename: 'stores.json', scope: { id: storeId } },
      { filename: 'tables.json', scope: { storeId } },
      { filename: 'settings.json', scope: { id: storeId } },
      { filename: 'activeTimers.json', scope: { storeId } },
      { filename: 'tableGroups.json', scope: { storeId } },
      { filename: 'idempotencyKeys.json', scope: { none: true } },
      { filename: 'realtimeEvents.json', scope: { storeId, orderBy: 'version', latest: true, limit: 1 } },
    ]],
    ['reset', [
      { filename: 'stores.json', scope: { id: storeId } },
      { filename: 'tables.json', scope: { storeId } },
      { filename: 'activeTimers.json', scope: { storeId } },
      { filename: 'tableGroups.json', scope: { storeId } },
      { filename: 'records.json', scope: { storeId, relatedTableId: tableId } },
      { filename: 'idempotencyKeys.json', scope: { userId, key: '__verification_only__' } },
      { filename: 'realtimeEvents.json', scope: { storeId, orderBy: 'version', latest: true, limit: 1 } },
    ]],
  ];

  for (const [name, resources] of cases) {
    const startedAt = performance.now();
    const result = await readResources(client, resources);
    const elapsed = Math.round(performance.now() - startedAt);
    const counts = Object.fromEntries(Object.entries(result).map(([filename, value]) => [
      filename,
      Array.isArray(value) ? value.length : Number(value !== null),
    ]));
    if (result['stores.json']?.[0] && result['stores.json'][0].id !== storeId) {
      throw new Error(`${name} returned the wrong store`);
    }
    if (result['tables.json']?.some((table) => table.storeId !== storeId)) {
      throw new Error(`${name} returned a table from another store`);
    }
    console.log(`${name}: ${elapsed}ms ${JSON.stringify(counts)}`);
  }

  await client.query(
    `EXPLAIN DELETE FROM realtime_events
     WHERE id IN (
       SELECT id FROM (
         SELECT id, ROW_NUMBER() OVER (
           PARTITION BY store_id ORDER BY version DESC
         ) AS event_position
         FROM realtime_events
         WHERE store_id = ANY($1::text[])
       ) ranked_events
       WHERE event_position > 1000
     )`,
    [[storeId]],
  );
  console.log('event cleanup: plan verified');

  const timestamp = new Date().toISOString();
  let batchStatement = null;
  await syncResourceChangeBatch({
    async query(sql, parameters) {
      batchStatement = { sql, parameters };
      return { rows: [] };
    },
  }, [
    {
      filename: 'auditLogs.json', before: [], after: [{
        id: 'audit_verification_only', timestamp, userId, userNameSnapshot: 'verify',
        storeId, action: 'verify', targetType: 'timer', targetId: null,
        dataBefore: null, dataAfter: null,
      }],
    },
    {
      filename: 'idempotencyKeys.json', before: [], after: [{
        id: 'idemp_verification_only', userId, storeId, key: 'verification-only',
        operation: 'verify', requestFingerprint: '0'.repeat(64), response: {},
        createdAt: timestamp, expiresAt: timestamp,
      }],
    },
    {
      filename: 'realtimeEvents.json', before: [], after: [{
        id: 'event_verification_only', storeId, version: 2147483646,
        type: 'verify', entityType: 'timer', entityId: null, payload: {},
        createdAt: timestamp,
      }],
    },
  ]);
  await client.query(`EXPLAIN ${batchStatement.sql}`, batchStatement.parameters);
  console.log('batched writes: plan verified without execution');

  await client.query('ROLLBACK');
} catch (error) {
  await client.query('ROLLBACK').catch(() => {});
  throw error;
} finally {
  client.release();
  await pool.end();
}
