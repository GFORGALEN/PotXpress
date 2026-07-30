export const REALTIME_PROTOCOL = 'potxpress.v1';

export function buildWebSocketUrl(location = window.location) {
  const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${protocol}//${location.host}/ws`;
}

export function calculateReconnectDelay(attempt, random = Math.random) {
  const exponential = Math.min(30000, 500 * (2 ** Math.max(0, attempt)));
  const jitter = Math.round(exponential * 0.25 * random());
  return exponential + jitter;
}

export function classifyEventVersion(highestSeenVersion, eventVersion) {
  if (!Number.isSafeInteger(eventVersion) || eventVersion < 1) {
    return 'invalid';
  }
  if (eventVersion <= highestSeenVersion) {
    return 'duplicate';
  }
  if (eventVersion > highestSeenVersion + 1) {
    return 'gap';
  }
  return 'next';
}

export function isRealtimeEnvelopeForStore(message, storeId) {
  return (
    message
    && typeof message === 'object'
    && message.type === 'event'
    && message.event?.storeId === storeId
  );
}
