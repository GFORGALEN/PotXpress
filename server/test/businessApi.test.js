import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { layoutsOverlap, planTableLayouts } from '../src/utils/tablePlacement.js';

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

function completeLayoutBody(layoutResponse, canvas = {}) {
  return {
    layoutVersion: layoutResponse.layoutVersion,
    canvas,
    tables: layoutResponse.tables.map((table) => ({
      tableId: table.tableId,
      layout: table.layout,
    })),
  };
}

test('桌台布局优先使用画布指定位置，并在重叠时回退到空位', () => {
  const canvas = {
    virtualWidth: 1600,
    virtualHeight: 900,
    gridSize: 20,
  };
  const preferred = { xRatio: 0.62, yRatio: 0.48 };
  const [placed] = planTableLayouts({
    canvas,
    existingLayouts: [],
    count: 1,
    startingZIndex: 3,
    preferredPositions: [preferred],
  });
  assert.equal(placed.xRatio, preferred.xRatio);
  assert.equal(placed.yRatio, preferred.yRatio);
  assert.equal(placed.zIndex, 3);

  const [fallback] = planTableLayouts({
    canvas,
    existingLayouts: [placed],
    count: 1,
    startingZIndex: 4,
    preferredPositions: [preferred],
  });
  assert.equal(layoutsOverlap(placed, fallback), false);
  assert.notDeepEqual(
    { xRatio: fallback.xRatio, yRatio: fallback.yRatio },
    preferred,
  );
});

test('门店、桌台、设置和布局 API 权限与并发链路可用', async (t) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'potxpress-business-test-'));
  process.env.NODE_ENV = 'test';
  process.env.PORT = '0';
  process.env.DATA_DIR = directory;
  process.env.SEED_DEMO_DATA = 'true';
  process.env.JWT_SECRET = 'test-secret-only-for-business-api';
  process.env.CORS_ORIGIN = 'http://localhost:5173';

  const { startServer, stopServer } = await import('../server.js');
  const { fileStore } = await import('../src/storage/fileStore.js');
  let server = await startServer();
  let baseUrl = `http://127.0.0.1:${server.address().port}`;

  t.after(async () => {
    await stopServer();
    await fs.rm(directory, { recursive: true, force: true });
  });

  const admin = await login(baseUrl, 'admin', 'admin123');
  const storeAdmin = await login(baseUrl, 'demo_admin', 'admin123');
  const storeStaff = await login(baseUrl, 'demo_staff', 'staff123');
  assert.equal(admin.user.id, 'user_admin');

  const storeAdminList = await request(baseUrl, '/api/stores', {
    token: storeAdmin.token,
  });
  assert.equal(storeAdminList.status, 200);
  assert.deepEqual(
    storeAdminList.body.data.stores.map((store) => store.id),
    ['store_demo'],
  );

  const createStoreResponse = await request(baseUrl, '/api/stores', {
    method: 'POST',
    token: admin.token,
    body: {
      name: '测试二店',
      code: ' test_002 ',
      timezone: 'Asia/Shanghai',
    },
  });
  assert.equal(createStoreResponse.status, 201);
  const secondStore = createStoreResponse.body.data.store;
  assert.equal(secondStore.code, 'TEST_002');

  const secondSettings = await request(
    baseUrl,
    `/api/stores/${secondStore.id}/settings`,
    { token: admin.token },
  );
  assert.equal(secondSettings.status, 200);
  assert.equal(secondSettings.body.data.settings.timezone, 'Asia/Shanghai');

  const firstFullLayoutBatch = await request(
    baseUrl,
    `/api/stores/${secondStore.id}/tables/batch`,
    {
      method: 'POST',
      token: admin.token,
      body: { startNumber: 1, count: 50 },
    },
  );
  assert.equal(firstFullLayoutBatch.status, 201);
  const secondFullLayoutBatch = await request(
    baseUrl,
    `/api/stores/${secondStore.id}/tables/batch`,
    {
      method: 'POST',
      token: admin.token,
      body: { startNumber: 51, count: 50 },
    },
  );
  assert.equal(secondFullLayoutBatch.status, 409);
  assert.equal(secondFullLayoutBatch.body.error.code, 'LAYOUT_FULL');
  const fullLayoutTableList = await request(
    baseUrl,
    `/api/stores/${secondStore.id}/tables`,
    { token: admin.token },
  );
  assert.equal(fullLayoutTableList.body.data.tables.length, 50);

  const forbiddenStore = await request(
    baseUrl,
    `/api/stores/${secondStore.id}/tables`,
    { token: storeAdmin.token },
  );
  assert.equal(forbiddenStore.status, 403);
  assert.equal(forbiddenStore.body.error.code, 'STORE_FORBIDDEN');

  const staffCreate = await request(
    baseUrl,
    '/api/stores/store_demo/tables',
    {
      method: 'POST',
      token: storeStaff.token,
      body: { name: '9号桌', number: 9 },
    },
  );
  assert.equal(staffCreate.status, 403);

  const batchResponse = await request(
    baseUrl,
    '/api/stores/store_demo/tables/batch',
    {
      method: 'POST',
      token: storeAdmin.token,
      body: { startNumber: 101, count: 20 },
    },
  );
  assert.equal(batchResponse.status, 201);
  assert.equal(batchResponse.body.data.tables.length, 20);

  const tableList = await request(
    baseUrl,
    '/api/stores/store_demo/tables',
    { token: storeAdmin.token },
  );
  const allTables = tableList.body.data.tables;
  assert.equal(allTables.length, 46);

  for (let leftIndex = 0; leftIndex < allTables.length; leftIndex += 1) {
    for (
      let rightIndex = leftIndex + 1;
      rightIndex < allTables.length;
      rightIndex += 1
    ) {
      assert.equal(
        layoutsOverlap(
          allTables[leftIndex].layout,
          allTables[rightIndex].layout,
        ),
        false,
        `${allTables[leftIndex].number} 与 ${allTables[rightIndex].number} 重叠`,
      );
    }
  }

  const duplicateNumber = await request(
    baseUrl,
    '/api/stores/store_demo/tables',
    {
      method: 'POST',
      token: storeAdmin.token,
      body: { name: '重复编号', number: 9 },
    },
  );
  assert.equal(duplicateNumber.status, 409);
  assert.equal(duplicateNumber.body.error.code, 'TABLE_NUMBER_TAKEN');

  const layoutRead = await request(
    baseUrl,
    '/api/stores/store_demo/layout',
    { token: storeAdmin.token },
  );
  assert.equal(layoutRead.status, 200);
  const originalLayout = layoutRead.body.data;
  const layoutSave = await request(
    baseUrl,
    '/api/stores/store_demo/layout',
    {
      method: 'PUT',
      token: storeAdmin.token,
      body: completeLayoutBody(originalLayout, {
        backgroundColor: '#fff8e7',
      }),
    },
  );
  assert.equal(layoutSave.status, 200);
  assert.equal(
    layoutSave.body.data.layoutVersion,
    originalLayout.layoutVersion + 1,
  );

  const staleLayoutSave = await request(
    baseUrl,
    '/api/stores/store_demo/layout',
    {
      method: 'PUT',
      token: storeAdmin.token,
      body: completeLayoutBody(originalLayout),
    },
  );
  assert.equal(staleLayoutSave.status, 409);
  assert.equal(staleLayoutSave.body.error.code, 'LAYOUT_CONFLICT');
  assert.equal(
    staleLayoutSave.body.error.details.serverVersion,
    originalLayout.layoutVersion + 1,
  );

  const currentLayoutResponse = await request(
    baseUrl,
    '/api/stores/store_demo/layout',
    { token: storeAdmin.token },
  );
  const currentLayout = currentLayoutResponse.body.data;
  const invalidBody = completeLayoutBody(currentLayout);
  invalidBody.tables[0].layout = {
    ...invalidBody.tables[0].layout,
    xRatio: 0.95,
    widthRatio: 0.1,
  };
  const invalidLayout = await request(
    baseUrl,
    '/api/stores/store_demo/layout',
    {
      method: 'PUT',
      token: storeAdmin.token,
      body: invalidBody,
    },
  );
  assert.equal(invalidLayout.status, 400);
  assert.equal(invalidLayout.body.error.code, 'VALIDATION_ERROR');

  const beforeMemberChange = await request(
    baseUrl,
    '/api/stores/store_demo/layout',
    { token: storeAdmin.token },
  );
  const createTwentyNine = await request(
    baseUrl,
    '/api/stores/store_demo/tables',
    {
      method: 'POST',
      token: storeAdmin.token,
      body: { name: '29号桌', number: 29 },
    },
  );
  assert.equal(createTwentyNine.status, 201);
  const staleAfterMemberChange = await request(
    baseUrl,
    '/api/stores/store_demo/layout',
    {
      method: 'PUT',
      token: storeAdmin.token,
      body: completeLayoutBody(beforeMemberChange.body.data),
    },
  );
  assert.equal(staleAfterMemberChange.status, 409);

  const sameNumberResults = await Promise.all([
    request(baseUrl, '/api/stores/store_demo/tables', {
      method: 'POST',
      token: storeAdmin.token,
      body: { name: '30号桌 A', number: 30 },
    }),
    request(baseUrl, '/api/stores/store_demo/tables', {
      method: 'POST',
      token: storeAdmin.token,
      body: { name: '30号桌 B', number: 30 },
    }),
  ]);
  assert.deepEqual(
    sameNumberResults.map((result) => result.status).sort(),
    [201, 409],
  );

  const differentNumberResults = await Promise.all([
    request(baseUrl, '/api/stores/store_demo/tables', {
      method: 'POST',
      token: storeAdmin.token,
      body: { name: '31号桌', number: 31 },
    }),
    request(baseUrl, '/api/stores/store_demo/tables', {
      method: 'POST',
      token: storeAdmin.token,
      body: { name: '32号桌', number: 32 },
    }),
  ]);
  assert.deepEqual(
    differentNumberResults.map((result) => result.status),
    [201, 201],
  );

  const tableThirtyTwo = differentNumberResults[1].body.data.table;
  const reorderResponse = await request(
    baseUrl,
    `/api/stores/store_demo/tables/${tableThirtyTwo.id}`,
    {
      method: 'PATCH',
      token: storeAdmin.token,
      body: { sortOrder: 1 },
    },
  );
  assert.equal(reorderResponse.status, 200);
  assert.equal(reorderResponse.body.data.table.sortOrder, 1);
  const duplicateUpdate = await request(
    baseUrl,
    `/api/stores/store_demo/tables/${tableThirtyTwo.id}`,
    {
      method: 'PATCH',
      token: storeAdmin.token,
      body: { number: 31 },
    },
  );
  assert.equal(duplicateUpdate.status, 409);
  assert.equal(duplicateUpdate.body.error.code, 'TABLE_NUMBER_TAKEN');
  const reorderedTableList = await request(
    baseUrl,
    '/api/stores/store_demo/tables',
    { token: storeAdmin.token },
  );
  const enabledSortOrders = reorderedTableList.body.data.tables
    .filter((table) => table.enabled)
    .map((table) => table.sortOrder)
    .sort((left, right) => left - right);
  assert.deepEqual(
    enabledSortOrders,
    Array.from({ length: enabledSortOrders.length }, (_, index) => index + 1),
  );

  const settingsUpdate = await request(
    baseUrl,
    '/api/stores/store_demo/settings',
    {
      method: 'PATCH',
      token: storeAdmin.token,
      body: {
        defaultDurationMinutes: 120,
        warningThresholdMinutes: 15,
        soundEnabled: false,
      },
    },
  );
  assert.equal(settingsUpdate.status, 200);
  assert.equal(
    settingsUpdate.body.data.settings.defaultDurationMinutes,
    120,
  );

  const stagedDeleteCreate = await request(
    baseUrl,
    '/api/stores/store_demo/tables',
    {
      method: 'POST',
      token: storeAdmin.token,
      body: { name: '33号桌', number: 33 },
    },
  );
  assert.equal(stagedDeleteCreate.status, 201);
  const stagedDeleteTable = stagedDeleteCreate.body.data.table;
  const stagedDeleteLayoutResponse = await request(
    baseUrl,
    '/api/stores/store_demo/layout',
    { token: storeAdmin.token },
  );
  const stagedDeleteBody = completeLayoutBody(stagedDeleteLayoutResponse.body.data);
  stagedDeleteBody.deletedTableIds = [stagedDeleteTable.id];
  stagedDeleteBody.tables = stagedDeleteBody.tables.filter(
    (table) => table.tableId !== stagedDeleteTable.id,
  );
  const stagedDeleteSave = await request(
    baseUrl,
    '/api/stores/store_demo/layout',
    {
      method: 'PUT',
      token: storeAdmin.token,
      body: stagedDeleteBody,
    },
  );
  assert.equal(stagedDeleteSave.status, 200);
  const layoutAfterStagedDelete = await request(
    baseUrl,
    '/api/stores/store_demo/layout',
    { token: storeAdmin.token },
  );
  assert.equal(
    layoutAfterStagedDelete.body.data.tables.some(
      (table) => table.tableId === stagedDeleteTable.id,
    ),
    false,
  );

  const tableToDelete = createTwentyNine.body.data.table;
  await fileStore.updateJSON('activeTimers.json', (timers) => {
    timers.push({
      id: 'timer_delete_conflict',
      storeId: 'store_demo',
      tableId: tableToDelete.id,
      targetType: 'table',
      groupId: null,
      memberTableIds: [tableToDelete.id],
      tableNameSnapshot: tableToDelete.name,
      tableNumberSnapshot: tableToDelete.number,
      startTime: new Date().toISOString(),
      plannedDurationSeconds: 3600,
      status: 'running',
      pauseStartedAt: null,
      totalPausedSeconds: 0,
      adjustments: [],
      overtimeAcknowledged: false,
      startedBy: 'user_demo_admin',
      startedByNameSnapshot: 'Demo admin',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
  });
  const deleteConflict = await request(
    baseUrl,
    `/api/stores/store_demo/tables/${tableToDelete.id}`,
    { method: 'DELETE', token: storeAdmin.token },
  );
  assert.equal(deleteConflict.status, 409);
  assert.equal(deleteConflict.body.error.code, 'TABLE_HAS_ACTIVE_TIMER');
  await fileStore.updateJSON('activeTimers.json', (timers) => (
    timers.filter((timer) => timer.id !== 'timer_delete_conflict')
  ));

  const deleteResponse = await request(
    baseUrl,
    `/api/stores/store_demo/tables/${tableToDelete.id}`,
    { method: 'DELETE', token: storeAdmin.token },
  );
  assert.equal(deleteResponse.status, 200);
  assert.equal(deleteResponse.body.data.table.enabled, false);
  const layoutAfterDelete = await request(
    baseUrl,
    '/api/stores/store_demo/layout',
    { token: storeAdmin.token },
  );
  assert.equal(
    layoutAfterDelete.body.data.tables
      .find((table) => table.tableId === tableToDelete.id)
      .enabled,
    false,
  );

  const secondLayoutBeforeDisable = await request(
    baseUrl,
    `/api/stores/${secondStore.id}/layout`,
    { token: admin.token },
  );
  const timezoneUpdate = await request(
    baseUrl,
    `/api/stores/${secondStore.id}`,
    {
      method: 'PATCH',
      token: admin.token,
      body: { timezone: 'Pacific/Auckland' },
    },
  );
  assert.equal(timezoneUpdate.status, 200);
  const synchronizedSettings = await request(
    baseUrl,
    `/api/stores/${secondStore.id}/settings`,
    { token: admin.token },
  );
  assert.equal(
    synchronizedSettings.body.data.settings.timezone,
    'Pacific/Auckland',
  );
  const disableStore = await request(
    baseUrl,
    `/api/stores/${secondStore.id}`,
    {
      method: 'PATCH',
      token: admin.token,
      body: { enabled: false },
    },
  );
  assert.equal(disableStore.status, 200);

  for (const disabledWrite of [
    request(baseUrl, `/api/stores/${secondStore.id}/tables`, {
      method: 'POST',
      token: admin.token,
      body: { name: '禁用店桌台', number: 1 },
    }),
    request(baseUrl, `/api/stores/${secondStore.id}/settings`, {
      method: 'PATCH',
      token: admin.token,
      body: { soundEnabled: false },
    }),
    request(baseUrl, `/api/stores/${secondStore.id}/layout`, {
      method: 'PUT',
      token: admin.token,
      body: completeLayoutBody(secondLayoutBeforeDisable.body.data),
    }),
  ]) {
    const response = await disabledWrite;
    assert.equal(response.status, 403);
    assert.equal(response.body.error.code, 'STORE_DISABLED');
  }

  await stopServer();
  server = await startServer();
  baseUrl = `http://127.0.0.1:${server.address().port}`;
  const persistedTables = await request(
    baseUrl,
    '/api/stores/store_demo/tables',
    { token: storeAdmin.token },
  );
  assert.equal(persistedTables.status, 200);
  assert.equal(
    persistedTables.body.data.tables.some((table) => table.number === 32),
    true,
  );

  const auditLogs = await fileStore.readJSON('auditLogs.json');
  const auditActions = new Set(auditLogs.map((entry) => entry.action));

  for (const action of [
    'store.create',
    'store.update',
    'table.batch_create',
    'table.create',
    'table.delete',
    'settings.update',
    'layout.save',
  ]) {
    assert.equal(auditActions.has(action), true, `缺少审计动作 ${action}`);
  }
});

test('自动落位在画布无空间时整批返回空计划', () => {
  const canvas = {
    virtualWidth: 1600,
    virtualHeight: 900,
    gridSize: 10,
  };
  const plan = planTableLayouts({
    canvas,
    existingLayouts: [{
      xRatio: 0,
      yRatio: 0,
      widthRatio: 1,
      heightRatio: 1,
      rotation: 0,
      zIndex: 1,
    }],
    count: 2,
    startingZIndex: 2,
  });
  assert.equal(plan, null);
});
