import { apiClient } from './client.js';

export async function getSettings(storeId, { signal } = {}) {
  const response = await apiClient.get(`/stores/${storeId}/settings`, {
    signal,
  });
  return response.data.data.settings;
}

export async function updateSettings(storeId, payload) {
  const response = await apiClient.patch(
    `/stores/${storeId}/settings`,
    payload,
  );
  return response.data.data.settings;
}
