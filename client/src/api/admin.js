import { apiClient, sendIdempotentRequest } from './client.js';

export async function listTables(storeId) {
  const response = await apiClient.get(`/stores/${storeId}/tables`);
  return response.data.data.tables;
}

export async function createTable(storeId, payload) {
  const response = await apiClient.post(`/stores/${storeId}/tables`, payload);
  return response.data.data.table;
}

export async function createTableBatch(storeId, payload) {
  const response = await apiClient.post(`/stores/${storeId}/tables/batch`, payload);
  return response.data.data.tables;
}

export async function updateTable(storeId, tableId, payload) {
  const response = await apiClient.patch(`/stores/${storeId}/tables/${tableId}`, payload);
  return response.data.data.table;
}

export async function disableTable(storeId, tableId) {
  const response = await apiClient.delete(`/stores/${storeId}/tables/${tableId}`);
  return response.data.data.table;
}

export async function deleteTablePermanent(storeId, tableId) {
  const response = await apiClient.delete(
    `/stores/${storeId}/tables/${tableId}/permanent`,
  );
  return response.data.data.table;
}

export async function deleteTablesBatch(storeId, tableIds) {
  const response = await apiClient.post(
    `/stores/${storeId}/tables/batch-delete`,
    { tableIds },
  );
  return response.data.data;
}

export async function listTableGroups(storeId) {
  const response = await apiClient.get(`/stores/${storeId}/table-groups`);
  return response.data.data.groups;
}

export async function createTableGroup(storeId, payload) {
  const response = await sendIdempotentRequest({
    method: 'post',
    url: `/stores/${storeId}/table-groups`,
    data: payload,
  });
  return response.data.data.group;
}

export async function deleteTableGroup(storeId, groupId) {
  const response = await sendIdempotentRequest({
    method: 'delete',
    url: `/stores/${storeId}/table-groups/${groupId}`,
  });
  return response.data.data.group;
}

export async function listUsers() {
  const response = await apiClient.get('/users');
  return response.data.data.users;
}

export async function createUser(payload) {
  const response = await apiClient.post('/users', payload);
  return response.data.data.user;
}

export async function updateUser(userId, payload) {
  const response = await apiClient.patch(`/users/${userId}`, payload);
  return response.data.data.user;
}

export async function listRecords(storeId, query) {
  const response = await apiClient.get(`/stores/${storeId}/records`, { params: query });
  return response.data.data;
}

export async function deleteRecord(storeId, recordId) {
  const response = await apiClient.delete(
    `/stores/${storeId}/records/${recordId}`,
  );
  return response.data.data.record;
}

export async function deleteRecords(storeId, ids) {
  const response = await apiClient.post(
    `/stores/${storeId}/records/batch-delete`,
    { ids },
  );
  return response.data.data;
}

export async function exportRecords(storeId, date) {
  const response = await apiClient.get(`/stores/${storeId}/records/export`, {
    params: { date },
    responseType: 'blob',
  });
  const url = URL.createObjectURL(response.data);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `records-${date}.csv`;
  anchor.click();
  URL.revokeObjectURL(url);
}

export async function listAuditLogs(storeId, query) {
  const response = await apiClient.get(`/stores/${storeId}/audit-logs`, {
    params: query,
  });
  return response.data.data.logs;
}

export async function deleteAuditLog(storeId, logId) {
  const response = await apiClient.delete(
    `/stores/${storeId}/audit-logs/${logId}`,
  );
  return response.data.data.log;
}

export async function deleteAuditLogs(storeId, ids) {
  const response = await apiClient.post(
    `/stores/${storeId}/audit-logs/batch-delete`,
    { ids },
  );
  return response.data.data;
}
