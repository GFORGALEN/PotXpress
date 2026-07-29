import { fail } from '../utils/response.js';
import { normalizeUsername } from '../utils/normalization.js';

const WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILURES = 5;
const MAX_ENTRIES = 10_000;
const attempts = new Map();

function pruneTimestamps(timestamps, now) {
  return timestamps.filter((timestamp) => now - timestamp < WINDOW_MS);
}

function evictExpired(now) {
  for (const [key, entry] of attempts) {
    entry.timestamps = pruneTimestamps(entry.timestamps, now);

    if (entry.timestamps.length === 0) {
      attempts.delete(key);
    }
  }

  while (attempts.size >= MAX_ENTRIES) {
    const oldestKey = attempts.keys().next().value;
    attempts.delete(oldestKey);
  }
}

export function loginRateLimit(req, res, next) {
  const now = Date.now();
  evictExpired(now);

  const username = normalizeUsername(String(req.body?.username ?? ''));
  const key = `${req.ip}|${username}`;
  const entry = attempts.get(key) ?? { timestamps: [] };
  entry.timestamps = pruneTimestamps(entry.timestamps, now);

  if (entry.timestamps.length >= MAX_FAILURES) {
    const retryAfterSeconds = Math.max(
      1,
      Math.ceil((WINDOW_MS - (now - entry.timestamps[0])) / 1000),
    );
    res.setHeader('Retry-After', String(retryAfterSeconds));
    return fail(
      res,
      429,
      'RATE_LIMITED',
      '登录尝试次数过多，请稍后再试',
      { retryAfterSeconds },
    );
  }

  attempts.set(key, entry);

  res.once('finish', () => {
    if (res.statusCode >= 200 && res.statusCode < 300) {
      attempts.delete(key);
      return;
    }

    if (res.statusCode === 401) {
      entry.timestamps.push(Date.now());
      attempts.delete(key);
      attempts.set(key, entry);
    }
  });

  return next();
}

export function resetLoginRateLimitForTests() {
  attempts.clear();
}
