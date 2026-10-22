import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const runNode = promisify(execFile);

async function request(baseUrl, pathname, { method = 'GET', token, body } = {}) {
  const response = await fetch(`${baseUrl}${pathname}`, {
    method,
    headers: {
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  return { status: response.status, body: await response.json() };
}

// 在新进程里完整启动一次服务（等同 Render 重启或休眠唤醒），读一次就绪检查后正常停机。
const RESTART_SCRIPT = `
  const { startServer, stopServer } = await import('./server.js');
  try {
    const server = await startServer();
    const response = await fetch(\`http://127.0.0.1:\${server.address().port}/api/health/ready\`);
    console.log('READY ' + JSON.stringify({ status: response.status, body: await response.json() }));
    await stopServer();
  } catch (error) {
    console.error('STARTUP_FAILED ' + error.message);
    process.exitCode = 1;
  }
`;

test('业务数据违反约束时带警告启动，结构版本错误仍拒绝启动，停机后进程立即退出', async (t) => {
  process.env.NODE_ENV = 'test';
  process.env.PORT = '0';
  process.env.SEED_DEMO_DATA = 'true';
  process.env.JWT_SECRET = 'test-secret-only-for-startup-resilience';

  const { startServer, stopServer } = await import('../server.js');
  const database = await import('../src/storage/database.js');
  const { checkDataConsistency } = await import('../src/storage/consistencyChecker.js');
  const { config } = await import('../src/config.js');
  const server = await startServer();
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  t.after(stopServer);

  const schemaUrl = new URL(config.databaseUrl);
  schemaUrl.searchParams.set('options', `-csearch_path=${config.databaseSchema}`);
  const restart = async () => {
    const startedAt = Date.now();
    const outcome = await runNode(
      process.execPath,
      ['--input-type=module', '--eval', RESTART_SCRIPT],
      {
        cwd: fileURLToPath(new URL('..', import.meta.url)),
        env: {
          ...process.env, NODE_ENV: 'development', DATABASE_SSL: 'false',
          DATABASE_URL: schemaUrl.toString(), SEED_DEMO_DATA: 'false', PORT: '0',
        },
      },
    ).then(
      ({ stdout, stderr }) => ({ code: 0, stdout, stderr }),
      (error) => ({ code: error.code, stdout: error.stdout, stderr: error.stderr }),
    );
    return { ...outcome, elapsed: Date.now() - startedAt };
  };

  assert.deepEqual(await checkDataConsistency(), []);

  const admin = (await request(baseUrl, '/api/auth/login', {
    method: 'POST', body: { username: 'demo_admin', password: 'admin123' },
  })).body.data;
  const group = await request(baseUrl, '/api/stores/store_demo/table-groups', {
    method: 'POST',
    token: admin.token,
    body: { tableIds: ['table_demo_01', 'table_demo_02'], name: 'A1+A2' },
  });
  assert.equal(group.status, 201);
  const started = await request(baseUrl, '/api/stores/store_demo/tables/table_demo_01/timer/start', {
    method: 'POST', token: admin.token, body: { durationMinutes: 30 },
  });
  assert.equal(started.status, 201);
  const { timer } = started.body.data;
  assert.equal(timer.targetType, 'group');

  // 绕过业务代码直接写坏数据：每类各一行，模拟历史脏数据或手工修库失误。
  await database.databasePool.query(`
    UPDATE restaurant_tables SET sort_order = 99 WHERE id = 'table_demo_07';
    UPDATE restaurant_tables SET layout = jsonb_set(layout, '{xRatio}', '0.99')
      WHERE id = 'table_demo_08';
    UPDATE restaurant_tables SET layout = jsonb_set(layout, '{rotation}', '90')
      WHERE id = 'table_demo_09';
    UPDATE restaurant_tables SET layout = 'null'::jsonb WHERE id = 'table_demo_10';
    UPDATE table_groups SET enabled = false;`);

  const issues = await checkDataConsistency({ logger: { warn() {} } });
  for (const expected of [
    /table_demo_07=99/,
    /桌台 table_demo_08 布局超出画布边界/,
    /tables\.json 数据结构无效：table_demo_09 的 layout\.rotation/,
    /桌台 table_demo_10 无法检查/,
    new RegExp(`计时器 ${timer.id} 的拼桌组引用无效`),
  ]) {
    assert.ok(issues.some((issue) => expected.test(issue)), `缺少问题：${expected}\n${issues.join('\n')}`);
  }

  await t.test('新进程照常启动并就绪，问题逐条带 ID 写入日志', async () => {
    const result = await restart();
    assert.equal(result.code, 0, result.stderr);
    assert.match(result.stderr, /数据一致性检查发现 \d+ 个问题，服务继续启动/);
    for (const id of ['table_demo_07', 'table_demo_08', 'table_demo_09', 'table_demo_10', timer.id]) {
      assert.match(result.stderr, new RegExp(id));
    }
    const ready = JSON.parse(result.stdout.match(/^READY (.*)$/m)[1]);
    assert.equal(ready.status, 200);
    assert.equal(ready.body.data.storage, 'ok');
    // 停机时关闭连接池：不必等 30 秒空闲超时，进程马上退出。
    assert.ok(result.elapsed < 20_000, `进程退出耗时 ${result.elapsed}ms`);
  });

  await t.test('数据库结构版本高于程序时仍拒绝启动，并及时退出', async () => {
    await database.databasePool.query('INSERT INTO schema_migrations (version) VALUES (9999)');
    try {
      const result = await restart();
      assert.equal(result.code, 1);
      assert.match(result.stderr, /STARTUP_FAILED 数据库结构版本 9999 高于程序支持的版本/);
      assert.ok(result.elapsed < 20_000, `进程退出耗时 ${result.elapsed}ms`);
    } finally {
      await database.databasePool.query('DELETE FROM schema_migrations WHERE version = 9999');
    }
  });
});
