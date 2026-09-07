import { api } from './api.js';

export const listGallery = () => api.get('/admin/gallery');

export const createGalleryImage = (payload) =>
  api.post('/gallery', payload);

export const updateGalleryVisibility = (id, is_visible) =>
  api.patch(`/gallery/${id}/visibility`, { is_visible });

export const reorderGallery = (items) =>
  api.post('/gallery/reorder', { items });

export const deleteGalleryImage = (id) =>
  api.del(`/gallery/${id}`);
