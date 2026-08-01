import assert from 'node:assert/strict';
import test from 'node:test';
import pg from 'pg';

const runIntegration = process.env.RUN_POSTGRES_INTEGRATION === 'true';
const baseDatabaseUrl = process.env.DATABASE_URL
  ?? 'postgres://potxpress:potxpress@127.0.0.1:5432/potxpress';

test(
  '真实 PostgreSQL 资源行锁可跨实例串行化空表和事件版本并回滚失败事务',
  { skip: !runIntegration },
  async () => {
    const schemaName = `potxpress_lock_test_${process.pid}_${Date.now()}`;
    const adminPool = new pg.Pool({ connectionString: baseDatabaseUrl });
    const schemaUrl = new URL(baseDatabaseUrl);
    schemaUrl.searchParams.set('options', `-csearch_path=${schemaName}`);
    let businessPool = null;

    await adminPool.query(`CREATE SCHEMA "${schemaName}"`);

    try {
      const legacyPool = new pg.Pool({ connectionString: schemaUrl.toString() });
      const legacyTables = [
        'stores', 'users', 'restaurant_tables', 'table_groups', 'active_timers',
        'timer_records', 'store_settings', 'audit_logs', 'store_layouts',
        'idempotency_keys', 'realtime_events', 'app_metadata',
      ];
      for (const table of legacyTables) {
        await legacyPool.query(`CREATE TABLE ${table} (
          id TEXT PRIMARY KEY, store_id TEXT NULL, payload JSONB NOT NULL,
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`);
      }
      const migratedTimestamp = new Date().toISOString();
      await legacyPool.query(
        `INSERT INTO stores (id, store_id, payload) VALUES ($1, $1, $2::jsonb)`,
        ['store_migrated', JSON.stringify({
          id: 'store_migrated', name: 'Migrated store', code: 'MIGRATED',
          normalizedCode: 'MIGRATED', address: null, timezone: 'Pacific/Auckland',
          enabled: true, createdAt: migratedTimestamp, updatedAt: migratedTimestamp,
        })],
      );
      await legacyPool.query(
        `INSERT INTO app_metadata (id, payload) VALUES ('singleton', $1::jsonb)`,
        [JSON.stringify({ schemaVersion: 4, updatedAt: migratedTimestamp })],
      );
      await legacyPool.query(
        `INSERT INTO users (id, store_id, payload) VALUES ($1, $2, $3::jsonb)`,
        ['user_migrated', 'store_migrated', JSON.stringify({
          id: 'user_migrated', username: 'migrated', normalizedUsername: 'migrated',
          displayName: 'Migrated user', passwordHash: 'x'.repeat(60), role: 'store_staff',
          storeId: 'store_migrated', enabled: true, tokenVersion: 1,
          createdAt: migratedTimestamp, updatedAt: migratedTimestamp,
        })],
      );
      await legacyPool.query(
        `INSERT INTO restaurant_tables (id, store_id, payload) VALUES ($1, $2, $3::jsonb)`,
        ['table_migrated', 'store_migrated', JSON.stringify({
          id: 'table_migrated', storeId: 'store_migrated', name: 'Migrated table', number: 1,
          sortOrder: 1, enabled: true, shape: 'rectangle', capacity: 4, area: 'Main',
          note: null, defaultDurationMinutes: null,
          layout: { xRatio: 0, yRatio: 0, widthRatio: 0.1, heightRatio: 0.1, rotation: 0, zIndex: 1 },
          createdAt: migratedTimestamp, updatedAt: migratedTimestamp,
        })],
      );
      await legacyPool.query(
        `INSERT INTO active_timers (id, store_id, payload) VALUES ($1, $2, $3::jsonb)`,
        ['timer_migrated', 'store_migrated', JSON.stringify({
          id: 'timer_migrated', storeId: 'store_migrated', tableId: 'table_migrated',
          targetType: 'table', groupId: null, memberTableIds: ['table_migrated'],
          tableNameSnapshot: 'Migrated table', tableNumberSnapshot: 1, startTime: migratedTimestamp,
          plannedDurationSeconds: 3600, status: 'running', pauseStartedAt: null,
          totalPausedSeconds: 0, adjustments: [{
            type: 'add', seconds: 60, requestedSeconds: 60, reason: null,
            by: 'user_migrated', byNameSnapshot: 'Migrated user', at: migratedTimestamp,
          }], overtimeAcknowledged: false, startedBy: 'user_migrated',
          startedByNameSnapshot: 'Migrated user', createdAt: migratedTimestamp, updatedAt: migratedTimestamp,
        })],
      );
      await legacyPool.end();

      process.env.NODE_ENV = 'development';
      process.env.SEED_DEMO_DATA = 'false';
      process.env.DATABASE_URL = schemaUrl.toString();
      process.env.DATABASE_POOL_SIZE = '4';

      const {
        databasePool,
        initializeDatabase,
      } = await import('../src/storage/database.js');
      businessPool = databasePool;
      const { DatabaseStore } = await import('../src/storage/databaseStore.js');
      await initializeDatabase();
      assert.equal(
        (await businessPool.query(
          `SELECT normalized_code FROM stores WHERE id = 'store_migrated'`,
        )).rows[0].normalized_code,
        'MIGRATED',
      );
      assert.equal(
        (await businessPool.query(
          `SELECT COUNT(*)::int AS count FROM information_schema.columns
           WHERE table_schema = current_schema() AND column_name = 'payload'`,
        )).rows[0].count,
        0,
      );
      assert.equal((await businessPool.query(
        `SELECT COUNT(*)::int AS count FROM active_timer_members WHERE timer_id = 'timer_migrated'`,
      )).rows[0].count, 1);
      assert.equal((await businessPool.query(
        `SELECT COUNT(*)::int AS count FROM active_timer_adjustments WHERE timer_id = 'timer_migrated'`,
      )).rows[0].count, 1);

      const firstStore = new DatabaseStore();
      const secondStore = new DatabaseStore();
      await Promise.all([
        firstStore.initStorage(),
        secondStore.initStorage(),
      ]);

      await Promise.all([
        firstStore.withFiles(
          ['stores.json'],
          async (drafts) => {
            await new Promise((resolve) => setTimeout(resolve, 100));
            drafts['stores.json'].push({
              id: 'store_from_first_instance', name: 'First store', code: 'FIRST',
              normalizedCode: 'FIRST', address: null, timezone: 'Pacific/Auckland',
              enabled: true, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
            });
          },
          { writeOrder: ['stores.json'] },
        ),
        secondStore.withFiles(
          ['stores.json'],
          (drafts) => {
            drafts['stores.json'].push({
              id: 'store_from_second_instance', name: 'Second store', code: 'SECOND',
              normalizedCode: 'SECOND', address: null, timezone: 'Pacific/Auckland',
              enabled: true, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
            });
          },
          { writeOrder: ['stores.json'] },
        ),
      ]);

      const storesAfterRace = await firstStore.readJSON('stores.json');
      assert.deepEqual(
        storesAfterRace.map((store) => store.id).sort(),
        ['store_from_first_instance', 'store_from_second_instance', 'store_migrated'],
      );

      const appendVersionedEvent = (id) => (drafts) => {
        const events = drafts['realtimeEvents.json'];
        const version = events.reduce(
          (latest, event) => Math.max(latest, event.version),
          0,
        ) + 1;
        events.push({
          id,
          storeId: 'store_from_first_instance',
          version,
          type: 'timer.started',
          entityType: 'timer',
          entityId: null,
          payload: {},
          createdAt: new Date().toISOString(),
        });
      };
      await Promise.all([
        firstStore.withFiles(
          ['realtimeEvents.json'],
          async (drafts) => {
            await new Promise((resolve) => setTimeout(resolve, 100));
            appendVersionedEvent('event_from_first_instance')(drafts);
          },
          { writeOrder: ['realtimeEvents.json'] },
        ),
        secondStore.withFiles(
          ['realtimeEvents.json'],
          appendVersionedEvent('event_from_second_instance'),
          { writeOrder: ['realtimeEvents.json'] },
        ),
      ]);
      assert.deepEqual(
        (await firstStore.readJSON('realtimeEvents.json'))
          .map((event) => event.version)
          .sort((left, right) => left - right),
        [1, 2],
      );

      firstStore.setFaultInjector(({ stage, filename }) => {
        if (stage === 'before_replace' && filename === 'auditLogs.json') {
          firstStore.setFaultInjector(null);
          throw new Error('injected postgres rollback failure');
        }
      });
      await assert.rejects(
        firstStore.withFiles(
          ['stores.json', 'auditLogs.json'],
          (drafts) => {
            drafts['stores.json'].push({
              id: 'store_must_rollback', name: 'Rollback store', code: 'ROLLBACK',
              normalizedCode: 'ROLLBACK', address: null, timezone: 'Pacific/Auckland',
              enabled: true, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
            });
            drafts['auditLogs.json'].push({
              id: 'audit_must_rollback',
              timestamp: new Date().toISOString(),
              userId: null,
              userNameSnapshot: null,
              storeId: null,
              action: 'test.rollback',
              targetType: 'store',
              targetId: 'store_must_rollback',
              dataBefore: null,
              dataAfter: null,
            });
          },
          { writeOrder: ['stores.json', 'auditLogs.json'] },
        ),
        /injected postgres rollback failure/,
      );
      assert.equal(
        (await secondStore.readJSON('stores.json')).some(
          (store) => store.id === 'store_must_rollback',
        ),
        false,
      );
      assert.deepEqual(
        await secondStore.readJSON('auditLogs.json'),
        [],
      );

    } finally {
      await businessPool?.end().catch(() => {});
      await adminPool.query(`DROP SCHEMA "${schemaName}" CASCADE`);
      await adminPool.end();
    }
  },
);
