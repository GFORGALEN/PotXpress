import assert from 'node:assert/strict';
import test from 'node:test';
import { closeCodeForRealtimeError } from '../src/realtime/realtimeHub.js';
import { AppError } from '../src/utils/appError.js';

test('实时连接只把真实的鉴权失败标记为 4401', () => {
  assert.equal(
    closeCodeForRealtimeError(
      new AppError(401, 'TOKEN_EXPIRED', '登录已过期'),
    ),
    4401,
  );
  assert.equal(
    closeCodeForRealtimeError(
      new AppError(403, 'STORE_FORBIDDEN', '无权访问门店'),
    ),
    4403,
  );
  assert.equal(
    closeCodeForRealtimeError(new Error('database connection timeout')),
    1011,
  );
});
