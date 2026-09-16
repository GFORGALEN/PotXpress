import assert from 'node:assert/strict';
import test from 'node:test';
import { DatabaseStore } from '../src/storage/databaseStore.js';

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
