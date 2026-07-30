import { apiClient } from './client.js';

export async function listStores({ signal } = {}) {
  const response = await apiClient.get('/stores', { signal });
  return response.data.data.stores;
}

export async function getStore(storeId, { signal } = {}) {
  const response = await apiClient.get(`/stores/${storeId}`, { signal });
  return response.data.data.store;
}

export async function createStore(payload) {
  const response = await apiClient.post('/stores', payload);
  return response.data.data.store;
}

export async function updateStore(storeId, payload) {
  const response = await apiClient.patch(`/stores/${storeId}`, payload);
  return response.data.data.store;
}
