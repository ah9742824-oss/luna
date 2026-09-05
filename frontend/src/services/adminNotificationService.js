import { api } from './api.js';

export const listAdminNotifications = () => api.get('/admin/notifications');
export const markAdminNotificationRead = (id) => api.patch(`/admin/notifications/${id}/read`, {});
