import assert from 'node:assert/strict';
import net from 'node:net';
import test from 'node:test';
import pg from 'pg';

// 借出中的 pg 连接断开（网络中断、Supavisor 关闭、pg_terminate_backend）时，
// pg Client 会触发 error 事件。pg-pool 在借出期间不监听它，没有监听器时
// Node 直接退出进程。这里在真实 PostgreSQL 上复现这两条路径。

const directDatabaseUrl = process.env.TEST_DATABASE_URL
  || 'postgres://potxpress:potxpress@127.0.0.1:5432/potxpress';

const sleep = (milliseconds) => new Promise((resolve) => {
  setTimeout(resolve, milliseconds);
});

async function waitFor(check, timeoutMilliseconds = 3000) {
  const deadline = Date.now() + timeoutMilliseconds;
  while (Date.now() < deadline) {
    const value = await check();
    if (value) return value;
    await sleep(20);
  }
  throw new Error('Condition timeout');
}

/** 业务连接池经由这个 TCP 代理连库，测试可以随时切断所有连接，模拟网络中断。 */
async function startProxy(targetUrl) {
  const target = new URL(targetUrl);
  const sockets = new Set();
  const server = net.createServer((downstream) => {
    const upstream = net.connect(Number(target.port || 5432), target.hostname);
    for (const socket of [downstream, upstream]) {
      sockets.add(socket);
      socket.on('error', () => {});
      socket.on('close', () => {
        sockets.delete(socket);
        downstream.destroy();
        upstream.destroy();
      });
    }
    downstream.pipe(upstream).pipe(downstream);
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const proxyUrl = new URL(targetUrl);
  proxyUrl.host = `127.0.0.1:${server.address().port}`;
  return {
    url: proxyUrl.toString(),
    dropConnections() {
      for (const socket of sockets) socket.destroy();
    },
    close: () => new Promise((resolve) => server.close(resolve)),
  };
}

function storeRow(id) {
  const timestamp = new Date().toISOString();
  return {
    id, name: id, code: id.toUpperCase(), normalizedCode: id.toUpperCase(),
    address: null, timezone: 'Pacific/Auckland', enabled: true,
    createdAt: timestamp, updatedAt: timestamp,
  };
}

const proxy = await startProxy(directDatabaseUrl);
process.env.NODE_ENV = 'test';
process.env.TEST_DATABASE_URL = proxy.url;
const { databasePool } = await import('../src/storage/database.js');
const { DatabaseStore } = await import('../src/storage/databaseStore.js');

const adminPool = new pg.Pool({ connectionString: directDatabaseUrl, max: 2 });
const store = new DatabaseStore();
await store.initStorage();

const insertStore = (id) => store.withFiles(['stores.json'], (drafts) => {
  drafts['stores.json'].push(storeRow(id));
}, { writeOrder: ['stores.json'] });

// 未处理的 error 事件会变成 uncaughtException（生产环境中即进程退出）；
// 监视器只记录、不改变进程行为，用来断言"进程存活"。
const uncaughtErrors = [];
process.on('uncaughtExceptionMonitor', (error) => uncaughtErrors.push(error));

const isDatabaseUnavailable = (error) => (
  error.status === 503 && error.code === 'DATABASE_UNAVAILABLE'
);

async function storeIds() {
  return (await store.readJSON('stores.json')).map((row) => row.id);
}

test.after(async () => {
  await databasePool.end();
  await adminPool.end();
  await proxy.close();
});

test('事务停在两条语句之间时被 pg_terminate_backend 终止：写入失败，进程存活，下一次写入成功', async () => {
  const originalConsoleError = console.error;
  console.error = () => {};
  try {
    store.setFaultInjector(async ({ stage }) => {
      if (stage !== 'before_commit') return;
      store.setFaultInjector(null);
      const { rows } = await adminPool.query(
        `SELECT pid, pg_terminate_backend(pid) AS terminated FROM pg_stat_activity
         WHERE pid <> pg_backend_pid() AND datname = current_database()
           AND state = 'idle in transaction'`,
      );
      assert.equal(rows.length, 1);
      assert.equal(rows[0].terminated, true);
      // 等后端进程退出、客户端收到 FATAL 后再继续，确保错误发生在语句之间。
      await waitFor(async () => (await adminPool.query(
        'SELECT 1 FROM pg_stat_activity WHERE pid = $1',
        [rows[0].pid],
      )).rowCount === 0);
      await sleep(100);
    });

    await assert.rejects(insertStore('store_terminated'), isDatabaseUnavailable);
  } finally {
    store.setFaultInjector(null);
    console.error = originalConsoleError;
  }

  assert.deepEqual(uncaughtErrors, []);
  await insertStore('store_after_terminate');
  const ids = await storeIds();
  assert.equal(ids.includes('store_terminated'), false);
  assert.equal(ids.includes('store_after_terminate'), true);
});

test('语句执行中网络断开（Connection terminated unexpectedly）：写入失败，进程存活，下一次写入成功', async () => {
  // 另一个会话持有全局写锁，让业务事务停在 pg_advisory_xact_lock 上（语句执行中）。
  const holder = await adminPool.connect();
  const originalConsoleError = console.error;
  console.error = () => {};
  try {
    await holder.query('BEGIN');
    await holder.query(
      'SELECT pg_advisory_xact_lock(hashtextextended($1, 0))',
      ['potxpress:global'],
    );

    const write = insertStore('store_network_drop');
    const outcome = write.then(() => null, (error) => error);
    await waitFor(async () => (await adminPool.query(
      `SELECT 1 FROM pg_stat_activity
       WHERE datname = current_database() AND wait_event_type = 'Lock'
         AND query LIKE '%pg_advisory_xact_lock%' AND pid <> $1`,
      [holder.processID],
    )).rowCount === 1);

    proxy.dropConnections();
    const error = await outcome;
    assert.ok(error, '写入应当失败');
    assert.ok(isDatabaseUnavailable(error), `unexpected error: ${error.message}`);
  } finally {
    await holder.query('ROLLBACK').catch(() => {});
    holder.release();
    console.error = originalConsoleError;
  }

  assert.deepEqual(uncaughtErrors, []);
  await insertStore('store_after_network_drop');
  const ids = await storeIds();
  assert.equal(ids.includes('store_network_drop'), false);
  assert.equal(ids.includes('store_after_network_drop'), true);
});
