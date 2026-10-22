import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { WebSocket } from 'ws';

async function openSocket(baseUrl) {
  const socket = new WebSocket(
    baseUrl.replace(/^http/, 'ws') + '/ws',
    'potxpress.v1',
  );
  socket.on('error', () => {});
  await new Promise((resolve, reject) => {
    socket.once('open', resolve);
    socket.once('error', reject);
  });
  return socket;
}

function waitForClose(socket) {
  return new Promise((resolve) => {
    socket.once('close', (code) => resolve(code));
  });
}

// ws 在协议违规（超过 maxPayload、非法帧）时会在服务端 WebSocket 上触发 error 事件；
// 没有监听器时 Node 会直接退出进程，任何未鉴权的客户端都能让服务宕机。
test('WebSocket 协议违规只关闭该连接，服务继续可用', async (t) => {
  const directory = await fs.mkdtemp(
    path.join(os.tmpdir(), 'potxpress-websocket-protocol-test-'),
  );
  process.env.NODE_ENV = 'test';
  process.env.PORT = '0';
  process.env.DATA_DIR = directory;
  process.env.SEED_DEMO_DATA = 'true';
  process.env.JWT_SECRET = 'test-secret-only-for-websocket-protocol';
  process.env.CORS_ORIGIN = 'http://localhost:5173';

  const { startServer, stopServer } = await import('../server.js');
  const server = await startServer();
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  const sockets = new Set();
  const uncaughtErrors = [];
  const recordUncaught = (error) => uncaughtErrors.push(error);
  process.on('uncaughtExceptionMonitor', recordUncaught);

  const originalConsoleWarn = console.warn;
  const warnings = [];
  console.warn = (...args) => warnings.push(args.join(' '));

  t.after(async () => {
    console.warn = originalConsoleWarn;
    process.off('uncaughtExceptionMonitor', recordUncaught);
    for (const socket of sockets) {
      socket.terminate();
    }
    await stopServer();
    await fs.rm(directory, { recursive: true, force: true });
  });

  const oversized = await openSocket(baseUrl);
  sockets.add(oversized);
  const oversizedClosed = waitForClose(oversized);
  oversized.send('x'.repeat(16 * 1024 + 1));
  assert.equal(await oversizedClosed, 1009);

  const unmasked = await openSocket(baseUrl);
  sockets.add(unmasked);
  const unmaskedClosed = waitForClose(unmasked);
  // 客户端帧必须带掩码；直接写一个未掩码的文本帧 "hi"。
  unmasked._socket.write(Buffer.from([0x81, 0x02, 0x68, 0x69]));
  assert.equal(await unmaskedClosed, 1002);

  assert.deepEqual(uncaughtErrors, []);
  assert.equal(warnings.length, 2);

  const health = await fetch(`${baseUrl}/api/health`);
  assert.equal(health.status, 200);

  const loginResponse = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username: 'demo_staff', password: 'staff123' }),
  });
  assert.equal(loginResponse.status, 200);
  const { data: staff } = await loginResponse.json();

  const healthy = await openSocket(baseUrl);
  sockets.add(healthy);
  const ready = new Promise((resolve) => {
    healthy.on('message', (raw) => {
      const message = JSON.parse(raw.toString());
      if (message.type === 'ready') resolve(message);
    });
  });
  healthy.send(JSON.stringify({
    type: 'authenticate',
    token: staff.token,
    storeId: 'store_demo',
  }));
  assert.equal((await ready).storeId, 'store_demo');
});
