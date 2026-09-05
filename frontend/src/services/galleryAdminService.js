import { api } from './api.js';

export const listGallery = () => api.get('/gallery');
export const createGalleryImage = (payload) => api.post('/gallery', payload);
export const deleteGalleryImage = (id) => api.del(`/gallery/${id}`);
