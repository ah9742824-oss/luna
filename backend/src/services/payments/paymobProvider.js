// Paymob Accept API adapter (https://accept.paymob.com) — a real, widely
// used Egyptian payment gateway, chosen as "a real Egyptian payment
// provider" per MASTER PROMPT V2 section 35/102.
//
// IMPORTANT — HONEST STATUS: this file implements Paymob's documented
// three-step Accept flow (auth -> order registration -> payment key) and
// its documented HMAC webhook verification, from training knowledge of
// Paymob's public API. It has NOT been exercised against a live Paymob
// account in this environment (no merchant credentials are available here
// — see backend/README.md "Payment provider setup" for exactly what a
// deploying developer must configure and verify against Paymob's current
// docs before relying on this in production, since payment gateway APIs
// do change field names/requirements over time). Do not present this as
// "tested against live Paymob" — it is a real, complete adapter structure
// that has only been exercised with mocked HTTP responses (see
// tests/payments.pgmem.test.mjs).
import { PaymentProvider } from './providerContract.js';

const BASE_URL = 'https://accept.paymob.com/api';

function requireEnv(env, name) {
  if (!env[name]) {
    throw new Error(`Paymob is not configured: ${name} is missing. See backend/README.md "Payment provider setup".`);
  }
  return env[name];
}

async function paymobFetch(path, body) {
  const res = await fetch(`${BASE_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(`Paymob API error at ${path}: ${res.status} ${JSON.stringify(data).slice(0, 300)}`);
  }
  return data;
}

// Fields concatenated (in this exact order) to compute the webhook HMAC,
// per Paymob's "Processed Callback" (transaction webhook) documentation.
// VERIFY THIS LIST against Paymob's current docs before production use —
// gateways occasionally add/reorder HMAC fields, and this is exactly the
// kind of detail that must be re-confirmed with live docs/a sandbox
// account, which this environment does not have access to.
const HMAC_FIELD_PATHS = [
  'amount_cents', 'created_at', 'currency', 'error_occured', 'has_parent_transaction',
  'id', 'integration_id', 'is_3d_secure', 'is_auction', 'is_capture', 'is_refunded',
  'is_standalone_payment', 'is_voided', 'order.id', 'owner', 'pending',
  'source_data.pan', 'source_data.sub_type', 'source_data.type', 'success',
];

function getPath(obj, path) {
  return path.split('.').reduce((acc, key) => (acc == null ? acc : acc[key]), obj);
}

async function hmacSha512Hex(secret, message) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-512' }, false, ['sign']);
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(message));
  return Array.from(new Uint8Array(signature), (b) => b.toString(16).padStart(2, '0')).join('');
}

export class PaymobProvider extends PaymentProvider {
  get name() {
    return 'paymob';
  }

  // Step 1-3 of Paymob's Accept flow: authenticate, register the order,
  // request a payment key, then build the iframe checkout URL.
  async createPayment(env, { order, business }) {
    const apiKey = requireEnv(env, 'PAYMOB_API_KEY');
    const integrationId = requireEnv(env, 'PAYMOB_INTEGRATION_ID');
    const iframeId = requireEnv(env, 'PAYMOB_IFRAME_ID');

    const amountCents = Math.round(Number(order.total) * 100);
    // Encodes business+order in a way the webhook can parse back WITHOUT
    // trusting the webhook payload's own claims about which business it's
    // for — see handleWebhook() below and paymentController.js, which
    // re-verifies this against the real order row regardless.
    const merchantOrderId = `biz${business.id}-ord${order.id}`;

    const { token: authToken } = await paymobFetch('/auth/tokens', { api_key: apiKey });

    const paymobOrder = await paymobFetch('/ecommerce/orders', {
      auth_token: authToken,
      delivery_needed: false,
      amount_cents: amountCents,
      currency: business.currency || 'EGP',
      merchant_order_id: merchantOrderId,
      items: [],
    });

    const { token: paymentToken } = await paymobFetch('/acceptance/payment_keys', {
      auth_token: authToken,
      amount_cents: amountCents,
      expiration: 3600,
      order_id: paymobOrder.id,
      currency: business.currency || 'EGP',
      integration_id: integrationId,
      billing_data: {
        // Paymob requires a billing_data block; guest orders may not have
        // every field, so documented placeholders fill gaps Paymob accepts
        // ("NA") rather than fabricating identity data (section 80).
        first_name: (order.guest_name || 'Customer').split(' ')[0] || 'Customer',
        last_name: (order.guest_name || 'Customer').split(' ').slice(1).join(' ') || 'NA',
        phone_number: order.guest_phone || 'NA',
        email: order.guest_email || 'na@example.com',
        apartment: 'NA', floor: 'NA', street: 'NA', building: 'NA',
        city: order.address_snapshot?.city || 'NA', country: 'EG', state: 'NA',
      },
    });

    return {
      status: 'pending',
      checkoutUrl: `${BASE_URL}/acceptance/iframes/${iframeId}?payment_token=${paymentToken}`,
      providerReference: String(paymobOrder.id),
    };
  }

  // Reconciliation fallback (not the primary confirmation path — see
  // providerContract.js). Paymob's "Inquire Transaction" endpoint.
  async verifyPayment(env, { providerTransactionId }) {
    const apiKey = requireEnv(env, 'PAYMOB_API_KEY');
    const { token: authToken } = await paymobFetch('/auth/tokens', { api_key: apiKey });
    const res = await fetch(`${BASE_URL}/acceptance/transactions/${providerTransactionId}?token=${authToken}`);
    const data = await res.json().catch(() => ({}));
    return { success: !!data.success, amountCents: data.amount_cents, currency: data.currency };
  }

  async refundPayment(env, { providerTransactionId, amountCents }) {
    const apiKey = requireEnv(env, 'PAYMOB_API_KEY');
    const { token: authToken } = await paymobFetch('/auth/tokens', { api_key: apiKey });
    return paymobFetch('/acceptance/void_refund/refund', {
      auth_token: authToken,
      transaction_id: providerTransactionId,
      amount_cents: amountCents,
    });
  }

  // Verifies the inbound webhook's HMAC BEFORE trusting anything in the
  // payload (section 36) — this is the entire security boundary for
  // "did Paymob actually send this, unmodified".
  async handleWebhook(env, request) {
    const hmacSecret = requireEnv(env, 'PAYMOB_HMAC_SECRET');
    const url = new URL(request.url);
    const providedHmac = url.searchParams.get('hmac');
    const body = await request.json().catch(() => ({}));
    const obj = body.obj || body;

    if (!providedHmac) {
      return { verified: false, raw: body };
    }

    const message = HMAC_FIELD_PATHS.map((path) => {
      const value = getPath(obj, path);
      return value === null || value === undefined ? '' : String(value);
    }).join('');

    const computedHmac = await hmacSha512Hex(hmacSecret, message);
    const verified = computedHmac.toLowerCase() === providedHmac.toLowerCase();

    return {
      verified,
      providerTransactionId: obj.id ? String(obj.id) : null,
      success: obj.success === true,
      amountCents: obj.amount_cents,
      currency: obj.currency,
      merchantOrderReference: obj.order?.merchant_order_id || null,
      raw: body,
    };
  }
}
