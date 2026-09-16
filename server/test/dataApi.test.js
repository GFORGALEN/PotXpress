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
