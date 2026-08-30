const WARNING_AFTER_MS = 90_000;
const STALE_AFTER_MS = 120_000;

export function deriveServerContactHealth(lastContactAt, now = Date.now()) {
  if (!Number.isFinite(lastContactAt) || !Number.isFinite(now)) {
    return {
      level: 'healthy',
      silenceSeconds: 0,
      staleInSeconds: null,
    };
  }

  const silenceMs = Math.max(0, now - lastContactAt);
  const silenceSeconds = Math.floor(silenceMs / 1000);

  if (silenceMs < WARNING_AFTER_MS) {
    return { level: 'healthy', silenceSeconds, staleInSeconds: null };
  }
  if (silenceMs < STALE_AFTER_MS) {
    return {
      level: 'warning',
      silenceSeconds,
      staleInSeconds: Math.ceil((STALE_AFTER_MS - silenceMs) / 1000),
    };
  }
  return { level: 'stale', silenceSeconds, staleInSeconds: 0 };
}
