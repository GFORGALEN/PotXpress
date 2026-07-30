import { apiClient } from './client.js';

export async function getLayout(storeId, { signal } = {}) {
  const response = await apiClient.get(`/stores/${storeId}/layout`, { signal });
  return response.data.data;
}

export async function saveLayout(storeId, payload) {
  const response = await apiClient.put(`/stores/${storeId}/layout`, payload);
  return response.data.data;
}
