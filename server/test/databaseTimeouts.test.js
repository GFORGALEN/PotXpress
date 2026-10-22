import assert from 'node:assert/strict';
import net from 'node:net';
import test from 'node:test';

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

/**
 * 夹在应用和真实 PostgreSQL 之间的 TCP 代理。blackhole() 之后双向数据被静默
 * 丢弃、连接却不断开——和 NAT 或连接池代理悄悄丢掉连接时应用看到的一样。
 */
async function startBlackholeProxy(target) {
  let dropping = false;
  const sockets = new Set();
  const server = net.createServer((downstream) => {
    const upstream = net.connect(Number(target.port), target.hostname);
    const close = () => {
      downstream.destroy();
      upstream.destroy();
    };
    for (const socket of [downstream, upstream]) {
      sockets.add(socket);
      socket.on('error', close);
      socket.on('close', () => {
        sockets.delete(socket);
        close();
      });
    }
    downstream.on('data', (chunk) => {
      if (!dropping) upstream.write(chunk);
    });
    upstream.on('data', (chunk) => {
      if (!dropping) downstream.write(chunk);
    });
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  return {
    port: server.address().port,
    blackhole() { dropping = true; },
    restore() { dropping = false; },
    async close() {
      sockets.forEach((socket) => socket.destroy());
      await new Promise((resolve) => server.close(resolve));
    },
  };
}

const targetUrl = new URL(
  process.env.TEST_DATABASE_URL || 'postgres://potxpress:potxpress@127.0.0.1:5432/potxpress',
);
const proxy = await startBlackholeProxy(targetUrl);
const proxiedUrl = new URL(targetUrl);
proxiedUrl.hostname = '127.0.0.1';
proxiedUrl.port = String(proxy.port);
process.env.NODE_ENV = 'test';
process.env.TEST_DATABASE_URL = proxiedUrl.toString();

const database = await import('../src/storage/database.js');
const { DatabaseStore } = await import('../src/storage/databaseStore.js');
const { AppError } = await import('../src/utils/appError.js');

test.before(() => database.initializeDatabase());
test.after(async () => {
  await database.closeDatabasePool();
  await proxy.close();
});

const addStore = (store, id, lockStoreId) => store.updateJSON(
  'stores.json',
  (stores) => [...stores, storeRow(id)],
  { lockScope: { storeId: lockStoreId } },
);
const storeIds = async () => (await database.databasePool.query(
  'SELECT id FROM stores ORDER BY id',
)).rows.map((row) => row.id);

test('连接池开启 TCP 保活，并设置略长于 statement_timeout 的客户端超时', () => {
  const { options } = database.databasePool;
  assert.equal(options.keepAlive, true);
  assert.ok(options.keepAliveInitialDelayMillis > 0);
  assert.equal(options.query_timeout, database.CLIENT_QUERY_TIMEOUT_MILLISECONDS);
  assert.ok(database.CLIENT_QUERY_TIMEOUT_MILLISECONDS > 10_000);
  assert.ok(database.CLIENT_QUERY_TIMEOUT_MILLISECONDS < 15_000);
  assert.equal(new DatabaseStore().idleInTransactionTimeout, '15s');
});

test('提交时连接变成黑洞：客户端超时后丢弃该连接，同门店排队的写入继续执行', { timeout: 60_000 }, async () => {
  let armed = false;
  const store = new DatabaseStore({
    faultInjector: async ({ stage }) => {
      if (stage !== 'before_commit' || !armed) return;
      armed = false;
      proxy.blackhole();
      // COMMIT 已发出后才恢复转发：这个连接永远等不到响应，其他连接照常工作。
      setTimeout(() => proxy.restore(), 500);
    },
  });
  await store.initStorage();
  armed = true;
  let removedClients = 0;
  database.databasePool.on('remove', () => {
    removedClients += 1;
  });

  const startedAt = Date.now();
  const stuck = addStore(store, 'store_blackholed', 'store_shared').then(
    () => null,
    (error) => ({ error, elapsed: Date.now() - startedAt }),
  );
  const queued = addStore(store, 'store_after_blackhole', 'store_shared');

  const failure = await stuck;
  assert.ok(failure, '黑洞连接上的写入不应成功');
  assert.ok(failure.error instanceof AppError);
  assert.equal(failure.error.status, 503);
  assert.equal(failure.error.code, 'DATABASE_UNAVAILABLE');
  assert.ok(
    failure.elapsed >= database.CLIENT_QUERY_TIMEOUT_MILLISECONDS - 500
      && failure.elapsed < database.CLIENT_QUERY_TIMEOUT_MILLISECONDS + 3_000,
    `客户端超时耗时 ${failure.elapsed}ms`,
  );

  await queued;
  assert.ok(removedClients >= 1, '超时的连接应从连接池移除，而不是借给下一个请求');
  const ids = await storeIds();
  assert.ok(ids.includes('store_after_blackhole'));
  assert.equal(ids.includes('store_blackholed'), false);
});

test('事务在应用侧卡住时由数据库终止会话并释放门店锁，进程不崩溃', { timeout: 60_000 }, async () => {
  let armed = true;
  const stalled = new DatabaseStore({
    idleInTransactionTimeout: '300ms',
    faultInjector: async ({ stage }) => {
      if (stage !== 'before_commit' || !armed) return;
      armed = false;
      await sleep(3_000);
    },
  });
  // 另一实例（独立的写队列）只能靠数据库 advisory lock 与之互斥。
  const otherInstance = new DatabaseStore();

  let stalledSettled = false;
  const stalledWrite = addStore(stalled, 'store_stalled', 'store_locked').then(
    () => null,
    (error) => error,
  ).finally(() => {
    stalledSettled = true;
  });
  await sleep(800);

  const startedAt = Date.now();
  await addStore(otherInstance, 'store_not_blocked', 'store_locked');
  const elapsed = Date.now() - startedAt;
  assert.equal(stalledSettled, false, '卡住的事务还在应用侧等待');
  assert.ok(elapsed < 2_000, `另一实例等锁 ${elapsed}ms`);

  const error = await stalledWrite;
  assert.ok(error instanceof AppError, String(error));
  assert.equal(error.status, 503);
  assert.equal(error.code, 'DATABASE_UNAVAILABLE');
  const ids = await storeIds();
  assert.ok(ids.includes('store_not_blocked'));
  assert.equal(ids.includes('store_stalled'), false);
});
