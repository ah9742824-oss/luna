import { api } from './api';

export async function login(email, password) {
  const data = await api.post('/auth/login', { email, password });
  localStorage.setItem('luna_admin_token', data.token);
  localStorage.setItem('luna_admin_user', JSON.stringify(data.user));
  return data;
}

export function logout() {
  localStorage.removeItem('luna_admin_token');
  localStorage.removeItem('luna_admin_user');
}

export function getStoredUser() {
  const raw = localStorage.getItem('luna_admin_user');
  return raw ? JSON.parse(raw) : null;
}

export function isLoggedIn() {
  return !!localStorage.getItem('luna_admin_token');
}

// requestPasswordReset/resetPassword: the backend always returns
// { requested: true } here regardless of whether the email exists
// (section 12/80 — anti-enumeration), same as the customer-facing version.
export const requestPasswordReset = (email) => api.post('/auth/forgot-password', { email });
export const resetPassword = (token, password) => api.post('/auth/reset-password', { token, password });
