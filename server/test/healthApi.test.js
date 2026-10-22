import assert from 'node:assert/strict';
import test from 'node:test';

async function getHealth(url) {
  const startedAt = Date.now();
  const response = await fetch(url);
  return {
    status: response.status,
    body: await response.json(),
    elapsed: Date.now() - startedAt,
  };
}

test('存活检查不访问数据库，数据库占满或变慢时只有就绪检查失败', async (t) => {
  process.env.NODE_ENV = 'test';
  process.env.PORT = '0';
  process.env.SEED_DEMO_DATA = 'false';
  process.env.JWT_SECRET = 'test-secret-only-for-health-api';
  process.env.DATABASE_POOL_SIZE = '2';

  const { startServer, stopServer } = await import('../server.js');
  const database = await import('../src/storage/database.js');
  const server = await startServer();
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  const heldClients = [];
  t.after(async () => {
    heldClients.forEach((client) => client.release());
    await stopServer();
  });

  for (const path of ['/api/health', '/api/health/ready']) {
    const healthy = await getHealth(`${baseUrl}${path}`);
    assert.equal(healthy.status, 200, path);
    assert.equal(healthy.body.success, true);
    assert.equal(healthy.body.data.status, 'up');
    assert.equal(healthy.body.data.storage, 'ok');
    assert.equal(Number.isNaN(Date.parse(healthy.body.data.time)), false);
    assert.equal((await fetch(`${baseUrl}${path}?unexpected=true`)).status, 400);
  }

  // 借走连接池里的全部连接：SELECT 1 只能排队，等同数据库变慢或连不上。
  for (let index = 0; index < 2; index += 1) {
    heldClients.push(await database.databasePool.connect());
  }

  const live = await getHealth(`${baseUrl}/api/health`);
  assert.equal(live.status, 200);
  assert.equal(live.body.data.status, 'up');
  assert.ok(live.elapsed < 1_000, `存活检查耗时 ${live.elapsed}ms`);

  const notReady = await getHealth(`${baseUrl}/api/health/ready`);
  assert.equal(notReady.status, 503);
  assert.equal(notReady.body.success, false);
  assert.equal(notReady.body.data.status, 'down');
  assert.equal(notReady.body.data.storage, 'unavailable');
  // 就绪检查自带 2 秒预算，远早于 Render 的 5 秒超时返回。
  assert.ok(notReady.elapsed < 4_000, `就绪检查耗时 ${notReady.elapsed}ms`);

  heldClients.splice(0).forEach((client) => client.release());
  const ready = await getHealth(`${baseUrl}/api/health/ready`);
  assert.equal(ready.status, 200);
  assert.equal(ready.body.data.storage, 'ok');
});
