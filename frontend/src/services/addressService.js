import { api } from './api';

export const listAddresses = () => api.get('/customers/me/addresses', { auth: 'customer' });
export const createAddress = (payload) => api.post('/customers/me/addresses', payload, { auth: 'customer' });
export const updateAddress = (id, payload) => api.put(`/customers/me/addresses/${id}`, payload, { auth: 'customer' });
export const deleteAddress = (id) => api.del(`/customers/me/addresses/${id}`, { auth: 'customer' });
