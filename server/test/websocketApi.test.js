import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { WebSocket } from 'ws';

class SocketInbox {
  constructor(socket) {
    this.socket = socket;
    this.messages = [];
    this.waiters = [];
    socket.on('message', (raw) => {
      const message = JSON.parse(raw.toString());
      const waiterIndex = this.waiters.findIndex(
        (waiter) => waiter.predicate(message),
      );
      if (waiterIndex === -1) {
        this.messages.push(message);
        return;
      }
      const [waiter] = this.waiters.splice(waiterIndex, 1);
      clearTimeout(waiter.timeout);
      waiter.resolve(message);
    });
  }

  next(predicate, timeoutMilliseconds = 2000) {
    const queuedIndex = this.messages.findIndex(predicate);
    if (queuedIndex !== -1) {
      return Promise.resolve(this.messages.splice(queuedIndex, 1)[0]);
    }

    return new Promise((resolve, reject) => {
      const waiter = {
        predicate,
        resolve,
        reject,
        timeout: null,
      };
      waiter.timeout = setTimeout(() => {
        const index = this.waiters.indexOf(waiter);
        if (index !== -1) {
          this.waiters.splice(index, 1);
        }
        reject(new Error('WebSocket message timeout'));
      }, timeoutMilliseconds);
      this.waiters.push(waiter);
    });
  }
}

async function request(baseUrl, pathname, {
  method = 'GET',
  token,
  body,
  headers: extraHeaders = {},
} = {}) {
  const headers = { ...extraHeaders };
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
  return {
    status: response.status,
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

async function openSocket(baseUrl) {
  const socket = new WebSocket(
    baseUrl.replace(/^http/, 'ws') + '/ws',
    'potxpress.v1',
  );
  const inbox = new SocketInbox(socket);
  await new Promise((resolve, reject) => {
    socket.once('open', resolve);
    socket.once('error', reject);
  });
  return { socket, inbox };
}

async function authenticateSocket(baseUrl, token, storeId) {
  const connection = await openSocket(baseUrl);
  connection.socket.send(JSON.stringify({
    type: 'authenticate',
    token,
    storeId,
    clientId: 'websocket-integration-test',
  }));
  const ready = await connection.inbox.next(
    (message) => message.type === 'ready',
  );
  return { ...connection, ready };
}

function waitForClose(socket) {
  if (socket.readyState === WebSocket.CLOSED) {
    return Promise.resolve({
      code: socket._closeCode,
      reason: socket._closeMessage?.toString() ?? '',
    });
  }
  return new Promise((resolve) => {
    socket.once('close', (code, reason) => {
      resolve({ code, reason: reason.toString() });
    });
  });
}

function timerPath(tableId, action) {
  return `/api/stores/store_demo/tables/${tableId}/timer/${action}`;
}

async function waitFor(predicate, timeoutMilliseconds = 1000) {
  const deadline = Date.now() + timeoutMilliseconds;
  while (Date.now() < deadline) {
    if (predicate()) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error('Condition timeout');
}

test('WebSocket 鉴权、门店隔离、事件版本和重启恢复链路可靠', async (t) => {
  const directory = await fs.mkdtemp(
    path.join(os.tmpdir(), 'potxpress-websocket-test-'),
  );
  process.env.NODE_ENV = 'test';
  process.env.PORT = '0';
  process.env.DATA_DIR = directory;
  process.env.SEED_DEMO_DATA = 'true';
  process.env.JWT_SECRET = 'test-secret-only-for-websocket-api';
  process.env.CORS_ORIGIN = 'http://localhost:5173';

  const { startServer, stopServer } = await import('../server.js');
  const { fileStore } = await import('../src/storage/fileStore.js');
  const { realtimeHub } = await import('../src/realtime/realtimeHub.js');
  let server = await startServer();
  let baseUrl = `http://127.0.0.1:${server.address().port}`;
  const sockets = new Set();

  t.after(async () => {
    fileStore.setFaultInjector(null);
    for (const socket of sockets) {
      socket.terminate();
    }
    await stopServer();
    await fs.rm(directory, { recursive: true, force: true });
  });

  const admin = await login(baseUrl, 'admin', 'admin123');
  const staff = await login(baseUrl, 'demo_staff', 'staff123');
  const secondStoreResponse = await request(baseUrl, '/api/stores', {
    method: 'POST',
    token: admin.token,
    body: {
      name: 'WebSocket 隔离门店',
      code: 'WS_ISOLATED',
      timezone: 'Pacific/Auckland',
    },
  });
  assert.equal(secondStoreResponse.status, 201);
  const secondStoreId = secondStoreResponse.body.data.store.id;

  const invalidConnection = await openSocket(baseUrl);
  sockets.add(invalidConnection.socket);
  invalidConnection.socket.send(JSON.stringify({
    type: 'authenticate',
    token: 'invalid.jwt.token',
    storeId: 'store_demo',
  }));
  const authError = await invalidConnection.inbox.next(
    (message) => message.type === 'error',
  );
  assert.equal(authError.error.code, 'UNAUTHORIZED');
  assert.equal((await waitForClose(invalidConnection.socket)).code, 4401);

  const forbiddenConnection = await openSocket(baseUrl);
  sockets.add(forbiddenConnection.socket);
  forbiddenConnection.socket.send(JSON.stringify({
    type: 'authenticate',
    token: staff.token,
    storeId: secondStoreId,
  }));
  const forbiddenError = await forbiddenConnection.inbox.next(
    (message) => message.type === 'error',
  );
  assert.equal(forbiddenError.error.code, 'STORE_FORBIDDEN');
  assert.equal((await waitForClose(forbiddenConnection.socket)).code, 4403);

  const demoConnection = await authenticateSocket(
    baseUrl,
    staff.token,
    'store_demo',
  );
  sockets.add(demoConnection.socket);
  const isolatedConnection = await authenticateSocket(
    baseUrl,
    admin.token,
    secondStoreId,
  );
  sockets.add(isolatedConnection.socket);
  assert.equal(demoConnection.ready.currentVersion, 0);
  assert.equal(isolatedConnection.ready.currentVersion, 0);
  assert.equal(realtimeHub.getRoomSize('store_demo'), 1);
  assert.equal(realtimeHub.getRoomSize(secondStoreId), 1);

  const startedEventPromise = demoConnection.inbox.next(
    (message) => message.type === 'event',
  );
  const started = await request(
    baseUrl,
    timerPath('table_demo_01', 'start'),
    {
      method: 'POST',
      token: staff.token,
      body: { durationMinutes: 5 },
    },
  );
  assert.equal(started.status, 201);
  const startedEvent = (await startedEventPromise).event;
  assert.equal(startedEvent.type, 'timer.started');
  assert.equal(startedEvent.version, 1);
  assert.equal(startedEvent.storeId, 'store_demo');
  await assert.rejects(
    isolatedConnection.inbox.next(
      (message) => message.type === 'event',
      250,
    ),
    /timeout/,
  );
  await assert.rejects(
    demoConnection.inbox.next(
      (message) => message.type === 'event',
      1100,
    ),
    /timeout/,
  );

  const pauseKey = 'websocket-pause-idempotency';
  const pauseEventPromise = demoConnection.inbox.next(
    (message) => message.type === 'event',
  );
  const paused = await request(
    baseUrl,
    timerPath('table_demo_01', 'pause'),
    {
      method: 'POST',
      token: staff.token,
      headers: { 'Idempotency-Key': pauseKey },
    },
  );
  assert.equal(paused.status, 200);
  const pauseEvent = (await pauseEventPromise).event;
  assert.equal(pauseEvent.type, 'timer.paused');
  assert.equal(pauseEvent.version, 2);

  const replayedPause = await request(
    baseUrl,
    timerPath('table_demo_01', 'pause'),
    {
      method: 'POST',
      token: staff.token,
      headers: { 'Idempotency-Key': pauseKey },
    },
  );
  assert.equal(replayedPause.status, 200);
  await assert.rejects(
    demoConnection.inbox.next(
      (message) => message.type === 'event',
      250,
    ),
    /timeout/,
  );

  const snapshotAfterPause = await request(
    baseUrl,
    '/api/stores/store_demo/timers',
    { token: staff.token },
  );
  assert.equal(snapshotAfterPause.body.data.eventVersion, 2);

  const eventsBeforeFailure = await fileStore.readJSON('realtimeEvents.json');
  fileStore.setFaultInjector(({ stage, filename }) => {
    if (stage === 'before_replace' && filename === 'auditLogs.json') {
      fileStore.setFaultInjector(null);
      throw new Error('injected websocket transaction failure');
    }
  });
  const originalConsoleError = console.error;
  let failedStart;
  console.error = () => {};
  try {
    failedStart = await request(
      baseUrl,
      timerPath('table_demo_02', 'start'),
      {
        method: 'POST',
        token: staff.token,
        body: { durationMinutes: 5 },
      },
    );
  } finally {
    console.error = originalConsoleError;
  }
  assert.equal(failedStart.status, 500);
  assert.deepEqual(
    await fileStore.readJSON('realtimeEvents.json'),
    eventsBeforeFailure,
  );
  await assert.rejects(
    demoConnection.inbox.next(
      (message) => message.type === 'event',
      250,
    ),
    /timeout/,
  );

  demoConnection.socket.close(1000, 'TEST_DISCONNECT');
  await waitForClose(demoConnection.socket);
  await waitFor(() => realtimeHub.getRoomSize('store_demo') === 0);
  assert.equal(realtimeHub.getRoomSize('store_demo'), 0);
  await request(baseUrl, timerPath('table_demo_01', 'adjust'), {
    method: 'POST',
    token: staff.token,
    body: { deltaSeconds: 60 },
  });
  await request(baseUrl, timerPath('table_demo_01', 'resume'), {
    method: 'POST',
    token: staff.token,
  });

  const recoveredConnection = await authenticateSocket(
    baseUrl,
    staff.token,
    'store_demo',
  );
  sockets.add(recoveredConnection.socket);
  assert.equal(recoveredConnection.ready.currentVersion, 4);
  const recoveredSnapshot = await request(
    baseUrl,
    '/api/stores/store_demo/timers',
    { token: staff.token },
  );
  assert.equal(recoveredSnapshot.body.data.eventVersion, 4);
  assert.equal(
    recoveredSnapshot.body.data.timers[0].plannedDurationSeconds,
    360,
  );

  const firstInstanceId = recoveredConnection.ready.serverInstanceId;
  const restartClose = waitForClose(recoveredConnection.socket);
  isolatedConnection.socket.close(1000, 'TEST_COMPLETE');
  await waitForClose(isolatedConnection.socket);
  await stopServer();
  assert.equal((await restartClose).code, 1012);

  server = await startServer();
  baseUrl = `http://127.0.0.1:${server.address().port}`;
  const restartedConnection = await authenticateSocket(
    baseUrl,
    staff.token,
    'store_demo',
  );
  sockets.add(restartedConnection.socket);
  assert.notEqual(
    restartedConnection.ready.serverInstanceId,
    firstInstanceId,
  );
  assert.equal(restartedConnection.ready.currentVersion, 4);
  const restartedSnapshot = await request(
    baseUrl,
    '/api/stores/store_demo/timers',
    { token: staff.token },
  );
  assert.equal(restartedSnapshot.body.data.eventVersion, 4);

  await request(baseUrl, timerPath('table_demo_01', 'reset'), {
    method: 'POST',
    token: staff.token,
  });

  await fileStore.updateJSON('users.json', (users) => {
    const staffUser = users.find((user) => user.id === 'user_demo_staff');
    staffUser.tokenVersion += 1;
  });
  const revokedClose = waitForClose(restartedConnection.socket);
  await realtimeHub.recheckAuthorizations();
  assert.equal((await revokedClose).code, 4401);
});
