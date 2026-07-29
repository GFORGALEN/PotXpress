import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

async function request(baseUrl, pathname, {
  method = 'GET',
  token,
  body,
} = {}) {
  const headers = {};

  if (token) {
    headers.authorization = `Bearer ${token}`;
  }

  if (body !== undefined) {
    headers['content-type'] = 'application/json';
  }

  const response = await fetch(`${baseUrl}${pathname}`, {
    method,
    headers,
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  const responseBody = await response.json();
  return { status: response.status, body: responseBody };
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

test('计时状态机、记录、CSV、并发和重启恢复链路可用', async (t) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'potxpress-timer-test-'));
  process.env.NODE_ENV = 'test';
  process.env.PORT = '0';
  process.env.DATA_DIR = directory;
  process.env.SEED_DEMO_DATA = 'true';
  process.env.JWT_SECRET = 'test-secret-only-for-timer-api';
  process.env.CORS_ORIGIN = 'http://localhost:5173';

  const { startServer, stopServer } = await import('../server.js');
  const { fileStore } = await import('../src/storage/fileStore.js');
  const { timerService } = await import('../src/services/timer.service.js');
  const { recordService } = await import('../src/services/record.service.js');
  let now = Date.parse('2026-01-15T00:00:00.000Z');
  timerService.setNowProvider(() => now);
  recordService.setNowProvider(() => now);
  let server = await startServer();
  let baseUrl = `http://127.0.0.1:${server.address().port}`;

  t.after(async () => {
    timerService.setNowProvider(Date.now);
    recordService.setNowProvider(Date.now);
    await stopServer();
    await fs.rm(directory, { recursive: true, force: true });
  });

  const admin = await login(baseUrl, 'admin', 'admin123');
  const storeAdmin = await login(baseUrl, 'demo_admin', 'admin123');
  const staff = await login(baseUrl, 'demo_staff', 'staff123');

  const concurrentStarts = await Promise.all([
    request(baseUrl, timerPath('table_demo_01', 'start'), {
      method: 'POST',
      token: staff.token,
      body: { durationMinutes: 5 },
    }),
    request(baseUrl, timerPath('table_demo_01', 'start'), {
      method: 'POST',
      token: staff.token,
      body: { durationMinutes: 5 },
    }),
  ]);
  assert.deepEqual(
    concurrentStarts.map((result) => result.status).sort(),
    [201, 409],
  );

  const activeTimerPath = path.join(directory, 'activeTimers.json');
  const beforeReads = await fs.readFile(activeTimerPath, 'utf8');
  const beforeReadStat = await fs.stat(activeTimerPath);
  const firstRead = await request(
    baseUrl,
    '/api/stores/store_demo/timers',
    { token: staff.token },
  );
  const secondRead = await request(
    baseUrl,
    '/api/stores/store_demo/timers',
    { token: staff.token },
  );
  assert.equal(firstRead.body.data.serverTime, new Date(now).toISOString());
  assert.equal(secondRead.status, 200);
  assert.equal(await fs.readFile(activeTimerPath, 'utf8'), beforeReads);
  assert.equal((await fs.stat(activeTimerPath)).mtimeMs, beforeReadStat.mtimeMs);

  now += 30_000;
  const paused = await request(
    baseUrl,
    timerPath('table_demo_01', 'pause'),
    { method: 'POST', token: staff.token },
  );
  assert.equal(paused.status, 200);
  assert.equal(paused.body.data.timer.status, 'paused');
  assert.equal(paused.body.data.timer.remainingSeconds, 270);
  const duplicatePause = await request(
    baseUrl,
    timerPath('table_demo_01', 'pause'),
    { method: 'POST', token: staff.token },
  );
  assert.equal(duplicatePause.status, 409);

  now += 60_000;
  const frozen = await request(
    baseUrl,
    '/api/stores/store_demo/timers',
    { token: staff.token },
  );
  assert.equal(frozen.body.data.timers[0].remainingSeconds, 270);
  const resumed = await request(
    baseUrl,
    timerPath('table_demo_01', 'resume'),
    { method: 'POST', token: staff.token },
  );
  assert.equal(resumed.body.data.timer.totalPausedSeconds, 60);
  const duplicateResume = await request(
    baseUrl,
    timerPath('table_demo_01', 'resume'),
    { method: 'POST', token: staff.token },
  );
  assert.equal(duplicateResume.status, 409);

  now += 10_000;
  await request(baseUrl, timerPath('table_demo_01', 'pause'), {
    method: 'POST',
    token: staff.token,
  });
  now += 20_000;
  await request(baseUrl, timerPath('table_demo_01', 'resume'), {
    method: 'POST',
    token: staff.token,
  });
  now += 10_000;
  await request(baseUrl, timerPath('table_demo_01', 'pause'), {
    method: 'POST',
    token: staff.token,
  });
  now += 30_000;
  const thirdResume = await request(
    baseUrl,
    timerPath('table_demo_01', 'resume'),
    { method: 'POST', token: staff.token },
  );
  assert.equal(thirdResume.body.data.timer.totalPausedSeconds, 110);

  const beforeAdd = thirdResume.body.data.timer.remainingSeconds;
  const added = await request(
    baseUrl,
    timerPath('table_demo_01', 'adjust'),
    {
      method: 'POST',
      token: staff.token,
      body: { deltaSeconds: 300, reason: '顾客加时' },
    },
  );
  assert.equal(added.body.data.timer.remainingSeconds - beforeAdd, 300);
  const subtracted = await request(
    baseUrl,
    timerPath('table_demo_01', 'adjust'),
    {
      method: 'POST',
      token: staff.token,
      body: { deltaSeconds: -600, reason: '缩短' },
    },
  );
  const lastAdjustment = subtracted.body.data.timer.adjustments.at(-1);
  assert.equal(subtracted.body.data.timer.plannedDurationSeconds, 60);
  assert.equal(lastAdjustment.seconds, 540);
  assert.equal(lastAdjustment.requestedSeconds, 600);
  const noEffectiveAdjustment = await request(
    baseUrl,
    timerPath('table_demo_01', 'adjust'),
    {
      method: 'POST',
      token: staff.token,
      body: { deltaSeconds: -1 },
    },
  );
  assert.equal(noEffectiveAdjustment.status, 400);
  const prematureAcknowledge = await request(
    baseUrl,
    timerPath('table_demo_01', 'acknowledge-alert'),
    { method: 'POST', token: staff.token },
  );
  assert.equal(prematureAcknowledge.status, 409);

  now += 20_000;
  const overtime = await request(
    baseUrl,
    '/api/stores/store_demo/timers',
    { token: staff.token },
  );
  assert.equal(overtime.body.data.timers[0].status, 'overtime');
  assert.equal(overtime.body.data.timers[0].overtimeSeconds, 10);

  const acknowledged = await request(
    baseUrl,
    timerPath('table_demo_01', 'acknowledge-alert'),
    { method: 'POST', token: staff.token },
  );
  assert.equal(acknowledged.body.data.timer.overtimeAcknowledged, true);
  const acknowledgedAgain = await request(
    baseUrl,
    timerPath('table_demo_01', 'acknowledge-alert'),
    { method: 'POST', token: staff.token },
  );
  assert.equal(acknowledgedAgain.status, 200);

  const returnedFromOvertime = await request(
    baseUrl,
    timerPath('table_demo_01', 'adjust'),
    {
      method: 'POST',
      token: staff.token,
      body: { deltaSeconds: 300 },
    },
  );
  assert.equal(returnedFromOvertime.body.data.timer.overtimeAcknowledged, false);
  await request(baseUrl, timerPath('table_demo_01', 'adjust'), {
    method: 'POST',
    token: staff.token,
    body: { deltaSeconds: -300 },
  });

  const runningReset = await request(
    baseUrl,
    timerPath('table_demo_01', 'reset'),
    { method: 'POST', token: staff.token },
  );
  assert.equal(runningReset.status, 200);
  const runningRecord = runningReset.body.data.record;
  assert.equal(runningRecord.totalPausedSeconds, 110);
  assert.equal(runningRecord.actualDurationSeconds, 70);
  assert.equal(runningRecord.plannedDurationSeconds, 60);
  assert.equal(runningRecord.plannedEndTime, '2026-01-15T00:01:00.000Z');
  assert.equal(
    runningRecord.effectiveEndTimeAtReset,
    '2026-01-15T00:02:50.000Z',
  );
  assert.equal(runningRecord.actualEndTime, '2026-01-15T00:03:00.000Z');
  const filteredRunningRecords = await request(
    baseUrl,
    '/api/stores/store_demo/records?tableId=table_demo_01',
    { token: staff.token },
  );
  assert.equal(filteredRunningRecords.body.data.date, '2026-01-15');
  assert.equal(filteredRunningRecords.body.data.records.length, 1);

  await request(baseUrl, timerPath('table_demo_02', 'start'), {
    method: 'POST',
    token: staff.token,
    body: { durationMinutes: 5 },
  });
  now += 30_000;
  await stopServer();
  now += 2_000;
  server = await startServer();
  baseUrl = `http://127.0.0.1:${server.address().port}`;
  const afterRestart = await request(
    baseUrl,
    '/api/stores/store_demo/timers',
    { token: staff.token },
  );
  const restoredTimer = afterRestart.body.data.timers.find(
    (timer) => timer.tableId === 'table_demo_02',
  );
  assert.equal(restoredTimer.remainingSeconds, 268);
  await request(baseUrl, timerPath('table_demo_02', 'reset'), {
    method: 'POST',
    token: staff.token,
  });

  await request(baseUrl, timerPath('table_demo_03', 'start'), {
    method: 'POST',
    token: staff.token,
    body: { durationMinutes: 5 },
  });
  now += 30_000;
  await request(baseUrl, timerPath('table_demo_03', 'pause'), {
    method: 'POST',
    token: staff.token,
  });
  now += 60_000;
  const pausedReset = await request(
    baseUrl,
    timerPath('table_demo_03', 'reset'),
    { method: 'POST', token: staff.token },
  );
  assert.equal(pausedReset.body.data.record.totalPausedSeconds, 60);
  assert.equal(pausedReset.body.data.record.actualDurationSeconds, 30);
  assert.equal(
    Date.parse(pausedReset.body.data.record.effectiveEndTimeAtReset)
      - Date.parse(pausedReset.body.data.record.plannedEndTime),
    60_000,
  );

  const defaultDurationStart = await request(
    baseUrl,
    timerPath('table_demo_04', 'start'),
    {
      method: 'POST',
      token: staff.token,
    },
  );
  assert.equal(
    defaultDurationStart.body.data.timer.plannedDurationSeconds,
    90 * 60,
  );
  const disableStore = await request(
    baseUrl,
    '/api/stores/store_demo',
    {
      method: 'PATCH',
      token: admin.token,
      body: { enabled: false },
    },
  );
  assert.equal(disableStore.status, 200);
  const disabledStart = await request(
    baseUrl,
    timerPath('table_demo_05', 'start'),
    {
      method: 'POST',
      token: admin.token,
      body: { durationMinutes: 5 },
    },
  );
  assert.equal(disabledStart.status, 403);
  assert.equal(disabledStart.body.error.code, 'STORE_DISABLED');
  const disabledTimers = await request(
    baseUrl,
    '/api/stores/store_demo/timers',
    { token: admin.token },
  );
  assert.equal(disabledTimers.status, 200);
  const disabledReset = await request(
    baseUrl,
    timerPath('table_demo_04', 'reset'),
    { method: 'POST', token: admin.token },
  );
  assert.equal(disabledReset.status, 200);
  await request(baseUrl, '/api/stores/store_demo', {
    method: 'PATCH',
    token: admin.token,
    body: { enabled: true },
  });

  await request(baseUrl, timerPath('table_demo_05', 'start'), {
    method: 'POST',
    token: staff.token,
    body: { durationMinutes: 5 },
  });
  const pauseResetRace = await Promise.all([
    request(baseUrl, timerPath('table_demo_05', 'pause'), {
      method: 'POST',
      token: staff.token,
    }),
    request(baseUrl, timerPath('table_demo_05', 'reset'), {
      method: 'POST',
      token: staff.token,
    }),
  ]);
  assert.equal(
    pauseResetRace.some((response) => response.status === 200),
    true,
  );
  const timersAfterRace = await fileStore.readJSON('activeTimers.json');
  const recordsAfterRace = await fileStore.readJSON('records.json');
  assert.equal(
    timersAfterRace.some((timer) => timer.tableId === 'table_demo_05'),
    false,
  );
  assert.equal(
    recordsAfterRace.filter(
      (record) => record.tableId === 'table_demo_05',
    ).length,
    1,
  );

  await request(baseUrl, timerPath('table_demo_06', 'start'), {
    method: 'POST',
    token: staff.token,
    body: { durationMinutes: 5 },
  });
  const resetRace = await Promise.all([
    request(baseUrl, timerPath('table_demo_06', 'reset'), {
      method: 'POST',
      token: staff.token,
    }),
    request(baseUrl, timerPath('table_demo_06', 'reset'), {
      method: 'POST',
      token: staff.token,
    }),
  ]);
  assert.deepEqual(
    resetRace.map((response) => response.status).sort(),
    [200, 409],
  );

  now = Date.parse('2026-04-04T13:30:00.000Z');
  await request(baseUrl, timerPath('table_demo_07', 'start'), {
    method: 'POST',
    token: staff.token,
    body: { durationMinutes: 5 },
  });
  await request(baseUrl, timerPath('table_demo_07', 'reset'), {
    method: 'POST',
    token: staff.token,
  });
  now = Date.parse('2026-04-04T14:30:00.000Z');
  await request(baseUrl, timerPath('table_demo_08', 'start'), {
    method: 'POST',
    token: staff.token,
    body: { durationMinutes: 5 },
  });
  await request(baseUrl, timerPath('table_demo_08', 'reset'), {
    method: 'POST',
    token: staff.token,
  });

  const dstRecords = await request(
    baseUrl,
    '/api/stores/store_demo/records?date=2026-04-05',
    { token: staff.token },
  );
  assert.equal(dstRecords.status, 200);
  assert.equal(dstRecords.body.data.records.length, 2);
  const detail = await request(
    baseUrl,
    `/api/stores/store_demo/records/${runningRecord.id}`,
    { token: staff.token },
  );
  assert.equal(detail.status, 200);

  const exportResponse = await fetch(
    `${baseUrl}/api/stores/store_demo/records/export?date=2026-04-05`,
    { headers: { authorization: `Bearer ${staff.token}` } },
  );
  const csvBytes = new Uint8Array(await exportResponse.arrayBuffer());
  const csv = new TextDecoder().decode(csvBytes);
  assert.equal(exportResponse.status, 200);
  assert.deepEqual([...csvBytes.slice(0, 3)], [0xEF, 0xBB, 0xBF]);
  assert.match(csv, /桌台/);
  assert.match(
    exportResponse.headers.get('content-disposition'),
    /records-2026-04-05\.csv/,
  );

  const staffAudit = await request(
    baseUrl,
    '/api/stores/store_demo/audit-logs',
    { token: staff.token },
  );
  assert.equal(staffAudit.status, 403);
  const adminAudit = await request(
    baseUrl,
    '/api/stores/store_demo/audit-logs?action=timer.reset&limit=100',
    { token: storeAdmin.token },
  );
  assert.equal(adminAudit.status, 200);
  assert.equal(adminAudit.body.data.logs.length >= 7, true);

  const activeTimers = await fileStore.readJSON('activeTimers.json');
  const records = await fileStore.readJSON('records.json');
  assert.equal(activeTimers.length, 0);
  assert.equal(
    new Set(records.map((record) => record.timerId)).size,
    records.length,
  );
});
