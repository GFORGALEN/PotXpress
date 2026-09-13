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

test('超时每 20 分钟升级、第二次自动清台并支持管理员一键清台', async (t) => {
  process.env.NODE_ENV = 'test';
  process.env.PORT = '0';
  process.env.SEED_DEMO_DATA = 'true';
  process.env.JWT_SECRET = 'test-secret-only-for-intervention-api';
  process.env.CORS_ORIGIN = 'http://localhost:5173';

  const { startServer, stopServer } = await import('../server.js');
  const { timerService } = await import('../src/services/timer.service.js');
  const { fileStore } = await import('../src/storage/fileStore.js');
  let now = Date.parse('2026-01-15T00:00:00.000Z');
  timerService.setNowProvider(() => now);
  const server = await startServer();
  const baseUrl = `http://127.0.0.1:${server.address().port}`;

  t.after(async () => {
    timerService.setNowProvider(Date.now);
    await stopServer();
  });

  const systemAdmin = await login(baseUrl, 'admin', 'admin123');
  const storeAdmin = await login(baseUrl, 'demo_admin', 'admin123');
  const staff = await login(baseUrl, 'demo_staff', 'staff123');

  const started = await request(baseUrl, timerPath('table_demo_01', 'start'), {
    method: 'POST',
    token: staff.token,
    body: { durationMinutes: 5 },
  });
  assert.equal(started.status, 201);

  now += 5 * 60 * 1000 + 1_000;
  const initialOvertimeAcknowledgement = await request(
    baseUrl,
    timerPath('table_demo_01', 'acknowledge-alert'),
    { method: 'POST', token: staff.token },
  );
  assert.equal(initialOvertimeAcknowledgement.status, 200);
  assert.equal(
    initialOvertimeAcknowledgement.body.data.timer.overtimeAcknowledged,
    true,
  );

  now += 20 * 60 * 1000 - 1_000;
  const firstPass = await timerService.processOverdueTimers();
  assert.equal(firstPass.remindersCreated, 1);
  assert.equal(firstPass.automaticResets, 0);

  const afterFirstReminder = await request(
    baseUrl,
    '/api/stores/store_demo/timers',
    { token: staff.token },
  );
  assert.equal(afterFirstReminder.status, 200);
  assert.equal(afterFirstReminder.body.data.timers.length, 1);
  assert.equal(
    afterFirstReminder.body.data.timers[0].overdueReminderCount,
    1,
  );
  assert.equal(
    afterFirstReminder.body.data.timers[0].overtimeAcknowledged,
    false,
  );
  assert.equal(afterFirstReminder.body.data.timers[0].overtimeSeconds, 20 * 60);

  const forbiddenInterventions = await request(
    baseUrl,
    '/api/stores/store_demo/timer-interventions?date=2026-01-15',
    { token: staff.token },
  );
  assert.equal(forbiddenInterventions.status, 403);

  const firstInterventions = await request(
    baseUrl,
    '/api/stores/store_demo/timer-interventions?date=2026-01-15',
    { token: storeAdmin.token },
  );
  assert.equal(firstInterventions.status, 200);
  assert.equal(firstInterventions.body.data.records.length, 1);
  assert.equal(
    firstInterventions.body.data.records[0].action,
    'overdue_reminder',
  );
  assert.equal(firstInterventions.body.data.records[0].reminderNumber, 1);

  const duplicatePass = await timerService.processOverdueTimers();
  assert.equal(duplicatePass.remindersCreated, 0);
  assert.equal(duplicatePass.automaticResets, 0);

  const acknowledged = await request(
    baseUrl,
    timerPath('table_demo_01', 'acknowledge-alert'),
    { method: 'POST', token: staff.token },
  );
  assert.equal(acknowledged.status, 200);
  assert.equal(acknowledged.body.data.timer.overtimeAcknowledged, true);

  now += 20 * 60 * 1000;
  const secondPass = await timerService.processOverdueTimers();
  assert.equal(secondPass.remindersCreated, 0);
  assert.equal(secondPass.automaticResets, 1);

  const afterAutomaticReset = await request(
    baseUrl,
    '/api/stores/store_demo/timers',
    { token: staff.token },
  );
  assert.equal(afterAutomaticReset.body.data.timers.length, 0);

  const automaticInterventions = await request(
    baseUrl,
    '/api/stores/store_demo/timer-interventions?date=2026-01-15',
    { token: systemAdmin.token },
  );
  assert.deepEqual(
    automaticInterventions.body.data.records
      .map((record) => [record.action, record.reminderNumber])
      .sort((left, right) => left[1] - right[1]),
    [
      ['overdue_reminder', 1],
      ['auto_reset', 2],
    ],
  );

  const recordsAfterAutomaticReset = await request(
    baseUrl,
    '/api/stores/store_demo/records?date=2026-01-15',
    { token: staff.token },
  );
  assert.equal(recordsAfterAutomaticReset.body.data.records.length, 1);
  assert.equal(
    recordsAfterAutomaticReset.body.data.records[0].resetByNameSnapshot,
    '系统自动清台',
  );

  for (const tableId of ['table_demo_02', 'table_demo_03']) {
    const response = await request(baseUrl, timerPath(tableId, 'start'), {
      method: 'POST',
      token: staff.token,
      body: { durationMinutes: 5 },
    });
    assert.equal(response.status, 201);
  }

  const staffBulkReset = await request(
    baseUrl,
    '/api/stores/store_demo/timers/reset-all',
    { method: 'POST', token: staff.token },
  );
  assert.equal(staffBulkReset.status, 403);

  const idempotencyKey = 'admin-reset-all-demo';
  const bulkReset = await request(
    baseUrl,
    '/api/stores/store_demo/timers/reset-all',
    {
      method: 'POST',
      token: storeAdmin.token,
      headers: { 'Idempotency-Key': idempotencyKey },
    },
  );
  assert.equal(bulkReset.status, 200);
  assert.equal(bulkReset.body.data.resetCount, 2);

  const replayedBulkReset = await request(
    baseUrl,
    '/api/stores/store_demo/timers/reset-all',
    {
      method: 'POST',
      token: storeAdmin.token,
      headers: { 'Idempotency-Key': idempotencyKey },
    },
  );
  assert.equal(replayedBulkReset.status, 200);
  assert.equal(replayedBulkReset.headers.get('idempotency-replayed'), 'true');
  assert.deepEqual(
    replayedBulkReset.body.data.records.map((record) => record.id),
    bulkReset.body.data.records.map((record) => record.id),
  );

  const bulkInterventions = await request(
    baseUrl,
    '/api/stores/store_demo/timer-interventions?date=2026-01-15&action=admin_bulk_reset',
    { token: storeAdmin.token },
  );
  assert.equal(bulkInterventions.body.data.records.length, 2);
  assert.equal(
    (await fileStore.readJSON('activeTimers.json')).length,
    0,
  );

  await request(baseUrl, timerPath('table_demo_04', 'start'), {
    method: 'POST',
    token: staff.token,
    body: { durationMinutes: 5 },
  });
  now += 25 * 60 * 1000;
  await timerService.processOverdueTimers();
  const extendedBackIntoRunning = await request(
    baseUrl,
    timerPath('table_demo_04', 'adjust'),
    {
      method: 'POST',
      token: staff.token,
      body: { deltaSeconds: 30 * 60, reason: '顾客继续用餐' },
    },
  );
  assert.equal(extendedBackIntoRunning.status, 200);
  assert.equal(
    extendedBackIntoRunning.body.data.timer.overdueReminderCount,
    0,
  );

  now += 30 * 60 * 1000;
  const reminderAfterExtension = await timerService.processOverdueTimers();
  assert.equal(reminderAfterExtension.remindersCreated, 1);
  const tableFourInterventions = await request(
    baseUrl,
    '/api/stores/store_demo/timer-interventions?date=2026-01-15&tableId=table_demo_04&action=overdue_reminder',
    { token: storeAdmin.token },
  );
  assert.equal(tableFourInterventions.body.data.records.length, 2);
  await request(baseUrl, timerPath('table_demo_04', 'reset'), {
    method: 'POST',
    token: staff.token,
  });

  const auditActions = new Set(
    (await fileStore.readJSON('auditLogs.json')).map((entry) => entry.action),
  );
  assert.equal(auditActions.has('timer.overdue_reminder'), true);
  assert.equal(auditActions.has('timer.auto_reset'), true);
  assert.equal(auditActions.has('timer.reset_all'), true);
});
