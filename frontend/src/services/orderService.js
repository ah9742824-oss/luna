// All pricing math here is display-only, computed from numbers the backend
// itself returned (cart/validate or the created order) — this file never
// invents or overrides a price/subtotal/discount/tax/total. createOrder()
// sends only { product_id, quantity } per item; it never sends a price.
import { api } from './api';

export const validateCart = (orderType, items, couponCode) =>
  api.post('/cart/validate', { order_type: orderType, items, coupon_code: couponCode || undefined }, { auth: 'customer' });

export const validateCoupon = (code, subtotal) =>
  api.post('/coupons/validate', { code, subtotal }, { auth: 'customer' });

// idempotencyKey: one per checkout ATTEMPT — the caller (Checkout page)
// generates it once when the user opens/starts checkout and reuses the same
// value across retries of that same attempt (e.g. a double-click or a
// network retry), so the backend's idempotency protection actually applies.
export function createOrder(payload, idempotencyKey) {
  return api.post('/orders', payload, {
    auth: 'customer',
    headers: { 'Idempotency-Key': idempotencyKey },
  });
}

// A guest order is looked up with the opaque access_token the backend
// returned at creation time — never with the raw sequential id alone
// (section 33). A logged-in customer viewing their OWN order needs no
// token; ownership is verified server-side from the JWT instead.
export function getOrder(id, accessToken) {
  const query = accessToken ? `?access_token=${encodeURIComponent(accessToken)}` : '';
  return api.get(`/orders/${id}${query}`, { auth: 'customer' });
}

export const listMyOrders = () => api.get('/customer/orders', { auth: 'customer' });
