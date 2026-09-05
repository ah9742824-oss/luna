import { query, withTenantClient } from '../config/db.js';
import { json, HttpError } from '../utils/http.js';
import { canAccessOrder } from './orderController.js';
import { getProviderForPaymentMethod, getProviderByName } from '../services/payments/index.js';
import { logAudit } from '../utils/audit.js';

function round2(n) {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

// POST /api/orders/:id/pay/online — initiates (or resumes) an online
// payment for an order that already exists and was already server-side
// priced at creation time (section 29). The amount sent to the provider is
// ALWAYS order.total read fresh from the database here — never anything
// the client sends on this request (this endpoint doesn't even accept a
// body).
export async function initiateOnlinePayment(request, env) {
  const { id } = request.params;

  const orderResult = await query(env, 'SELECT * FROM orders WHERE id = $1 AND business_id = $2', [id, request.business.id]);
  const order = orderResult.rows[0];
  if (!order) throw new HttpError(404, 'Order not found.');

  // Same ownership rule as viewing the order (section 33/96) — a stranger
  // cannot pay for (or probe the payment state of) someone else's order.
  if (!canAccessOrder(request, order)) {
    throw new HttpError(404, 'Order not found.');
  }

  if (order.payment_method !== 'online') {
    throw new HttpError(400, `This order's payment method is "${order.payment_method}", not "online".`);
  }
  if (order.payment_status === 'paid') {
    throw new HttpError(409, 'This order has already been paid.');
  }
  if (order.payment_status === 'refunded') {
    throw new HttpError(409, 'This order was refunded and cannot be paid again.');
  }

  const paymentResult = await query(env, 'SELECT * FROM payments WHERE order_id = $1 AND business_id = $2', [id, request.business.id]);
  const payment = paymentResult.rows[0];
  if (!payment) throw new HttpError(500, 'No payment record exists for this order (this should never happen — order creation always creates one).');

  // Idempotent / duplicate-payment-request protection: if a checkout was
  // already started and is still pending, hand back the SAME checkout URL
  // instead of registering a brand new provider order every time the
  // customer clicks "pay" again (double-click, page reload, etc).
  if (payment.status === 'pending' && payment.checkout_url) {
    return json({ success: true, data: { checkout_url: payment.checkout_url } });
  }

  const provider = getProviderForPaymentMethod(order.payment_method);
  let result;
  try {
    result = await provider.createPayment(env, { order, business: request.business });
  } catch (err) {
    // SECURITY FIX (Phase 7 audit): this was previously unwrapped, so a
    // provider configuration error (e.g. missing PAYMOB_API_KEY) fell
    // through to errorHandler.js's generic branch and returned an opaque
    // "Something went wrong on the server" — hiding exactly the
    // information a deploying merchant needs to fix their setup, and
    // contradicting the documented behavior in backend/README.md section
    // 20 ("returns a clear 500 explaining exactly what's missing"). The
    // underlying message never contains secrets (it names a missing env
    // var or echoes the provider's own HTTP error), so surfacing it is
    // safe and correct — this is a real fix, not new provider logic.
    console.error('Payment initiation failed:', err && err.stack ? err.stack : err);
    throw new HttpError(502, err.message || 'The payment provider could not be reached.');
  }

  await withTenantClient(env, request.business.id, async (client) => {
    await client.query(
      'UPDATE payments SET provider = $1, checkout_url = $2, provider_reference = $3, status = $4 WHERE order_id = $5',
      [provider.name, result.checkoutUrl, result.providerReference, result.status || 'pending', id]
    );
  });

  return json({ success: true, data: { checkout_url: result.checkoutUrl } }, 201);
}

// POST /api/payments/webhook/:provider — called by the payment provider's
// servers, not by our frontend. Registered in worker.js BEFORE tenant
// resolution (see that file) because an external provider has no
// X-Business-Slug header to send; this handler resolves the business
// itself, from data embedded in the payment record it already created
// server-side (never from the webhook payload's own unverified claims).
export async function handlePaymentWebhook(request, env) {
  const { provider: providerName } = request.params;
  let provider;
  try {
    provider = getProviderByName(providerName);
  } catch {
    throw new HttpError(404, 'Unknown payment provider.');
  }

  const result = await provider.handleWebhook(env, request);

  // Signature/HMAC verification failed — reject outright. Nothing here is
  // trusted enough to even attribute to a business for logging (section 36:
  // "payment confirmation must be verified server-side"; an unverified
  // payload proves nothing about who sent it).
  if (!result.verified) {
    throw new HttpError(401, 'Webhook signature verification failed.');
  }

  // merchantOrderReference was generated by OUR OWN createPayment() as
  // `biz<businessId>-ord<orderId>` — parsing it back is safe specifically
  // because the HMAC above already proved this payload came from the real
  // provider, who can only echo back a reference we gave them; it is not
  // itself trusted as an identity claim independent of that.
  const match = /^biz(\d+)-ord(\d+)$/.exec(result.merchantOrderReference || '');
  if (!match) {
    throw new HttpError(400, 'Webhook payload has no recognizable order reference.');
  }
  const [, businessIdStr, orderIdStr] = match;
  const businessId = Number(businessIdStr);
  const orderId = Number(orderIdStr);

  // Re-derive EVERYTHING from the database — the webhook payload is only
  // ever used to decide "did payment succeed" and to carry the provider's
  // transaction id; amount/currency/order/business are all independently
  // re-verified against the authoritative order row (section 29, 79).
  const orderResult = await query(env, 'SELECT * FROM orders WHERE id = $1 AND business_id = $2', [orderId, businessId]);
  const order = orderResult.rows[0];
  if (!order) {
    // Forged/mismatched business or order id in the reference — this is
    // exactly the "preventing payment for a different order/business"
    // case: a genuine Paymob signature can never produce a reference for
    // an order/business pair that doesn't actually exist together, so
    // reaching here means the reference itself was tampered with somehow,
    // or is stale. Reject; do not guess.
    throw new HttpError(404, 'No matching order found for this business/order reference.');
  }
  if (order.payment_method !== 'online') {
    throw new HttpError(400, 'This order is not an online-payment order.');
  }

  const businessResult = await query(env, 'SELECT * FROM businesses WHERE id = $1', [businessId]);
  const business = businessResult.rows[0];

  const expectedAmountCents = Math.round(Number(order.total) * 100);
  const amountMatches = Number(result.amountCents) === expectedAmountCents;
  const currencyMatches = (result.currency || '').toUpperCase() === (business.currency || 'EGP').toUpperCase();

  const outcome = await withTenantClient(env, businessId, async (client) => {
    // Atomic replay/duplicate protection: this INSERT is the actual
    // guarantee, not a separate "check then act" read (which would have a
    // race window). A second delivery of the SAME provider+transaction id
    // hits the partial unique index in migration 0004 and fails with
    // 23505 here — recognized below and turned into a safe no-op ack
    // instead of reprocessing the payment.
    try {
      await client.query(
        `INSERT INTO payment_webhook_events (business_id, payment_id, provider, provider_transaction_id, outcome, reason)
         SELECT $1, p.id, $2, $3, 'processed', $4 FROM payments p WHERE p.order_id = $5`,
        [businessId, provider.name, result.providerTransactionId, amountMatches && currencyMatches ? 'ok' : 'mismatch', orderId]
      );
    } catch (err) {
      if (err.code === '23505') {
        await client.query(
          `INSERT INTO payment_webhook_events (business_id, provider, provider_transaction_id, outcome, reason)
           VALUES ($1,$2,$3,'duplicate_ignored','replay or duplicate delivery of an already-processed transaction id')`,
          [businessId, provider.name, result.providerTransactionId]
        );
        return 'duplicate';
      }
      throw err;
    }

    if (!amountMatches || !currencyMatches) {
      // The payload's signature is genuinely from the provider, but the
      // amount/currency don't match what we actually charged for — never
      // mark this paid. This is the "wrong amount"/"wrong currency"
      // defense: a valid signature is necessary but not sufficient.
      await client.query(`UPDATE payments SET status = 'failed', provider_transaction_id = $1 WHERE order_id = $2`, [result.providerTransactionId, orderId]);
      await client.query(`UPDATE orders SET payment_status = 'failed' WHERE id = $1`, [orderId]);
      await logAudit(client, {
        businessId, action: 'payment_webhook_amount_mismatch', resourceType: 'order', resourceId: orderId,
        metadata: { expectedAmountCents, receivedAmountCents: result.amountCents, expectedCurrency: business.currency, receivedCurrency: result.currency },
      });
      return 'mismatch';
    }

    if (result.success) {
      await client.query(`UPDATE payments SET status = 'paid', provider_transaction_id = $1 WHERE order_id = $2`, [result.providerTransactionId, orderId]);
      // payment_status = 'paid' is set HERE ONLY — after independent
      // server-side signature + amount + currency + order + business
      // verification. There is no code path anywhere in this backend that
      // sets an online order to 'paid' from a client-supplied value
      // (section 79/102) — see orderController.updatePaymentStatus's
      // explicit refusal to do this manually for payment_method='online'.
      await client.query(`UPDATE orders SET payment_status = 'paid' WHERE id = $1`, [orderId]);
      await logAudit(client, {
        businessId, action: 'payment_confirmed', resourceType: 'order', resourceId: orderId,
        metadata: { provider: provider.name, provider_transaction_id: result.providerTransactionId, amount: round2(result.amountCents / 100) },
      });
      if (order.customer_id) {
        await client.query(
          `INSERT INTO notifications (business_id, customer_id, type, title, message, related_order_id) VALUES ($1,$2,'payment_confirmed',$3,$4,$5)`,
          [businessId, order.customer_id, 'Payment received', `Payment for order ${order.order_number} was confirmed.`, orderId]
        );
      }
      return 'paid';
    }

    await client.query(`UPDATE payments SET status = 'failed', provider_transaction_id = $1 WHERE order_id = $2`, [result.providerTransactionId, orderId]);
    await client.query(`UPDATE orders SET payment_status = 'failed' WHERE id = $1`, [orderId]);
    return 'failed';
  });

  // Always 200 to the provider once the signature is verified and the
  // event is durably recorded (paid/failed/mismatch/duplicate) — a non-200
  // here would make the provider retry-storm an event we've already
  // handled. Only signature failures (above) get a non-200.
  return json({ success: true, data: { outcome } });
}
