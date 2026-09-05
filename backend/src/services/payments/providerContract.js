// Payment provider abstraction (section 35):
//
//   PaymentProvider
//    ├── createPayment()
//    ├── verifyPayment()
//    ├── refundPayment()
//    └── handleWebhook()
//
// Every concrete provider (cashProvider.js, paymobProvider.js, and any
// future gateway) implements this same shape, so paymentController.js and
// orderController.js never need to know which provider is behind
// `business.payment_provider` / a given order's `payment_method`. Adding a
// second online provider later means adding one more file here and one
// line in index.js's factory — nothing in the controllers changes.
//
// JS has no real interfaces, so this base class exists purely as a
// documented contract: every method throws "not implemented" by default,
// which makes it immediately obvious in testing/dev if a concrete provider
// forgot to override something it needs.
export class PaymentProvider {
  /** Machine-readable provider name, e.g. 'cash', 'paymob'. */
  get name() {
    throw new Error('PaymentProvider.name must be overridden.');
  }

  /**
   * Start a payment for an order that has already been created and
   * server-side priced (section 29) — this NEVER re-derives or accepts a
   * client-supplied amount; callers must pass the order's authoritative
   * `total` from the database.
   *
   * @param {object} env - Worker environment (secrets/config).
   * @param {object} params - { order, business, payment } — DB rows.
   * @returns {Promise<{ status: string, checkoutUrl?: string, providerReference?: string }>}
   */
  async createPayment(env, params) {
    throw new Error(`createPayment() is not implemented for provider "${this.name}".`);
  }

  /**
   * Ask the provider directly for a transaction's current status
   * (as opposed to relying only on an inbound webhook) — used as a
   * reconciliation/fallback check, never as the primary confirmation path.
   */
  async verifyPayment(env, params) {
    throw new Error(`verifyPayment() is not implemented for provider "${this.name}".`);
  }

  /** Issue a refund for a previously paid transaction. */
  async refundPayment(env, params) {
    throw new Error(`refundPayment() is not implemented for provider "${this.name}".`);
  }

  /**
   * Verify and parse an inbound webhook request from the provider.
   * MUST verify the provider's signature/HMAC before trusting anything in
   * the payload (section 36) and must return enough information for the
   * caller to re-verify amount/currency/order/business itself — this
   * method never updates the database directly; paymentController.js owns
   * that, after independently re-checking everything this returns.
   *
   * @returns {Promise<{
   *   verified: boolean,
   *   providerTransactionId: string,
   *   success: boolean,
   *   amountCents: number,
   *   currency: string,
   *   merchantOrderReference: string,
   *   raw: object,
   * }>}
   */
  async handleWebhook(env, request) {
    throw new Error(`handleWebhook() is not implemented for provider "${this.name}".`);
  }
}
