const WARNING_AFTER_MS = 90_000;
const STALE_AFTER_MS = 120_000;
const KEEPALIVE_INTERVAL_MS = 25_000;

export function deriveServerContactHealth(lastContactAt, now = Date.now()) {
  if (!Number.isFinite(lastContactAt) || !Number.isFinite(now)) {
    return {
      level: 'healthy',
      silenceSeconds: 0,
      staleInSeconds: null,
      nextKeepaliveInSeconds: 25,
    };
  }

  const silenceMs = Math.max(0, now - lastContactAt);
  const silenceSeconds = Math.floor(silenceMs / 1000);
  const nextKeepaliveInSeconds = Math.ceil(Math.max(
    0,
    KEEPALIVE_INTERVAL_MS - silenceMs,
  ) / 1000);

  if (silenceMs < WARNING_AFTER_MS) {
    return {
      level: 'healthy',
      silenceSeconds,
      staleInSeconds: null,
      nextKeepaliveInSeconds,
    };
  }
  if (silenceMs < STALE_AFTER_MS) {
    return {
      level: 'warning',
      silenceSeconds,
      staleInSeconds: Math.ceil((STALE_AFTER_MS - silenceMs) / 1000),
      nextKeepaliveInSeconds: 0,
    };
  }
  return {
    level: 'stale',
    silenceSeconds,
    staleInSeconds: 0,
    nextKeepaliveInSeconds: 0,
  };
}
