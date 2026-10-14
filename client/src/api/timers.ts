import {
  timerActionResultSchema,
  timerBatchResetResultSchema,
  timerBulkResetResultSchema,
  timerListSnapshotSchema,
  timerResetResultSchema,
  type TimerActionResult,
  type TimerBatchResetResult,
  type TimerBulkResetResult,
  type TimerListSnapshot,
  type TimerResetResult,
} from '@potxpress/contracts';
import {
  getApiData,
  sendIdempotentApiData,
} from './typedClient.js';

export interface TimerListOptions {
  signal?: AbortSignal;
}

export type TimedTimerSnapshot = TimerListSnapshot & {
  sentAt: number;
  receivedAt: number;
  roundTripTime: number;
};

type TimerAction =
  | 'start'
  | 'pause'
  | 'resume'
  | 'adjust'
  | 'transfer'
  | 'acknowledge-alert';

export async function listTimers(
  storeId: string,
  { signal }: TimerListOptions = {},
): Promise<TimedTimerSnapshot> {
  const sentAt = Date.now();
  const snapshot = await getApiData(
    `/stores/${storeId}/timers`,
    timerListSnapshotSchema,
    signal ? { signal } : undefined,
  );
  const receivedAt = Date.now();

  return {
    ...snapshot,
    sentAt,
    receivedAt,
    roundTripTime: receivedAt - sentAt,
  };
}

async function timerAction(
  storeId: string,
  tableId: string,
  action: TimerAction,
  body?: unknown,
): Promise<TimerActionResult> {
  return sendIdempotentApiData(
    {
      method: 'post',
      url: `/stores/${storeId}/tables/${tableId}/timer/${action}`,
      data: body,
    },
    timerActionResultSchema,
  );
}

export function startTimer(
  storeId: string,
  tableId: string,
  durationMinutes: number,
): Promise<TimerActionResult> {
  return timerAction(storeId, tableId, 'start', { durationMinutes });
}

export function pauseTimer(
  storeId: string,
  tableId: string,
): Promise<TimerActionResult> {
  return timerAction(storeId, tableId, 'pause');
}

export function resumeTimer(
  storeId: string,
  tableId: string,
): Promise<TimerActionResult> {
  return timerAction(storeId, tableId, 'resume');
}

export function adjustTimer(
  storeId: string,
  tableId: string,
  deltaSeconds: number,
  reason?: string,
): Promise<TimerActionResult> {
  return timerAction(storeId, tableId, 'adjust', {
    deltaSeconds,
    ...(reason ? { reason } : {}),
  });
}

export function transferTimer(
  storeId: string,
  tableId: string,
  targetTableId: string,
): Promise<TimerActionResult> {
  return timerAction(storeId, tableId, 'transfer', { targetTableId });
}

export async function resetTimer(
  storeId: string,
  tableId: string,
): Promise<TimerResetResult> {
  return sendIdempotentApiData(
    {
      method: 'post',
      url: `/stores/${storeId}/tables/${tableId}/timer/reset`,
    },
    timerResetResultSchema,
  );
}

export async function resetAllTimers(
  storeId: string,
): Promise<TimerBulkResetResult> {
  return sendIdempotentApiData(
    {
      method: 'post',
      url: `/stores/${storeId}/timers/reset-all`,
    },
    timerBulkResetResultSchema,
  );
}

/**
 * 按计时 ID 批量清台已到时的计时。名单使用 timerId，避免结束确认期间
 * 被别人清台后重新开台的新计时；网络重试沿用同一个幂等键。
 */
export async function resetOverdueTimers(
  storeId: string,
  timerIds: string[],
): Promise<TimerBatchResetResult> {
  return sendIdempotentApiData(
    {
      method: 'post',
      url: `/stores/${storeId}/timers/reset-batch`,
      data: { timerIds, onlyOverdue: true },
    },
    timerBatchResetResultSchema,
  );
}

export function acknowledgeTimerAlert(
  storeId: string,
  tableId: string,
): Promise<TimerActionResult> {
  return timerAction(storeId, tableId, 'acknowledge-alert');
}
