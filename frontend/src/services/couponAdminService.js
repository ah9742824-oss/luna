import { api } from './api.js';

export const listCoupons = () => api.get('/admin/coupons');
export const createCoupon = (payload) => api.post('/admin/coupons', payload);
export const updateCoupon = (id, payload) => api.put(`/admin/coupons/${id}`, payload);
export const deleteCoupon = (id) => api.del(`/admin/coupons/${id}`);
