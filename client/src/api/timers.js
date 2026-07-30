import { apiClient } from './client.js';

export async function listTimers(storeId, { signal } = {}) {
  const sentAt = Date.now();
  const response = await apiClient.get(`/stores/${storeId}/timers`, { signal });
  const receivedAt = Date.now();

  return {
    ...response.data.data,
    sentAt,
    receivedAt,
    roundTripTime: receivedAt - sentAt,
  };
}

async function timerAction(storeId, tableId, action, body) {
  const response = await apiClient.post(
    `/stores/${storeId}/tables/${tableId}/timer/${action}`,
    body,
  );
  return response.data.data;
}

export function startTimer(storeId, tableId, durationMinutes) {
  return timerAction(storeId, tableId, 'start', { durationMinutes });
}

export function pauseTimer(storeId, tableId) {
  return timerAction(storeId, tableId, 'pause');
}

export function resumeTimer(storeId, tableId) {
  return timerAction(storeId, tableId, 'resume');
}

export function adjustTimer(storeId, tableId, deltaSeconds, reason) {
  return timerAction(storeId, tableId, 'adjust', {
    deltaSeconds,
    ...(reason ? { reason } : {}),
  });
}

export function resetTimer(storeId, tableId) {
  return timerAction(storeId, tableId, 'reset');
}

export function acknowledgeTimerAlert(storeId, tableId) {
  return timerAction(storeId, tableId, 'acknowledge-alert');
}
