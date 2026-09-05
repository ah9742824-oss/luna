import { api } from './api.js';

export const listCustomers = (params = {}) => {
  const query = new URLSearchParams(params).toString();
  return api.getWithMeta(`/admin/customers${query ? `?${query}` : ''}`);
};
export const getCustomer = (id) => api.get(`/admin/customers/${id}`);
