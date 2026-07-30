export const TIMER_STATUS_LABELS = Object.freeze({
  idle: '空闲',
  running: '计时中',
  paused: '已暂停',
  warning: '即将超时',
  overtime: '已超时',
});

export function deriveTimerDisplay(timer, correctedNow) {
  if (!timer) {
    return {
      status: 'idle',
      remainingSeconds: 0,
      overtimeSeconds: 0,
    };
  }

  if (timer.status === 'paused') {
    return {
      status: 'paused',
      remainingSeconds: Math.max(0, timer.remainingSeconds),
      overtimeSeconds: 0,
    };
  }

  const rawRemainingSeconds = (
    Date.parse(timer.effectiveEndTime) - correctedNow
  ) / 1000;
  const remainingSeconds = Math.max(0, Math.ceil(rawRemainingSeconds));
  const overtimeSeconds = Math.max(0, Math.floor(-rawRemainingSeconds));
  let status = timer.status;

  if (rawRemainingSeconds <= 0) {
    status = 'overtime';
  } else if (status === 'overtime') {
    status = 'running';
  }

  return {
    status,
    remainingSeconds,
    overtimeSeconds,
  };
}

export function formatTimerDuration(seconds, { overtime = false } = {}) {
  const safeSeconds = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(safeSeconds / 60);
  const remainder = safeSeconds % 60;
  const value = `${String(minutes).padStart(2, '0')}:${String(remainder).padStart(2, '0')}`;
  return overtime ? `+${value}` : value;
}

export function formatStoreTime(value, timezone) {
  if (!value) {
    return '—';
  }

  try {
    return new Intl.DateTimeFormat('zh-CN', {
      timeZone: timezone,
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).format(new Date(value));
  } catch (error) {
    return '—';
  }
}

export function calculateClockOffset({
  serverTime,
  sentAt,
  receivedAt,
  maximumRoundTripTime = 5000,
}) {
  const serverMilliseconds = Date.parse(serverTime);
  const roundTripTime = receivedAt - sentAt;

  if (
    !Number.isFinite(serverMilliseconds)
    || roundTripTime < 0
    || roundTripTime > maximumRoundTripTime
  ) {
    return null;
  }

  return serverMilliseconds - (sentAt + receivedAt) / 2;
}
