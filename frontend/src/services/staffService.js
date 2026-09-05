import { api } from './api.js';

export const listRoles = () => api.get('/admin/roles');
export const listStaff = () => api.get('/admin/staff');
export const createStaff = (payload) => api.post('/admin/staff', payload);
export const updateStaff = (id, payload) => api.put(`/admin/staff/${id}`, payload);
