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
              id: 'store_from_first_instance',
            });
          },
          { writeOrder: ['stores.json'] },
        ),
        secondStore.withFiles(
          ['stores.json'],
          (drafts) => {
            drafts['stores.json'].push({
              id: 'store_from_second_instance',
            });
          },
          { writeOrder: ['stores.json'] },
        ),
      ]);

      const storesAfterRace = await firstStore.readJSON('stores.json');
      assert.deepEqual(
        storesAfterRace.map((store) => store.id).sort(),
        ['store_from_first_instance', 'store_from_second_instance'],
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
            drafts['stores.json'].push({ id: 'store_must_rollback' });
            drafts['auditLogs.json'].push({
              id: 'audit_must_rollback',
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
