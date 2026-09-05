import {
  getCategories, createCategory, updateCategory, deleteCategory,
} from '../controllers/categoryController.js';
import { requireAuth } from '../middleware/auth.js';
import { requirePermission } from '../middleware/permissions.js';

export function registerCategoryRoutes(router) {
  router.get('/api/categories', getCategories);
  router.post('/api/categories', requireAuth, requirePermission('categories.manage'), createCategory);
  router.put('/api/categories/:id', requireAuth, requirePermission('categories.manage'), updateCategory);
  router.delete('/api/categories/:id', requireAuth, requirePermission('categories.manage'), deleteCategory);
}
