import { apiClient } from './client.js';

export async function listStores({ signal } = {}) {
  const response = await apiClient.get('/stores', { signal });
  return response.data.data.stores;
}

export async function getStore(storeId, { signal } = {}) {
  const response = await apiClient.get(`/stores/${storeId}`, { signal });
  return response.data.data.store;
}
