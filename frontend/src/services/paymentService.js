import { api } from './api.js';

// Initiates (or resumes — see paymentController.initiateOnlinePayment's
// idempotent reuse of an existing pending checkout) online payment for an
// order that was already created with payment_method: 'online'. Never
// sends an amount — the backend always re-reads order.total itself.
export function initiateOnlinePayment(orderId, accessToken) {
  const query = accessToken ? `?access_token=${encodeURIComponent(accessToken)}` : '';
  return api.post(`/orders/${orderId}/pay/online${query}`, {}, { auth: 'customer' });
}
