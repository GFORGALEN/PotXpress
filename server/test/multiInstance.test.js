import assert from 'node:assert/strict';
import test from 'node:test';
import { WebSocket } from 'ws';

async function request(baseUrl, pathname, { method = 'GET', token, body } = {}) {
  const headers = {};
  if (token) headers.authorization = `Bearer ${token}`;
  if (body !== undefined) headers['content-type'] = 'application/json';
  const response = await fetch(`${baseUrl}${pathname}`, {
    method,
    headers,
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  return { status: response.status, body: await response.json() };
}

async function login(baseUrl, username, password) {
  const response = await request(baseUrl, '/api/auth/login', {
    method: 'POST',
    body: { username, password },
  });
  assert.equal(response.status, 200);
  return response.body.data;
}

async function waitFor(predicate, timeoutMilliseconds = 3000) {
  const deadline = Date.now() + timeoutMilliseconds;
  while (Date.now() < deadline) {
    if (await predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error('Condition timeout');
}

async function subscribe(baseUrl, token, storeId) {
  const socket = new WebSocket(`${baseUrl.replace(/^http/, 'ws')}/ws`, 'potxpress.v1');
  const messages = [];
  socket.on('message', (raw) => messages.push(JSON.parse(raw.toString())));
  await new Promise((resolve, reject) => {
    socket.once('open', resolve);
    socket.once('error', reject);
  });
  socket.send(JSON.stringify({ type: 'authenticate', token, storeId }));
  await waitFor(() => messages.some((message) => message.type === 'ready'));
  return { socket, messages };
}

test('多实例：跨实例实时广播、门店独立店员入口密钥、共享登录限流', async (t) => {
  process.env.NODE_ENV = 'test';
  process.env.PORT = '0';
  process.env.SEED_DEMO_DATA = 'true';
  process.env.JWT_SECRET = 'test-secret-only-for-multi-instance';
  process.env.CORS_ORIGIN = 'http://localhost:5173';

  const { startServer, stopServer } = await import('../server.js');
  const { databasePool, REALTIME_CHANNEL } = await import('../src/storage/database.js');
  const { realtimeHub } = await import('../src/realtime/realtimeHub.js');
  const server = await startServer();
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  const sockets = [];
  t.after(async () => {
    for (const socket of sockets) socket.terminate();
    await stopServer();
  });

  const admin = await login(baseUrl, 'admin', 'admin123');
  const staff = await login(baseUrl, 'demo_staff', 'staff123');

  // —— 跨实例实时广播 ——
  await waitFor(() => realtimeHub.listener.listening);
  const subscriber = await subscribe(baseUrl, staff.token, 'store_demo');
  sockets.push(subscriber.socket);
  const { currentVersion } = subscriber.messages.find((message) => message.type === 'ready');

  // 模拟另一台实例：事件已提交到数据库，并通过 NOTIFY 通知所有实例。
  const remoteEventId = 'event_from_other_instance';
  await databasePool.query(
    `INSERT INTO realtime_events
       (id, store_id, version, type, entity_type, entity_id, event_payload, created_at)
     VALUES ($1, 'store_demo', $2, 'timer.started', 'timer', NULL, '{}'::jsonb, NOW())`,
    [remoteEventId, currentVersion + 1],
  );
  await databasePool.query('SELECT pg_notify($1, $2)', [
    REALTIME_CHANNEL,
    JSON.stringify({
      instanceId: 'another-instance',
      storeId: 'store_demo',
      id: remoteEventId,
      version: currentVersion + 1,
    }),
  ]);
  await waitFor(() => subscriber.messages.some(
    (message) => message.type === 'event' && message.event.id === remoteEventId,
  ));

  // 本实例产生的事件只推送一次（不会因为收到自己的 NOTIFY 而重复推送）。
  const started = await request(
    baseUrl,
    '/api/stores/store_demo/tables/table_demo_01/timer/start',
    { method: 'POST', token: staff.token, body: { durationMinutes: 30 } },
  );
  assert.equal(started.status, 201);
  const startedTimerId = started.body.data.timer.id;
  await waitFor(() => subscriber.messages.some(
    (message) => message.type === 'event' && message.event.entityId === startedTimerId,
  ));
  await new Promise((resolve) => setTimeout(resolve, 300));
  assert.equal(
    subscriber.messages.filter(
      (message) => message.type === 'event' && message.event.entityId === startedTimerId,
    ).length,
    1,
  );

  // —— 计时列表快照缓存：数据未变时只查指纹；其他实例写入后立即失效 ——
  const { timerService } = await import('../src/services/timer.service.js');
  const listTimers = async () => {
    const response = await request(baseUrl, '/api/stores/store_demo/timers', { token: staff.token });
    assert.equal(response.status, 200);
    return response.body.data.timers.find((timer) => timer.id === startedTimerId);
  };
  const beforeCache = await listTimers();
  const hitsBefore = timerService.snapshotCacheHits;
  assert.deepEqual(
    (({ remainingSeconds, ...rest }) => rest)(await listTimers()),
    (({ remainingSeconds, ...rest }) => rest)(beforeCache),
  );
  assert.equal(timerService.snapshotCacheHits, hitsBefore + 1);
  await databasePool.query(
    `UPDATE active_timers
     SET planned_duration_seconds = planned_duration_seconds + 600,
         updated_at = updated_at + interval '1 millisecond'
     WHERE id = $1`,
    [startedTimerId],
  );
  const afterOtherInstanceWrite = await listTimers();
  assert.equal(
    afterOtherInstanceWrite.plannedDurationSeconds,
    beforeCache.plannedDurationSeconds + 600,
  );

  // —— 门店独立的店员入口链接 ——
  assert.equal(
    (await request(baseUrl, '/api/stores/store_demo/kiosk-link', { token: staff.token })).status,
    403,
  );
  const firstLink = await request(baseUrl, '/api/stores/store_demo/kiosk-link', { token: admin.token });
  assert.equal(firstLink.status, 200);
  const firstKey = firstLink.body.data.kiosk.key;
  assert.equal(
    (await request(baseUrl, '/api/auth/kiosk', { method: 'POST', body: { key: firstKey } })).status,
    200,
  );

  const rotated = await request(baseUrl, '/api/stores/store_demo/kiosk-link/rotate', {
    method: 'POST',
    token: admin.token,
  });
  assert.equal(rotated.status, 200);
  const secondKey = rotated.body.data.kiosk.key;
  assert.notEqual(secondKey, firstKey);
  assert.equal(
    (await request(baseUrl, '/api/auth/kiosk', { method: 'POST', body: { key: firstKey } })).status,
    401,
  );
  assert.equal(
    (await request(baseUrl, '/api/auth/kiosk', { method: 'POST', body: { key: secondKey } })).status,
    200,
  );
  // 轮换门店链接不影响已登录用户。
  assert.equal(
    (await request(baseUrl, '/api/stores/store_demo/timers', { token: staff.token })).status,
    200,
  );

  // —— 登录限流存放在数据库中，多个实例共享 ——
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const failed = await request(baseUrl, '/api/auth/login', {
      method: 'POST',
      body: { username: 'demo_admin', password: 'wrong-password' },
    });
    assert.equal(failed.status, 401);
  }
  const limited = await request(baseUrl, '/api/auth/login', {
    method: 'POST',
    body: { username: 'demo_admin', password: 'admin123' },
  });
  assert.equal(limited.status, 429);
  const { rows } = await databasePool.query(
    'SELECT failures FROM login_attempts ORDER BY failures DESC LIMIT 1',
  );
  assert.equal(rows[0].failures, 5);
});
