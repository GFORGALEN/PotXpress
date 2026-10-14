import assert from 'node:assert/strict';
import test from 'node:test';
import { DatabaseStore } from '../src/storage/databaseStore.js';
import {
  acquireWriteLocks,
  readResources,
  syncResourceChangeBatch,
} from '../src/storage/database.js';

test('门店写事务只锁本门店：共享全局锁 + 独占门店锁；跨店写独占全局锁', async () => {
  const queries = [];
  const client = {
    async query(sql, values) {
      queries.push({ sql, values });
      return { rows: [] };
    },
  };

  await acquireWriteLocks(client, { storeId: 'store_a' });
  await acquireWriteLocks(client, { global: true });

  assert.equal(queries.length, 2);
  assert.match(queries[0].sql, /pg_advisory_xact_lock_shared/);
  assert.deepEqual(queries[0].values, ['potxpress:global', 'potxpress:store:store_a']);
  assert.doesNotMatch(queries[1].sql, /_shared/);
  assert.deepEqual(queries[1].values, ['potxpress:global']);
});

test('历史表没有读取范围时直接拒绝，避免整表读取', async () => {
  const store = new DatabaseStore();
  for (const filename of [
    'auditLogs.json',
    'records.json',
    'timerInterventionRecords.json',
    'idempotencyKeys.json',
    'realtimeEvents.json',
  ]) {
    await assert.rejects(
      store.withFiles([filename], () => null),
      /必须指定范围/,
    );
  }
});

test('范围快照把多资源读取合并为一次参数化 SQL', async () => {
  const queries = [];
  const timestamp = new Date().toISOString();
  const client = {
    async query(sql, values) {
      queries.push({ sql, values });
      return {
        rows: [{
          resource_0: [{
            id: 'store_1', name: 'Store', code: 'ONE', normalized_code: 'ONE',
            address: null, timezone: 'Pacific/Auckland', enabled: true,
            created_at: timestamp, updated_at: timestamp,
          }],
          resource_1: [],
        }],
      };
    },
  };

  const result = await readResources(client, [
    { filename: 'stores.json', scope: { id: 'store_1' } },
    { filename: 'activeTimers.json', scope: { storeId: 'store_1' } },
  ]);

  assert.equal(queries.length, 1);
  assert.deepEqual(queries[0].values, ['store_1', 'store_1']);
  assert.equal(result['stores.json'][0].id, 'store_1');
  assert.deepEqual(result['activeTimers.json'], []);
});

test('审计、幂等和实时事件合并为一次事务写入', async () => {
  const queries = [];
  const timestamp = new Date().toISOString();
  const client = {
    async query(sql, values) {
      queries.push({ sql, values });
      return { rows: [] };
    },
  };

  await syncResourceChangeBatch(client, [
    {
      filename: 'auditLogs.json', before: [], after: [{
        id: 'audit_1', timestamp, userId: 'user_1', userNameSnapshot: 'User',
        storeId: 'store_1', action: 'timer.start', targetType: 'timer',
        targetId: 'timer_1', dataBefore: null, dataAfter: {},
      }],
    },
    {
      filename: 'idempotencyKeys.json', before: [], after: [{
        id: 'idemp_1', userId: 'user_1', storeId: 'store_1', key: 'request-key',
        operation: 'timer.start', requestFingerprint: '0'.repeat(64), response: {},
        createdAt: timestamp, expiresAt: timestamp,
      }],
    },
    {
      filename: 'realtimeEvents.json', before: [], after: [{
        id: 'event_1', storeId: 'store_1', version: 1, type: 'timer.started',
        entityType: 'timer', entityId: 'timer_1', payload: {}, createdAt: timestamp,
      }],
    },
  ]);

  assert.equal(queries.length, 1);
  assert.match(queries[0].sql, /INSERT INTO audit_logs/);
  assert.match(queries[0].sql, /INSERT INTO idempotency_keys/);
  assert.match(queries[0].sql, /INSERT INTO realtime_events/);
  assert.match(queries[0].sql, /expired_idempotency_cleanup/);
  assert.match(queries[0].sql, /realtime_event_cleanup/);
});
