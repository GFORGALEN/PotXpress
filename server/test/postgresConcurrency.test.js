import assert from 'node:assert/strict';
import test from 'node:test';
import pg from 'pg';

const baseDatabaseUrl = process.env.TEST_DATABASE_URL
  ?? 'postgres://potxpress:potxpress@127.0.0.1:5432/potxpress';

const sleep = (milliseconds) => new Promise((resolve) => {
  setTimeout(resolve, milliseconds);
});

function storeRow(id) {
  const timestamp = new Date().toISOString();
  return {
    id, name: id, code: id.toUpperCase(), normalizedCode: id.toUpperCase(),
    address: null, timezone: 'Pacific/Auckland', enabled: true,
    createdAt: timestamp, updatedAt: timestamp,
  };
}

function eventRow(id, storeId, version) {
  return {
    id, storeId, version, type: 'timer.started', entityType: 'timer',
    entityId: null, payload: {}, createdAt: new Date().toISOString(),
  };
}

test(
  '真实 PostgreSQL：旧表迁移、门店级并发隔离、跨实例串行化与失败回滚',
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
      delete process.env.DATABASE_SSL;
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

      // 迁移是版本化的：v7 的结构变更已执行并登记。
      assert.equal((await businessPool.query(
        `SELECT COUNT(*)::int AS count FROM schema_migrations WHERE version = 7`,
      )).rows[0].count, 1);

      const firstStore = new DatabaseStore();
      const secondStore = new DatabaseStore();
      await Promise.all([
        firstStore.initStorage(),
        secondStore.initStorage(),
      ]);

      // 两个实例并发创建门店（跨店写，全局锁）：都成功且互不覆盖。
      await Promise.all([
        firstStore.withFiles(['stores.json'], async (drafts) => {
          await sleep(100);
          drafts['stores.json'].push(storeRow('store_a'));
        }, { writeOrder: ['stores.json'] }),
        secondStore.withFiles(['stores.json'], (drafts) => {
          drafts['stores.json'].push(storeRow('store_b'));
        }, { writeOrder: ['stores.json'] }),
      ]);
      assert.deepEqual(
        (await firstStore.readJSON('stores.json')).map((store) => store.id).sort(),
        ['store_a', 'store_b', 'store_migrated'],
      );

      const appendVersionedEvent = (id, storeId, delay = 0) => async (drafts) => {
        if (delay) await sleep(delay);
        const events = drafts['realtimeEvents.json'];
        const version = events.reduce(
          (latest, event) => Math.max(latest, event.version),
          0,
        ) + 1;
        events.push(eventRow(id, storeId, version));
      };
      const latestEventScope = (storeId) => ({
        readScopes: {
          'realtimeEvents.json': { storeId, orderBy: 'version', latest: true, limit: 1 },
        },
      });

      // 同一门店：两个实例的写事务被门店锁串行化，版本号不冲突。
      await Promise.all([
        firstStore.withFiles(
          ['realtimeEvents.json'],
          appendVersionedEvent('event_a_first', 'store_a', 150),
          { writeOrder: ['realtimeEvents.json'], lockScope: { storeId: 'store_a' }, ...latestEventScope('store_a') },
        ),
        secondStore.withFiles(
          ['realtimeEvents.json'],
          appendVersionedEvent('event_a_second', 'store_a'),
          { writeOrder: ['realtimeEvents.json'], lockScope: { storeId: 'store_a' }, ...latestEventScope('store_a') },
        ),
      ]);
      assert.deepEqual(
        (await firstStore.readWhere('realtimeEvents.json', { storeId: 'store_a' }))
          .map((event) => event.version)
          .sort((left, right) => left - right),
        [1, 2],
      );

      // 不同门店：A 店的慢写事务不阻塞 B 店写入，也不阻塞只读查询。
      const finished = [];
      let releaseSlowWrite;
      const slowWriteGate = new Promise((resolve) => {
        releaseSlowWrite = resolve;
      });
      const slowStoreA = firstStore.withFiles(
        ['realtimeEvents.json'],
        async (drafts) => {
          await slowWriteGate;
          await appendVersionedEvent('event_a_slow', 'store_a')(drafts);
        },
        { writeOrder: ['realtimeEvents.json'], lockScope: { storeId: 'store_a' }, ...latestEventScope('store_a') },
      ).then(() => finished.push('store_a'));
      await sleep(50);
      await secondStore.withFiles(
        ['realtimeEvents.json'],
        appendVersionedEvent('event_b_fast', 'store_b'),
        { writeOrder: ['realtimeEvents.json'], lockScope: { storeId: 'store_b' }, ...latestEventScope('store_b') },
      ).then(() => finished.push('store_b'));
      await secondStore.readWhere('realtimeEvents.json', { storeId: 'store_a' })
        .then(() => finished.push('read_store_a'));
      assert.deepEqual(finished, ['store_b', 'read_store_a']);

      // 跨店（全局）写必须等待进行中的门店写事务结束。
      const globalWrite = secondStore.withFiles(['stores.json'], (drafts) => {
        drafts['stores.json'].push(storeRow('store_c'));
      }, { writeOrder: ['stores.json'] }).then(() => finished.push('global'));
      await sleep(150);
      assert.deepEqual(finished, ['store_b', 'read_store_a']);
      releaseSlowWrite();
      await Promise.all([slowStoreA, globalWrite]);
      assert.deepEqual(finished, ['store_b', 'read_store_a', 'store_a', 'global']);

      // 审计写入走批量路径时，故障注入同样生效，整个事务回滚。
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
            drafts['stores.json'].push(storeRow('store_must_rollback'));
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
          {
            writeOrder: ['stores.json', 'auditLogs.json'],
            skipRead: ['auditLogs.json'],
          },
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
        await secondStore.readWhere('auditLogs.json', { id: 'audit_must_rollback' }),
        [],
      );

    } finally {
      await businessPool?.end().catch(() => {});
      await adminPool.query(`DROP SCHEMA "${schemaName}" CASCADE`);
      await adminPool.end();
    }
  },
);
