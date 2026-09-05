import { api } from './api.js';

export const listOrders = (params = {}) => {
  const query = new URLSearchParams(params).toString();
  return api.getWithMeta(`/admin/orders${query ? `?${query}` : ''}`);
};
export const getOrder = (id) => api.get(`/admin/orders/${id}`);
export const updateOrderStatus = (id, status) => api.patch(`/admin/orders/${id}/status`, { status });
export const updatePaymentStatus = (id, payment_status) => api.patch(`/admin/orders/${id}/payment-status`, { payment_status });
export const getInvoice = (orderId) => api.get(`/admin/invoices/${orderId}`);
