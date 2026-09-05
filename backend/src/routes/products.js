import {
  getProducts, getProductById, createProduct, updateProduct, deleteProduct,
} from '../controllers/productController.js';
import { requireAuth } from '../middleware/auth.js';
import { requirePermission } from '../middleware/permissions.js';

export function registerProductRoutes(router) {
  router.get('/api/products', getProducts);
  router.get('/api/products/:id', getProductById);
  router.post('/api/products', requireAuth, requirePermission('products.manage'), createProduct);
  router.put('/api/products/:id', requireAuth, requirePermission('products.manage'), updateProduct);
  router.delete('/api/products/:id', requireAuth, requirePermission('products.manage'), deleteProduct);
}
