import assert from 'node:assert/strict';
import test from 'node:test';
import { DatabaseStore } from '../src/storage/databaseStore.js';
import {
  readResources,
  syncResourceChangeBatch,
} from '../src/storage/database.js';

test('资源锁使用固定两次 SQL 并按名称排序去重', async () => {
  const queries = [];
  const client = {
    async query(sql, values) {
      queries.push({ sql, values });
      return { rows: [] };
    },
  };

  const store = new DatabaseStore();
  await store.lockResourcesWithClient(client, [
    'tables.json',
    'stores.json',
    'tables.json',
  ]);

  assert.equal(queries.length, 2);
  assert.deepEqual(queries[0].values, ['stores.json', 'tables.json']);
  assert.deepEqual(queries[1].values, ['stores.json', 'tables.json']);
  assert.match(queries[0].sql, /VALUES \(\$1\), \(\$2\)/);
  assert.match(queries[1].sql, /ORDER BY resource_name\s+FOR UPDATE/);
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
