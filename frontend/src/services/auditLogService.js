import { api } from './api.js';

export const listAuditLogs = (params = {}) => {
  const query = new URLSearchParams(params).toString();
  return api.getWithMeta(`/admin/audit-logs${query ? `?${query}` : ''}`);
};
