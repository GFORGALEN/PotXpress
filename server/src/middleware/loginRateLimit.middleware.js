import { createHash } from 'node:crypto';
import { databasePool } from '../storage/database.js';
import { fail } from '../utils/response.js';
import { normalizeUsername } from '../utils/normalization.js';

const WINDOW_SECONDS = 15 * 60;
const MAX_FAILURES = 5;

// 失败计数存放在 PostgreSQL，多个服务实例共享同一限额。键只保存
// "IP + 用户名" 的摘要，不落地原始 IP 和用户名。
function attemptKey(req) {
  const username = normalizeUsername(String(req.body?.username ?? ''));
  return createHash('sha256').update(`${req.ip}|${username}`).digest('hex');
}

async function recordFailure(key) {
  await databasePool.query(
    `INSERT INTO login_attempts (attempt_key, failures, window_started_at)
     VALUES ($1, 1, NOW())
     ON CONFLICT (attempt_key) DO UPDATE SET
       failures = CASE
         WHEN login_attempts.window_started_at <= NOW() - make_interval(secs => $2)
           THEN 1
         ELSE login_attempts.failures + 1
       END,
       window_started_at = CASE
         WHEN login_attempts.window_started_at <= NOW() - make_interval(secs => $2)
           THEN NOW()
         ELSE login_attempts.window_started_at
       END`,
    [key, WINDOW_SECONDS],
  );
  // 顺带清理过期窗口，表的规模始终受最近 15 分钟的失败次数约束。
  await databasePool.query(
    'DELETE FROM login_attempts WHERE window_started_at <= NOW() - make_interval(secs => $1)',
    [WINDOW_SECONDS],
  );
}

export async function loginRateLimit(req, res, next) {
  const key = attemptKey(req);
  let retryAfterSeconds = 0;

  try {
    const { rows } = await databasePool.query(
      `SELECT failures,
              CEIL(EXTRACT(EPOCH FROM (
                window_started_at + make_interval(secs => $2) - NOW()
              )))::int AS remaining_seconds
       FROM login_attempts WHERE attempt_key = $1`,
      [key, WINDOW_SECONDS],
    );
    const entry = rows[0];
    if (entry && entry.remaining_seconds > 0 && entry.failures >= MAX_FAILURES) {
      retryAfterSeconds = entry.remaining_seconds;
    }
  } catch (error) {
    // 限流存储不可用时不阻断登录本身（登录仍需要正确密码）。
    console.error(`登录限流检查失败：${error.message}`);
  }

  if (retryAfterSeconds > 0) {
    res.setHeader('Retry-After', String(retryAfterSeconds));
    return fail(
      res,
      429,
      'RATE_LIMITED',
      '登录尝试次数过多，请稍后再试',
      { retryAfterSeconds },
    );
  }

  // 在响应发出之前完成计数更新：否则客户端收到 401 后立即重试，可能在
  // 计数写入前到达，从而绕过限额。
  const sendJson = res.json.bind(res);
  res.json = (body) => {
    const update = res.statusCode >= 200 && res.statusCode < 300
      ? databasePool.query('DELETE FROM login_attempts WHERE attempt_key = $1', [key])
      : res.statusCode === 401
        ? recordFailure(key)
        : null;
    if (!update) return sendJson(body);

    update
      .catch((error) => {
        console.error(`登录限流记录失败：${error.message}`);
      })
      .finally(() => sendJson(body));
    return res;
  };

  return next();
}

export async function resetLoginRateLimitForTests() {
  await databasePool.query('DELETE FROM login_attempts');
}
