import assert from 'node:assert/strict';
import test from 'node:test';

async function request(baseUrl, pathname, {
  method = 'GET',
  token,
  body,
  headers: extraHeaders = {},
} = {}) {
  const headers = { ...extraHeaders };
  if (token) headers.authorization = `Bearer ${token}`;
  if (body !== undefined) headers['content-type'] = 'application/json';

  const response = await fetch(`${baseUrl}${pathname}`, {
    method,
    headers,
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  return {
    status: response.status,
    headers: response.headers,
    body: await response.json(),
  };
}

async function login(baseUrl, username, password) {
  const response = await request(baseUrl, '/api/auth/login', {
    method: 'POST',
    body: { username, password },
  });
  assert.equal(response.status, 200);
  return response.body.data;
}

function timerPath(tableId, action) {
  return `/api/stores/store_demo/tables/${tableId}/timer/${action}`;
}

const BATCH_PATH = '/api/stores/store_demo/timers/reset-batch';

test('批量清台只结束名单中仍已到时的计时，拼桌按计时去重', async (t) => {
  process.env.NODE_ENV = 'test';
  process.env.PORT = '0';
  process.env.SEED_DEMO_DATA = 'true';
  process.env.JWT_SECRET = 'test-secret-only-for-batch-reset-api';
  process.env.CORS_ORIGIN = 'http://localhost:5173';

  const { startServer, stopServer } = await import('../server.js');
  const { timerService } = await import('../src/services/timer.service.js');
  const { databaseStore } = await import('../src/storage/databaseStore.js');
  let now = Date.parse('2026-01-15T00:00:00.000Z');
  timerService.setNowProvider(() => now);
  const server = await startServer();
  const baseUrl = `http://127.0.0.1:${server.address().port}`;

  t.after(async () => {
    timerService.setNowProvider(Date.now);
    await stopServer();
  });

  const storeAdmin = await login(baseUrl, 'demo_admin', 'admin123');
  const staff = await login(baseUrl, 'demo_staff', 'staff123');

  const group = await request(baseUrl, '/api/stores/store_demo/table-groups', {
    method: 'POST',
    token: storeAdmin.token,
    body: { tableIds: ['table_demo_01', 'table_demo_02'], name: 'A1+A2' },
  });
  assert.equal(group.status, 201);

  const timerIdByTable = {};
  for (const [tableId, minutes] of [
    ['table_demo_01', 5],
    ['table_demo_03', 5],
    ['table_demo_04', 5],
    ['table_demo_05', 5],
    ['table_demo_06', 60],
  ]) {
    const response = await request(baseUrl, timerPath(tableId, 'start'), {
      method: 'POST',
      token: staff.token,
      body: { durationMinutes: minutes },
    });
    assert.equal(response.status, 201, tableId);
    timerIdByTable[tableId] = response.body.data.timer.id;
  }
  assert.deepEqual(
    (await databaseStore.readJSON('activeTimers.json'))
      .find((timer) => timer.id === timerIdByTable.table_demo_01)
      .memberTableIds
      .sort(),
    ['table_demo_01', 'table_demo_02'],
  );

  now += 6 * 60 * 1000;
  // 确认期间：04 被加时不再到时，05 被暂停。
  const extended = await request(baseUrl, timerPath('table_demo_04', 'adjust'), {
    method: 'POST',
    token: staff.token,
    body: { deltaSeconds: 30 * 60 },
  });
  assert.equal(extended.status, 200);
  const paused = await request(baseUrl, timerPath('table_demo_05', 'pause'), {
    method: 'POST',
    token: staff.token,
  });
  assert.equal(paused.status, 200);

  const body = {
    timerIds: [
      timerIdByTable.table_demo_01,
      timerIdByTable.table_demo_01,
      timerIdByTable.table_demo_03,
      timerIdByTable.table_demo_04,
      timerIdByTable.table_demo_05,
      'timer_from_another_store',
    ],
  };

  const staffAttempt = await request(baseUrl, BATCH_PATH, {
    method: 'POST',
    token: staff.token,
    body,
  });
  assert.equal(staffAttempt.status, 403);

  const invalid = await request(baseUrl, BATCH_PATH, {
    method: 'POST',
    token: storeAdmin.token,
    body: { timerIds: [], onlyOverdue: true },
  });
  assert.equal(invalid.status, 400);
  const earlyReset = await request(baseUrl, BATCH_PATH, {
    method: 'POST',
    token: storeAdmin.token,
    body: { timerIds: [timerIdByTable.table_demo_06], onlyOverdue: false },
  });
  assert.equal(earlyReset.status, 400);

  const idempotencyKey = 'admin-batch-reset-demo';
  const result = await request(baseUrl, BATCH_PATH, {
    method: 'POST',
    token: storeAdmin.token,
    headers: { 'Idempotency-Key': idempotencyKey },
    body,
  });
  assert.equal(result.status, 200);
  assert.equal(result.body.data.resetCount, 2);
  assert.equal(result.body.data.resetTableCount, 3);
  assert.deepEqual(
    result.body.data.records.map((record) => record.timerId).sort(),
    [timerIdByTable.table_demo_01, timerIdByTable.table_demo_03].sort(),
  );
  assert.deepEqual(
    result.body.data.skipped
      .map((item) => [item.timerId, item.reason])
      .sort((left, right) => left[0].localeCompare(right[0])),
    [
      [timerIdByTable.table_demo_04, 'no_longer_overdue'],
      [timerIdByTable.table_demo_05, 'no_longer_overdue'],
      ['timer_from_another_store', 'not_active'],
    ].sort((left, right) => left[0].localeCompare(right[0])),
  );

  const replayed = await request(baseUrl, BATCH_PATH, {
    method: 'POST',
    token: storeAdmin.token,
    headers: { 'Idempotency-Key': idempotencyKey },
    body: { ...body, timerIds: [...body.timerIds].reverse() },
  });
  assert.equal(replayed.status, 200);
  assert.equal(replayed.headers.get('idempotency-replayed'), 'true');
  assert.deepEqual(
    replayed.body.data.records.map((record) => record.id),
    result.body.data.records.map((record) => record.id),
  );

  const activeTimerIds = (await databaseStore.readJSON('activeTimers.json'))
    .map((timer) => timer.id)
    .sort();
  assert.deepEqual(activeTimerIds, [
    timerIdByTable.table_demo_04,
    timerIdByTable.table_demo_05,
    timerIdByTable.table_demo_06,
  ].sort());

  // 旧 ID 已结束；同桌重新开台得到新 ID，旧名单不能结束新计时。
  const restarted = await request(baseUrl, timerPath('table_demo_03', 'start'), {
    method: 'POST',
    token: staff.token,
    body: { durationMinutes: 5 },
  });
  assert.equal(restarted.status, 201);
  now += 6 * 60 * 1000;
  const stale = await request(baseUrl, BATCH_PATH, {
    method: 'POST',
    token: storeAdmin.token,
    body: { timerIds: [timerIdByTable.table_demo_03] },
  });
  assert.equal(stale.status, 200);
  assert.equal(stale.body.data.resetCount, 0);
  assert.deepEqual(stale.body.data.skipped, [
    { timerId: timerIdByTable.table_demo_03, reason: 'not_active' },
  ]);
  assert.ok((await databaseStore.readJSON('activeTimers.json'))
    .some((timer) => timer.id === restarted.body.data.timer.id));

  // 清台拼桌计时不解除拼桌绑定。
  assert.ok((await databaseStore.readJSON('tableGroups.json'))
    .some((entry) => entry.id === group.body.data.group.id && entry.enabled));

  const records = await request(
    baseUrl,
    '/api/stores/store_demo/records?date=2026-01-15',
    { token: storeAdmin.token },
  );
  assert.equal(
    records.body.data.records
      .filter((record) => record.timerId === timerIdByTable.table_demo_01)
      .length,
    1,
  );

  const auditLogs = await databaseStore.readWhere('auditLogs.json', { limit: 10_000 });
  const batchAudits = auditLogs.filter((entry) => entry.action === 'timer.batch_reset');
  assert.equal(batchAudits.length, 2);
  const interventions = await request(
    baseUrl,
    '/api/stores/store_demo/timer-interventions?date=2026-01-15&action=admin_bulk_reset',
    { token: storeAdmin.token },
  );
  assert.equal(interventions.body.data.records.length, 2);
});
