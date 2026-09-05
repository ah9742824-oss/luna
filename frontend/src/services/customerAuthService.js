// Customer authentication — deliberately separate storage keys AND a
// separate backend JWT type from the admin auth in services/authService.js
// (backend/src/middleware/customerAuth.js rejects an admin token here, and
// vice versa). A customer and an admin can be logged in in the same browser
// at once without conflict.
import { api } from './api';

const TOKEN_KEY = 'luna_customer_token';
const USER_KEY = 'luna_customer_user';

export async function register(payload) {
  const data = await api.post('/customers/register', payload, { auth: 'none' });
  localStorage.setItem(TOKEN_KEY, data.token);
  localStorage.setItem(USER_KEY, JSON.stringify(data.customer));
  return data;
}

export async function login(payload) {
  const data = await api.post('/customers/login', payload, { auth: 'none' });
  localStorage.setItem(TOKEN_KEY, data.token);
  localStorage.setItem(USER_KEY, JSON.stringify(data.customer));
  return data;
}

export function logout() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}

export function getStoredCustomer() {
  const raw = localStorage.getItem(USER_KEY);
  return raw ? JSON.parse(raw) : null;
}

export function isCustomerLoggedIn() {
  return !!localStorage.getItem(TOKEN_KEY);
}

export async function fetchMe() {
  const data = await api.get('/customers/me', { auth: 'customer' });
  localStorage.setItem(USER_KEY, JSON.stringify(data));
  return data;
}

export async function updateProfile(payload) {
  const data = await api.put('/customers/me', payload, { auth: 'customer' });
  localStorage.setItem(USER_KEY, JSON.stringify(data));
  return data;
}

// requestPasswordReset/resetPassword: the backend ALWAYS returns
// { requested: true } here regardless of whether the email exists
// (section 12/80 — anti-enumeration) — this function has nothing more
// specific to report either way, by design.
export const requestPasswordReset = (email) => api.post('/customers/forgot-password', { email }, { auth: 'none' });
export const resetPassword = (token, password) => api.post('/customers/reset-password', { token, password }, { auth: 'none' });
