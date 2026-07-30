import type {
  ActiveTimer,
  TimerStatus,
} from '@potxpress/contracts';

export type TimeInput = Date | number | string;

export interface RawRemainingTime {
  rawRemainingSeconds: number;
  effectiveEndMilliseconds: number;
}

export interface ComputedTimerState {
  status: TimerStatus;
  remainingSeconds: number;
  overtimeSeconds: number;
  effectiveEndTime: string;
}

type TimerClockFields = Pick<
  ActiveTimer,
  | 'startTime'
  | 'plannedDurationSeconds'
  | 'status'
  | 'pauseStartedAt'
  | 'totalPausedSeconds'
>;

function toMilliseconds(value: TimeInput): number {
  if (value instanceof Date) {
    return value.getTime();
  }

  if (typeof value === 'number') {
    return value;
  }

  return Date.parse(value);
}

export function computeRawRemainingSeconds(
  timer: TimerClockFields,
  now: TimeInput,
): RawRemainingTime {
  const nowMilliseconds = toMilliseconds(now);
  const startMilliseconds = Date.parse(timer.startTime);
  const currentPauseSeconds = timer.status === 'paused'
    ? Math.max(
      0,
      (nowMilliseconds - Date.parse(timer.pauseStartedAt ?? '')) / 1000,
    )
    : 0;
  const accumulatedPauseSeconds = (
    timer.totalPausedSeconds + currentPauseSeconds
  );
  const effectiveEndMilliseconds = startMilliseconds + (
    timer.plannedDurationSeconds + accumulatedPauseSeconds
  ) * 1000;

  return {
    rawRemainingSeconds: (
      effectiveEndMilliseconds - nowMilliseconds
    ) / 1000,
    effectiveEndMilliseconds,
  };
}

export function computeTimerState(
  timer: TimerClockFields,
  now: TimeInput,
  warningThresholdMinutes: number,
): ComputedTimerState {
  const {
    rawRemainingSeconds,
    effectiveEndMilliseconds,
  } = computeRawRemainingSeconds(timer, now);
  let status: TimerStatus;

  if (timer.status === 'paused') {
    status = 'paused';
  } else if (rawRemainingSeconds <= 0) {
    status = 'overtime';
  } else if (rawRemainingSeconds <= warningThresholdMinutes * 60) {
    status = 'warning';
  } else {
    status = 'running';
  }

  return {
    status,
    remainingSeconds: Math.max(0, Math.ceil(rawRemainingSeconds)),
    overtimeSeconds: Math.max(0, Math.floor(-rawRemainingSeconds)),
    effectiveEndTime: new Date(effectiveEndMilliseconds).toISOString(),
  };
}

export function getTableStatus(
  timer: TimerClockFields | null | undefined,
  now: TimeInput,
  warningThresholdMinutes: number,
): TimerStatus | 'idle' {
  if (!timer) {
    return 'idle';
  }

  return computeTimerState(timer, now, warningThresholdMinutes).status;
}
