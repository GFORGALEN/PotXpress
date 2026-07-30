import { apiClient } from './client.js';

export async function login(username, password) {
  const response = await apiClient.post('/auth/login', {
    username,
    password,
  });
  return response.data.data;
}

export async function me() {
  const response = await apiClient.get('/auth/me');
  return response.data.data;
}

export async function logout() {
  const response = await apiClient.post('/auth/logout');
  return response.data.data;
}

export async function changePassword(currentPassword, newPassword) {
  const response = await apiClient.patch('/auth/password', {
    currentPassword,
    newPassword,
  });
  return response.data.data;
}
