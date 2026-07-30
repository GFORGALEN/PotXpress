import { apiClient } from './client.js';

export async function getLayout(storeId, { signal } = {}) {
  const response = await apiClient.get(`/stores/${storeId}/layout`, { signal });
  return response.data.data;
}
