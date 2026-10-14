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

test('永久删除桌台保留历史快照，活动计时和拼桌仍受保护', async (t) => {
  process.env.NODE_ENV = 'test';
  process.env.PORT = '0';
  process.env.SEED_DEMO_DATA = 'true';
  process.env.JWT_SECRET = 'test-secret-only-for-table-deletion-api';
  process.env.CORS_ORIGIN = 'http://localhost:5173';

  const { startServer, stopServer } = await import('../server.js');
  const { databaseStore } = await import('../src/storage/databaseStore.js');
  const { databasePool } = await import('../src/storage/database.js');
  const { timerService } = await import('../src/services/timer.service.js');
  const { readRecordStats } = await import('../src/services/data.service.js');
  const { config } = await import('../src/config.js');
  let now = Date.parse('2026-10-14T00:00:00.000Z');
  let replacementId;
  timerService.setNowProvider(() => now);
  let server = await startServer();
  let baseUrl = `http://127.0.0.1:${server.address().port}`;
  t.after(async () => {
    timerService.setNowProvider(Date.now);
    await stopServer();
    await databasePool.end();
  });

  const login = async (username, password) => {
    const response = await request(baseUrl, '/api/auth/login', {
      method: 'POST', body: { username, password },
    });
    assert.equal(response.status, 200);
    return response.body.data.token;
  };
  const admin = await login('demo_admin', 'admin123');
  const staff = await login('demo_staff', 'staff123');
  const prefix = '/api/stores/store_demo';
  const call = (pathname, options = {}) => request(baseUrl, `${prefix}${pathname}`, {
    token: admin, ...options,
  });
  const start = async (id) => {
    const response = await call(`/tables/${id}/timer/start`, {
      method: 'POST', body: { durationMinutes: 5 },
    });
    assert.equal(response.status, 201);
    return response.body.data.timer;
  };
  const finish = async (id) => {
    await start(id);
    now += 60_000;
    const response = await call(`/tables/${id}/timer/reset`, { method: 'POST' });
    assert.equal(response.status, 200);
    return response.body.data.record;
  };
  const readLayout = async () => (await call('/layout')).body.data;
  const deleteInLayout = (layout, ids) => call('/layout', {
    method: 'PUT', body: {
      layoutVersion: layout.layoutVersion,
      canvas: {}, decorations: layout.decorations,
      deletedTableIds: ids,
      tables: layout.tables.filter((table) => !ids.includes(table.tableId))
        .map((table) => ({ tableId: table.tableId, layout: table.layout })),
    },
  });

  await t.test('v8 迁移仅解除历史桌台外键，保留成员和活动约束', async () => {
    const { rows } = await databasePool.query(`
      SELECT conrelid::regclass::text AS relation, conname AS name
      FROM pg_constraint WHERE contype = 'f'
        AND connamespace = current_schema()::regnamespace`);
    const names = new Set(rows.map((row) => row.name));
    assert.equal(names.has('timer_records_table_id_fkey'), false);
    assert.equal(names.has('timer_record_members_table_id_fkey'), false);
    for (const name of [
      'timer_records_store_id_fkey', 'timer_record_members_record_id_fkey',
      'active_timers_table_id_fkey', 'active_timer_members_table_id_fkey',
      'table_group_members_table_id_fkey',
    ]) assert.equal(names.has(name), true, name);
    assert.equal((await databasePool.query(
      'SELECT COUNT(*)::int AS count FROM schema_migrations WHERE version = 8',
    )).rows[0].count, 1);
  });

  await t.test('已有 v7 历史记录升级后内容完整，迁移可重复启动', async () => {
    const record = await finish('table_demo_12');
    // 在本测试独立 schema 内还原已发布 v7 的两处约束，再由新进程升级。
    await databasePool.query(`
      ALTER TABLE timer_records ADD CONSTRAINT timer_records_table_id_fkey
        FOREIGN KEY (table_id) REFERENCES restaurant_tables(id);
      ALTER TABLE timer_record_members ADD CONSTRAINT timer_record_members_table_id_fkey
        FOREIGN KEY (table_id) REFERENCES restaurant_tables(id);
      DELETE FROM schema_migrations WHERE version = 8`);
    const schemaUrl = new URL(config.databaseUrl);
    schemaUrl.searchParams.set('options', `-csearch_path=${config.databaseSchema}`);
    const script = `
      const { initializeDatabase, databasePool } = await import('./src/storage/database.js');
      try { await initializeDatabase(); } finally { await databasePool.end(); }
    `;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      await runNode(process.execPath, ['--input-type=module', '--eval', script], {
        cwd: fileURLToPath(new URL('..', import.meta.url)),
        env: {
          ...process.env, NODE_ENV: 'development', DATABASE_SSL: 'false',
          DATABASE_URL: schemaUrl.toString(), SEED_DEMO_DATA: 'false',
        },
      });
    }
    assert.deepEqual((await call(`/records/${record.id}`)).body.data.record, record);
    assert.equal((await databasePool.query(
      'SELECT COUNT(*)::int AS count FROM schema_migrations WHERE version = 8',
    )).rows[0].count, 1);
  });

  await t.test('单桌删除保留原名称、成员、干预、查询和 CSV，编号可复用', async () => {
    const id = 'table_demo_01';
    await call(`/tables/${id}`, { method: 'PATCH', body: { name: '保留历史名称' } });
    await start(id);
    now += 45 * 60_000;
    await timerService.processOverdueTimers({ storeId: 'store_demo', now });
    const [record] = await databaseStore.readWhere('records.json', { storeId: 'store_demo', where: { tableId: id } });
    const interventions = await databaseStore.readWhere('timerInterventionRecords.json', { storeId: 'store_demo' });
    assert.equal(record.tableNameSnapshot, '保留历史名称');
    assert.ok(interventions.some((entry) => entry.timerRecordId === record.id));
    await call(`/tables/${id}`, { method: 'PATCH', body: { name: '删除时名称' } });

    const forbidden = await call(`/tables/${id}/permanent`, { method: 'DELETE', token: staff });
    assert.equal(forbidden.status, 403);
    const before = await readLayout();
    const removed = await call(`/tables/${id}/permanent`, { method: 'DELETE' });
    assert.equal(removed.status, 200);
    const after = await readLayout();
    assert.equal(after.tables.some((table) => table.tableId === id), false);
    assert.equal(after.layoutVersion, before.layoutVersion + 1);
    assert.deepEqual((await call(`/records/${record.id}`)).body.data.record, record);
    assert.deepEqual(await databaseStore.readWhere('timerInterventionRecords.json', { storeId: 'store_demo' }), interventions);
    const filtered = await call(`/records?date=2026-10-14&tableId=${id}`);
    assert.deepEqual(filtered.body.data.records, [record]);
    const csv = await fetch(`${baseUrl}${prefix}/records/export?date=2026-10-14`, {
      headers: { authorization: `Bearer ${admin}` },
    });
    assert.equal(csv.status, 200);
    assert.match(await csv.text(), /保留历史名称/);
    const stats = await readRecordStats([{
      storeId: 'store_demo', timezone: 'Pacific/Auckland',
      startDate: '2026-10-14', endDate: '2026-10-14',
    }], new Set());
    assert.equal(stats.get('store_demo').byTable[id], 1);
    const replacement = await call('/tables', { method: 'POST', body: { name: '新的1号桌', number: 1 } });
    assert.equal(replacement.status, 201);
    assert.notEqual(replacement.body.data.table.id, id);
    replacementId = replacement.body.data.table.id;
    assert.deepEqual((await call(`/records/${record.id}`)).body.data.record, record);
  });

  await t.test('批量删除保持原子性，暂停计时和空闲拼桌都不能删除', async () => {
    const idle = 'table_demo_03';
    const active = 'table_demo_02';
    await start(active);
    const paused = await call(`/tables/${active}/timer/pause`, { method: 'POST' });
    assert.equal(paused.status, 200);
    const before = await readLayout();
    for (const response of [
      await call(`/tables/${active}/permanent`, { method: 'DELETE' }),
      await call('/tables/batch-delete', { method: 'POST', body: { tableIds: [idle, active] } }),
      await deleteInLayout(before, [active]),
    ]) {
      assert.equal(response.status, 409);
      assert.equal(response.body.error.code, 'TABLE_HAS_ACTIVE_TIMER');
    }
    assert.deepEqual(await readLayout(), before);
    await call(`/tables/${active}/timer/reset`, { method: 'POST' });

    const grouped = await call('/table-groups', {
      method: 'POST', body: { tableIds: [active, idle], name: '保留拼桌名称', type: 'temporary' },
    });
    assert.equal(grouped.status, 201);
    const group = grouped.body.data.group;
    const groupLayout = await readLayout();
    for (const response of [
      await call(`/tables/${idle}/permanent`, { method: 'DELETE' }),
      await call('/tables/batch-delete', { method: 'POST', body: { tableIds: [idle, 'table_demo_04'] } }),
      await deleteInLayout(groupLayout, [idle]),
    ]) {
      assert.equal(response.status, 409);
      assert.equal(response.body.error.code, 'TABLE_IN_GROUP');
    }
    const timer = await start(idle);
    assert.equal(timer.targetType, 'group');
    const blockedMember = await call(`/tables/${idle}/permanent`, { method: 'DELETE' });
    assert.equal(blockedMember.body.error.code, 'TABLE_HAS_ACTIVE_TIMER');
    now += 60_000;
    const reset = await call(`/tables/${idle}/timer/reset`, { method: 'POST' });
    const snapshot = reset.body.data.record;
    assert.equal(snapshot.tableNameSnapshot, group.name);
    const ungrouped = await call(`/table-groups/${group.id}`, { method: 'DELETE' });
    assert.equal(ungrouped.status, 200);
    const removed = await call('/tables/batch-delete', {
      method: 'POST', body: { tableIds: [active, idle] },
    });
    assert.equal(removed.status, 200);
    assert.equal(removed.body.data.count, 2);
    assert.deepEqual((await call(`/records/${snapshot.id}`)).body.data.record, snapshot);
    assert.deepEqual(snapshot.memberTableIds, [active, idle]);
    const stats = await readRecordStats([{
      storeId: 'store_demo', timezone: 'Pacific/Auckland',
      startDate: '2026-10-14', endDate: '2026-10-14',
    }], new Set());
    assert.equal(stats.get('store_demo').byTable[idle], 1);
    assert.equal(stats.get('store_demo').byTable[active], 2);
  });

  await t.test('布局删除中间历史桌台后顺序连续，重启仍能读取历史', async () => {
    const id = 'table_demo_05';
    const record = await finish(id);
    const before = await readLayout();
    const saved = await deleteInLayout(before, [id]);
    assert.equal(saved.status, 200);
    const after = await readLayout();
    assert.equal(after.tables.some((table) => table.tableId === id), false);
    assert.deepEqual(after.tables.filter((table) => table.enabled).map((table) => table.sortOrder),
      Array.from({ length: after.tables.filter((table) => table.enabled).length }, (_, index) => index + 1));
    const stale = await deleteInLayout(before, [id]);
    assert.equal(stale.body.error.code, 'LAYOUT_CONFLICT');
    await stopServer();
    server = await startServer();
    baseUrl = `http://127.0.0.1:${server.address().port}`;
    const restartedLayout = await readLayout();
    for (const deletedId of ['table_demo_01', 'table_demo_02', 'table_demo_03', id]) {
      assert.equal(restartedLayout.tables.some((table) => table.tableId === deletedId), false);
    }
    assert.equal(restartedLayout.tables.find((table) => table.number === 1).tableId, replacementId);
    assert.deepEqual((await call(`/records/${record.id}`)).body.data.record, record);
    const audits = await databaseStore.readWhere('auditLogs.json', { storeId: 'store_demo', limit: 1000 });
    assert.ok(audits.some((entry) => entry.action === 'table.permanent_delete'));
    assert.ok(audits.some((entry) => entry.action === 'table.batch_delete'));
    assert.ok(audits.some((entry) => entry.action === 'layout.save' && entry.dataAfter.deletedTableIds.includes(id)));
  });
});
