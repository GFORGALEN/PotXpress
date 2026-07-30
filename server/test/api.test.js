import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

test('健康检查、登录和 tokenVersion 失效链路可用', async (t) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'potxpress-api-test-'));
  process.env.NODE_ENV = 'test';
  process.env.PORT = '0';
  process.env.DATA_DIR = directory;
  process.env.SEED_DEMO_DATA = 'true';
  process.env.JWT_SECRET = 'test-secret-only-for-isolated-tests';
  process.env.CORS_ORIGIN = 'http://localhost:5173';

  const { startServer, stopServer } = await import('../server.js');
  const { fileStore } = await import('../src/storage/fileStore.js');
  let server;

  t.after(async () => {
    await stopServer();
    await fs.rm(directory, { recursive: true, force: true });
  });

  server = await startServer();
  const address = server.address();
  const baseUrl = `http://127.0.0.1:${address.port}`;

  const healthResponse = await fetch(`${baseUrl}/api/health`);
  const healthBody = await healthResponse.json();
  assert.equal(healthResponse.status, 200);
  assert.equal(healthBody.data.status, 'up');
  assert.equal(healthBody.data.storage, 'ok');
  assert.equal(Number.isNaN(Date.parse(healthBody.data.time)), false);
  const unknownQueryResponse = await fetch(
    `${baseUrl}/api/health?unexpected=true`,
  );
  assert.equal(unknownQueryResponse.status, 400);

  const invalidResponse = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username: 'missing', password: 'wrong-password' }),
  });
  const invalidBody = await invalidResponse.json();
  assert.equal(invalidResponse.status, 401);
  assert.equal(invalidBody.error.code, 'UNAUTHORIZED');

  for (let attempt = 0; attempt < 4; attempt += 1) {
    const response = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        username: 'missing',
        password: 'wrong-password',
      }),
    });
    assert.equal(response.status, 401);
  }

  const rateLimitedResponse = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      username: 'missing',
      password: 'wrong-password',
    }),
  });
  assert.equal(rateLimitedResponse.status, 429);
  assert.equal(rateLimitedResponse.headers.has('retry-after'), true);

  const loginResponse = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username: 'ADMIN', password: 'admin123' }),
  });
  const loginBody = await loginResponse.json();
  assert.equal(loginResponse.status, 200);
  assert.equal(loginBody.data.user.role, 'system_admin');
  assert.equal('passwordHash' in loginBody.data.user, false);
  assert.equal(typeof loginBody.data.token, 'string');

  const meResponse = await fetch(`${baseUrl}/api/auth/me`, {
    headers: { authorization: `Bearer ${loginBody.data.token}` },
  });
  assert.equal(meResponse.status, 200);

  const createUserResponse = await fetch(`${baseUrl}/api/users`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${loginBody.data.token}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      username: 'module8_staff',
      displayName: '模块八员工',
      password: 'staffpass1',
      role: 'store_staff',
      storeId: 'store_demo',
    }),
  });
  const createUserBody = await createUserResponse.json();
  assert.equal(createUserResponse.status, 201);
  assert.equal('passwordHash' in createUserBody.data.user, false);

  const staffLoginResponse = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      username: 'module8_staff',
      password: 'staffpass1',
    }),
  });
  const staffLoginBody = await staffLoginResponse.json();
  assert.equal(staffLoginResponse.status, 200);

  const passwordResponse = await fetch(`${baseUrl}/api/auth/password`, {
    method: 'PATCH',
    headers: {
      authorization: `Bearer ${staffLoginBody.data.token}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      currentPassword: 'staffpass1',
      newPassword: 'staffpass2',
    }),
  });
  assert.equal(passwordResponse.status, 200);

  const invalidatedStaffResponse = await fetch(`${baseUrl}/api/auth/me`, {
    headers: { authorization: `Bearer ${staffLoginBody.data.token}` },
  });
  assert.equal(invalidatedStaffResponse.status, 401);

  const selfDisableResponse = await fetch(
    `${baseUrl}/api/users/${loginBody.data.user.id}`,
    {
      method: 'PATCH',
      headers: {
        authorization: `Bearer ${loginBody.data.token}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ enabled: false }),
    },
  );
  const selfDisableBody = await selfDisableResponse.json();
  assert.equal(selfDisableResponse.status, 409);
  assert.equal(selfDisableBody.error.code, 'CANNOT_REVOKE_SELF');

  await fileStore.updateJSON('users.json', (users) => {
    const admin = users.find((user) => user.id === 'user_admin');
    admin.tokenVersion += 1;
    admin.updatedAt = new Date().toISOString();
  });

  const expiredResponse = await fetch(`${baseUrl}/api/auth/me`, {
    headers: { authorization: `Bearer ${loginBody.data.token}` },
  });
  const expiredBody = await expiredResponse.json();
  assert.equal(expiredResponse.status, 401);
  assert.equal(expiredBody.error.code, 'UNAUTHORIZED');
});
