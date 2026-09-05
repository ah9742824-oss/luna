// Cash (and in-person card) payment. There is no online step: the customer
// pays in person, and an admin with orders.manage confirms receipt via the
// EXISTING PATCH /api/admin/orders/:id/payment-status endpoint from
// Phase 2 (orderController.updatePaymentStatus) — that endpoint already
// refuses to do this for payment_method='online' orders, which is what
// keeps this provider's simplicity from ever becoming a backdoor around
// paymobProvider.js's verification requirements.
import { PaymentProvider } from './providerContract.js';

export class CashProvider extends PaymentProvider {
  get name() {
    return 'cash';
  }

  // Cash has no online initiation step — there is nothing to redirect the
  // customer to. Called defensively; paymentController.js never actually
  // calls this for a payment_method='cash' order (see its guard clause).
  async createPayment() {
    throw new Error('Cash orders do not use online payment initiation.');
  }

  async verifyPayment() {
    throw new Error('Cash orders have no provider to verify against — payment is confirmed by an admin in person.');
  }

  async refundPayment() {
    throw new Error('Cash refunds are recorded by an admin via PATCH /api/admin/orders/:id/payment-status, not through this provider.');
  }

  async handleWebhook() {
    throw new Error('Cash has no webhook — nothing external ever calls back about a cash order.');
  }
}
