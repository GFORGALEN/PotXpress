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
