import assert from 'node:assert/strict';
import test from 'node:test';

process.env.NODE_ENV = 'test';
process.env.PORT = '0';
process.env.SEED_DEMO_DATA = 'true';
process.env.JWT_SECRET = 'data-api-test-secret-only';

const { summarizeStore } = await import('../src/services/data.service.js');
const store = { id: 's1', name: '测试门店', timezone: 'Asia/Shanghai' };
const tables = ['a', 'b'].map((id) => ({ id, name: id, enabled: true }));
const now = Date.parse('2026-09-16T04:00:00Z');
const timer = { id: 't1', storeId: 's1', memberTableIds: ['a', 'b'], tableNameSnapshot: '拼桌', startTime: '2026-09-16T02:00:00Z', plannedDurationSeconds: 3600, totalPausedSeconds: 0, status: 'running' };

test('拼桌按一次接待、两张占用桌统计，实时值不受历史筛选影响', () => {
  const result = summarizeStore(store, tables, [timer], [], 'today', now);
  assert.equal(result.sessions, 1);
  assert.equal(result.occupied, 2);
  assert.equal(result.overtime, 2);
  assert.equal(result.utilization, 1);
  assert.equal(result.averageMinutes, null);
  assert.equal(result.hours[10].count, 1);
  const past = summarizeStore(store, tables, [timer], [], 'yesterday', now);
  assert.equal(past.sessions, 0);
  assert.equal(past.occupied, 2);
});

test('按门店当地日期归属、计时去重、已结束记录统计时长及超时', () => {
  const record = { ...timer, timerId: 't1', startTime: '2026-09-15T16:30:00Z', actualDurationSeconds: 5400, actualEndTime: '2026-09-15T18:00:00Z', effectiveEndTimeAtReset: '2026-09-15T17:30:00Z', resetBy: 'system_automation' };
  const result = summarizeStore(store, tables, [timer], [record], '7d', now);
  assert.equal(result.sessions, 1);
  assert.equal(result.completed, 1);
  assert.equal(result.manuallyCompleted, 0);
  assert.equal(result.automaticallyCompleted, 1);
  assert.equal(result.automaticResetRate, 1);
  assert.equal(result.averageMinutes, 90);
  assert.equal(result.overtimeRate, 1);
  assert.equal(result.trend.length, 7);
  assert.equal(result.trend.at(-1).count, 1);
  assert.equal(result.hours[0].count, 1);
  assert.equal(result.tables[0].sessions, 1);
  assert.equal(result.recent[0].automaticallyCompleted, true);
  assert.equal(summarizeStore(store, [], [], [], '30d', now).utilization, null);
});

test('暂停不标为当前超时，停用桌不计入可用桌数', () => {
  const result = summarizeStore(store, [tables[0], { ...tables[1], enabled: false }], [{ ...timer, status: 'paused', pauseStartedAt: '2026-09-16T02:30:00Z' }], [], 'today', now);
  assert.equal(result.tableCount, 1);
  assert.equal(result.occupied, 1);
  assert.equal(result.overtime, 0);
});

test('指定历史日期使用门店当地日界线，排除相邻日期并保留实时状态', () => {
  const record = { ...timer, timerId: 'old', startTime: '2026-08-31T16:30:00Z', actualDurationSeconds: 3600, actualEndTime: '2026-08-31T17:30:00Z', effectiveEndTimeAtReset: '2026-08-31T17:30:00Z' };
  const result = summarizeStore(store, tables, [timer], [record], 'date', now, '2026-09-01');
  assert.equal(result.startDate, '2026-09-01');
  assert.equal(result.endDate, '2026-09-01');
  assert.equal(result.sessions, 1);
  assert.equal(result.averageMinutes, 60);
  assert.equal(result.occupied, 2);
  assert.equal(result.hours[0].count, 1);
  assert.deepEqual(result.trend, [{ date: '2026-09-01', count: 1 }]);
  assert.equal(summarizeStore(store, tables, [], [record], 'date', now, '2026-08-31').sessions, 0);
});

test('数据 API 拒绝未登录和普通管理员，系统管理员可查询并校验周期', async (t) => {
  const { startServer, stopServer } = await import('../server.js');
  const server = await startServer();
  t.after(stopServer);
  const url = `http://127.0.0.1:${server.address().port}`;
  assert.equal((await fetch(`${url}/api/data`)).status, 401);
  for (const [username, password, expected] of [['demo_admin', 'admin123', 403], ['demo_staff', 'staff123', 403], ['admin', 'admin123', 200]]) {
    const login = await fetch(`${url}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username, password }) });
    const { data } = await login.json();
    const headers = { Authorization: `Bearer ${data.token}` };
    const response = await fetch(`${url}/api/data`, { headers });
    assert.equal(response.status, expected);
    if (expected === 200) {
      const body = await response.json();
      assert.equal(body.data.period, 'today');
      assert.equal(body.data.stores.length, 1);
      assert.equal(response.headers.get('cache-control'), 'no-store');
      assert.equal((await fetch(`${url}/api/data?period=invalid`, { headers })).status, 400);
      assert.equal((await fetch(`${url}/api/data?period=30d`, { headers })).status, 200);
      for (const query of ['period=date', 'period=date&date=2026-02-30', 'period=date&date=abc', 'period=today&date=2026-09-01']) {
        assert.equal((await fetch(`${url}/api/data?${query}`, { headers })).status, 400);
      }
      const dated = await fetch(`${url}/api/data?period=date&date=2026-09-01`, { headers });
      assert.equal(dated.status, 200);
      const datedBody = await dated.json();
      assert.equal(datedBody.data.stores[0].startDate, '2026-09-01');
    }
  }
});

test('SQL 聚合与内存统计口径一致（时区日界线、拼桌成员、自动清台、超时、最近 20 条）', async (t) => {
  const { startServer, stopServer } = await import('../server.js');
  const { databaseStore } = await import('../src/storage/databaseStore.js');
  const { aggregateRecords, readRecordStats } = await import('../src/services/data.service.js');
  await startServer();
  t.after(stopServer);

  const demo = await databaseStore.readById('stores.json', 'store_demo');
  const [first, second] = (await databaseStore.readWhere('tables.json', { storeId: 'store_demo' }))
    .map((table) => table.id);
  // Pacific/Auckland：2026-04-05 凌晨夏令时结束，覆盖本地午夜两侧与回拨时段。
  const base = Date.parse('2026-04-03T10:30:00Z');
  const records = Array.from({ length: 45 }, (_, index) => {
    const start = base + index * 97 * 60 * 1000;
    const grouped = index % 7 === 0;
    return {
      id: `record_agg_${String(index).padStart(2, '0')}`,
      timerId: `timer_agg_${index}`,
      storeId: 'store_demo',
      tableId: first,
      targetType: grouped ? 'group' : 'table',
      groupId: null,
      memberTableIds: grouped ? [first, second] : [index % 2 ? second : first],
      tableNameSnapshot: `桌 ${index}`,
      tableNumberSnapshot: 1,
      startTime: new Date(start).toISOString(),
      plannedEndTime: new Date(start + 3600_000).toISOString(),
      effectiveEndTimeAtReset: new Date(start + 3600_000).toISOString(),
      actualEndTime: new Date(start + (index % 3 === 0 ? 4000_000 : 3000_000)).toISOString(),
      plannedDurationSeconds: 3600,
      actualDurationSeconds: index % 3 === 0 ? 4000 : 3000,
      totalPausedSeconds: 0,
      adjustments: [],
      startedBy: 'user_admin',
      startedByNameSnapshot: 'admin',
      resetBy: index % 5 === 0 ? 'system_automation' : 'user_admin',
      resetByNameSnapshot: 'admin',
      finalStatus: 'reset',
      createdAt: new Date(start).toISOString(),
    };
  });
  await databaseStore.withFiles(['records.json'], (drafts) => {
    drafts['records.json'].push(...records);
  }, { writeOrder: ['records.json'], skipRead: ['records.json'], lockScope: { storeId: 'store_demo' } });

  const activeTimerIds = new Set(['timer_agg_3', 'timer_not_recorded']);
  for (const window of [
    { startDate: '2026-04-04', endDate: '2026-04-04', days: 1 },
    { startDate: '2026-04-05', endDate: '2026-04-05', days: 1 },
    { startDate: '2026-04-01', endDate: '2026-04-07', days: 7 },
  ]) {
    const fromSql = (await readRecordStats(
      [{ storeId: 'store_demo', timezone: demo.timezone, ...window }],
      activeTimerIds,
    )).get('store_demo');
    const inMemory = aggregateRecords(records, demo, window, activeTimerIds);
    assert.deepEqual(
      { ...fromSql, byHour: { ...fromSql.byHour } },
      { ...inMemory, byHour: Object.fromEntries(Object.entries(inMemory.byHour).map(([k, v]) => [String(k), v])) },
      `窗口 ${window.startDate}–${window.endDate} 的 SQL 聚合与内存统计不一致`,
    );
    assert.ok(fromSql.sessions > 0);
  }
});
