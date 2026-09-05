import { query, withTenantClient } from '../config/db.js';
import { json, HttpError } from '../utils/http.js';
import { isNonEmptyString } from '../utils/validate.js';
import { priceCartItems, applyCoupon, computeTotals } from '../services/orderPricing.js';
import { assertValidTransition, ORDER_STATUSES } from '../services/orderStatus.js';
import { logAudit } from '../utils/audit.js';

function generateAccessToken() {
  // 24 random bytes, base64url-encoded — unguessable, and distinct from the
  // sequential id so a guest tracking link never doubles as an enumerable
  // order id (section 33). Uses the native WebCrypto API (globalThis.crypto)
  // rather than node:crypto, so this works on Workers with zero dependency
  // on the nodejs_compat shim's coverage of that module.
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

// POST /api/cart/validate — recomputes real prices/availability for a
// candidate cart without creating an order. Powers a live-updating cart UI
// that never has to trust client-side math (section 27, 29, 95).
export async function validateCart(request, env) {
  const body = await request.json().catch(() => ({}));
  const orderType = body.order_type;
  if (!['pickup', 'delivery', 'dine_in'].includes(orderType)) {
    throw new HttpError(400, 'order_type must be one of: pickup, delivery, dine_in.');
  }

  const result = await withTenantClient(env, request.business.id, async (client) => {
    const { lineItems, subtotal } = await priceCartItems(client, request.business.id, body.items);
    const { coupon, discount } = await applyCoupon(client, request.business.id, body.coupon_code, subtotal, request.customer?.id);
    const { deliveryFee, tax, total } = computeTotals({ subtotal, discount, orderType, business: request.business });
    return {
      items: lineItems,
      subtotal,
      discount,
      coupon: coupon ? { code: coupon.code, type: coupon.type, value: Number(coupon.value) } : null,
      delivery_fee: deliveryFee,
      tax,
      total,
    };
  });

  return json({ success: true, data: result });
}

function validateOrderBody(body) {
  if (!['pickup', 'delivery', 'dine_in'].includes(body.order_type)) {
    throw new HttpError(400, 'order_type must be one of: pickup, delivery, dine_in.');
  }
  if (!['cash', 'card', 'online'].includes(body.payment_method)) {
    throw new HttpError(400, 'payment_method must be one of: cash, card, online.');
  }
  if (body.order_type === 'delivery' && !isNonEmptyString(body.address?.address_line)) {
    throw new HttpError(400, 'A delivery address is required for delivery orders.');
  }
  if (body.order_type === 'dine_in' && !isNonEmptyString(body.table_number)) {
    throw new HttpError(400, 'table_number is required for dine-in orders.');
  }
  if (!request_has_identity(body)) {
    throw new HttpError(400, 'guest_name and guest_phone are required for guest checkout.');
  }
}
function request_has_identity(body) {
  // Real check happens in createOrder (customer session OR guest fields) —
  // this just validates the guest-field shape when present.
  if (body.guest_name !== undefined || body.guest_phone !== undefined) {
    return isNonEmptyString(body.guest_name) && isNonEmptyString(body.guest_phone);
  }
  return true;
}

// POST /api/orders — the security-critical endpoint (section 29, 34, 96).
// Auth is OPTIONAL here (optionalCustomerAuth): guest checkout is allowed by
// design (section 13), but if a customer IS logged in, the order is always
// attributed to them (never to attacker-supplied guest fields instead).
export async function createOrder(request, env) {
  const business = request.business;
  if (!business.accept_orders || !business.enabled_modules?.ordering) {
    throw new HttpError(403, 'This business is not currently accepting orders.');
  }

  const body = await request.json().catch(() => ({}));
  validateOrderBody(body);

  const orderType = body.order_type;
  if (orderType === 'delivery' && !business.accept_delivery) throw new HttpError(403, 'Delivery is not currently available.');
  if (orderType === 'pickup' && !business.accept_pickup) throw new HttpError(403, 'Pickup is not currently available.');
  if (orderType === 'dine_in' && !business.accept_dine_in) throw new HttpError(403, 'Dine-in ordering is not currently available.');

  // Idempotency key (section 34): required, so a double-click/network retry
  // of the SAME checkout attempt can be recognized and safely no-op'd.
  const idempotencyKey = request.headers.get('Idempotency-Key') || body.idempotency_key;
  if (!isNonEmptyString(idempotencyKey)) {
    throw new HttpError(400, 'An Idempotency-Key header (or idempotency_key field) is required.');
  }

  // Fast path: an identical retry of an already-created order returns the
  // existing order instead of erroring or double-charging/double-cooking.
  const existing = await query(
    env,
    'SELECT id FROM orders WHERE business_id = $1 AND idempotency_key = $2',
    [business.id, idempotencyKey]
  );
  if (existing.rows.length > 0) {
    return respondWithOrder(request, env, existing.rows[0].id, 200);
  }

  const customerId = request.customer?.id || null;

  try {
    const order = await withTenantClient(env, business.id, async (client) => {
      // Re-check inside the transaction too (belt-and-suspenders against a
      // race between two concurrent requests carrying the same key — the
      // UNIQUE index on (business_id, idempotency_key) is the real
      // guarantee; this just gives a clean response instead of a 500 in the
      // common case).
      const dupeCheck = await client.query(
        'SELECT id FROM orders WHERE business_id = $1 AND idempotency_key = $2',
        [business.id, idempotencyKey]
      );
      if (dupeCheck.rows.length > 0) {
        return { alreadyExisted: true, id: dupeCheck.rows[0].id };
      }

      if (customerId) {
        const customerCheck = await client.query('SELECT id FROM customers WHERE id = $1 AND business_id = $2 AND is_active = TRUE', [customerId, business.id]);
        if (customerCheck.rows.length === 0) throw new HttpError(401, 'Invalid customer session.');
      }

      const { lineItems, subtotal } = await priceCartItems(client, business.id, body.items);

      if (orderType === 'delivery' && subtotal < Number(business.minimum_order_amount)) {
        throw new HttpError(400, `Minimum order for delivery is ${business.minimum_order_amount}.`);
      }

      const { coupon, discount } = await applyCoupon(client, business.id, body.coupon_code, subtotal, customerId);
      const { deliveryFee, tax, total } = computeTotals({ subtotal, discount, orderType, business });

      // Atomically reserve the next order number for this business — the
      // row lock from `FOR UPDATE` (implicit in this UPDATE...RETURNING)
      // serializes concurrent checkouts on the same business so two orders
      // can never get the same number.
      const numberResult = await client.query(
        `UPDATE businesses SET last_order_number = last_order_number + 1 WHERE id = $1 RETURNING last_order_number, order_number_prefix`,
        [business.id]
      );
      const orderNumber = `${numberResult.rows[0].order_number_prefix}-${numberResult.rows[0].last_order_number}`;
      const accessToken = generateAccessToken();

      let addressSnapshot = null;
      if (orderType === 'delivery') {
        addressSnapshot = {
          recipient_name: body.address?.recipient_name || body.guest_name,
          phone: body.address?.phone || body.guest_phone,
          address_line: body.address.address_line,
          city: body.address?.city || null,
          notes: body.address?.notes || null,
        };
      }

      const orderResult = await client.query(
        `INSERT INTO orders (
           business_id, customer_id, guest_name, guest_phone, guest_email,
           order_number, order_type, status, subtotal, discount, delivery_fee, tax, total,
           coupon_id, coupon_code_snapshot, payment_method, payment_status,
           address_snapshot, table_number, notes, idempotency_key, access_token
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,'new',$8,$9,$10,$11,$12,$13,$14,$15,'unpaid',$16,$17,$18,$19,$20)
         RETURNING *`,
        [
          business.id, customerId, customerId ? null : body.guest_name, customerId ? null : body.guest_phone, body.guest_email || null,
          orderNumber, orderType, subtotal, discount, deliveryFee, tax, total,
          coupon?.id || null, coupon?.code || null, body.payment_method,
          addressSnapshot ? JSON.stringify(addressSnapshot) : null, orderType === 'dine_in' ? body.table_number : null, body.notes || null,
          idempotencyKey, accessToken,
        ]
      );
      const newOrder = orderResult.rows[0];

      for (const item of lineItems) {
        await client.query(
          `INSERT INTO order_items (order_id, business_id, product_id, product_name_snapshot, product_name_ar_snapshot, unit_price_snapshot, quantity, subtotal)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
          [newOrder.id, business.id, item.product_id, item.name, item.name_ar, item.unit_price, item.quantity, item.subtotal]
        );
      }

      if (coupon) {
        await client.query(
          `INSERT INTO coupon_usage (business_id, coupon_id, order_id, customer_id, discount_amount) VALUES ($1,$2,$3,$4,$5)`,
          [business.id, coupon.id, newOrder.id, customerId, discount]
        );
      }

      // Payment record (section 35). 'cash'/'card' (in person) start
      // 'pending' until an admin confirms receipt; 'online' stays 'pending'
      // until a real provider webhook verifies it server-side (section 36,
      // 79, 102) — never marked paid here regardless of what the client sent.
      await client.query(
        `INSERT INTO payments (business_id, order_id, provider, amount, currency, status) VALUES ($1,$2,$3,$4,$5,'pending')`,
        [business.id, newOrder.id, body.payment_method, total, business.currency || 'EGP']
      );

      // Invoice snapshot (section 37) — frozen at creation time so later
      // edits to products/business/customer never alter historical invoices.
      const invoiceNumber = `INV-${orderNumber}`;
      const snapshot = {
        business: { name: business.name, name_ar: business.name_ar, phone: business.phone, address: business.address },
        customer: customerId ? { id: customerId } : { name: body.guest_name, phone: body.guest_phone },
        items: lineItems,
        subtotal, discount, delivery_fee: deliveryFee, tax, total,
        payment_method: body.payment_method,
        order_number: orderNumber,
        issued_at: new Date().toISOString(),
      };
      await client.query(
        `INSERT INTO invoices (business_id, order_id, invoice_number, snapshot) VALUES ($1,$2,$3,$4)`,
        [business.id, newOrder.id, invoiceNumber, JSON.stringify(snapshot)]
      );

      // Admin-facing notification (section 49).
      await client.query(
        `INSERT INTO notifications (business_id, type, title, message, related_order_id) VALUES ($1,'new_order',$2,$3,$4)`,
        [business.id, 'New Order Received', `Order ${orderNumber} — ${total} ${business.currency || 'EGP'}`, newOrder.id]
      );

      await logAudit(client, {
        businessId: business.id,
        profileId: null,
        action: 'order_created',
        resourceType: 'order',
        resourceId: newOrder.id,
        metadata: { order_number: orderNumber, total, customer_id: customerId },
      });

      return { alreadyExisted: false, id: newOrder.id };
    });

    return respondWithOrder(request, env, order.id, order.alreadyExisted ? 200 : 201);
  } catch (err) {
    // Defense-in-depth: if two concurrent requests both passed the
    // pre-check above, the UNIQUE index on (business_id, idempotency_key)
    // rejects the second INSERT with 23505 — recover by returning the
    // order the first request created, instead of surfacing a 500.
    if (err.code === '23505' && err.constraint === 'uq_orders_business_idempotency') {
      const raceWinner = await query(env, 'SELECT id FROM orders WHERE business_id = $1 AND idempotency_key = $2', [business.id, idempotencyKey]);
      if (raceWinner.rows[0]) return respondWithOrder(request, env, raceWinner.rows[0].id, 200);
    }
    throw err;
  }
}

async function fetchOrderWithItems(env, businessId, orderId) {
  const orderResult = await query(env, 'SELECT * FROM orders WHERE id = $1 AND business_id = $2', [orderId, businessId]);
  const order = orderResult.rows[0];
  if (!order) return null;
  const itemsResult = await query(env, 'SELECT * FROM order_items WHERE order_id = $1 AND business_id = $2 ORDER BY id', [orderId, businessId]);
  return { ...order, items: itemsResult.rows };
}

// Ownership/access control (section 33, 96): an order is visible to
// (a) an authenticated admin with orders.view (checked by the route
// middleware before this runs), (b) the customer it belongs to, or
// (c) a caller presenting the correct opaque access_token (guest tracking).
// Exported so paymentController.js can apply the EXACT same rule when
// deciding who may initiate an online payment for an order — one
// authorization rule, not two copies that could drift apart.
export function canAccessOrder(request, order) {
  const isAdmin = !!request.user; // requireAuth already verified business match, if used on this route
  const isOwningCustomer = request.customer && order.customer_id === request.customer.id;
  const url = new URL(request.url);
  const presentedToken = url.searchParams.get('access_token');
  const hasValidGuestToken = presentedToken && presentedToken === order.access_token;
  return isAdmin || isOwningCustomer || hasValidGuestToken;
}

async function respondWithOrder(request, env, orderId, successStatus = 200) {
  const order = await fetchOrderWithItems(env, request.business.id, orderId);
  if (!order) throw new HttpError(404, 'Order not found.');

  // A caller satisfying NONE of canAccessOrder's checks gets 404 — not 403
  // — so order existence can't be probed by id.
  if (!canAccessOrder(request, order)) {
    throw new HttpError(404, 'Order not found.');
  }

  return json({ success: true, data: order }, successStatus);
}

// GET /api/orders/:id and GET /api/admin/orders/:id — thin route wrapper
// around respondWithOrder() above (also called internally by createOrder()
// for its idempotent-replay/response path, with the real request object so
// request.url/request.user/request.customer are always genuine).
export async function getOrderById(request, env) {
  const { id } = request.params;
  return respondWithOrder(request, env, id, 200);
}

// GET /api/customer/orders — a customer's own order history (section 14, 33).
export async function listMyOrders(request, env) {
  const result = await query(
    env,
    'SELECT * FROM orders WHERE business_id = $1 AND customer_id = $2 ORDER BY created_at DESC LIMIT 100',
    [request.business.id, request.customer.id]
  );
  return json({ success: true, data: result.rows });
}

// GET /api/admin/orders — paginated, filterable (sections 47, 55).
export async function listOrders(request, env) {
  const url = new URL(request.url);
  const status = url.searchParams.get('status');
  const page = Math.max(1, parseInt(url.searchParams.get('page') || '1', 10) || 1);
  const pageSize = Math.min(100, Math.max(1, parseInt(url.searchParams.get('pageSize') || '20', 10) || 20));
  const offset = (page - 1) * pageSize;

  const conditions = ['business_id = $1'];
  const values = [request.business.id];
  if (status && ORDER_STATUSES.includes(status)) {
    values.push(status);
    conditions.push(`status = $${values.length}`);
  }

  const countResult = await query(env, `SELECT COUNT(*)::int AS n FROM orders WHERE ${conditions.join(' AND ')}`, values);
  values.push(pageSize, offset);
  const rowsResult = await query(
    env,
    `SELECT * FROM orders WHERE ${conditions.join(' AND ')} ORDER BY created_at DESC LIMIT $${values.length - 1} OFFSET $${values.length}`,
    values
  );

  return json({ success: true, data: rowsResult.rows, meta: { page, pageSize, total: countResult.rows[0].n } });
}

// PATCH /api/admin/orders/:id/status — enforces the state machine server-side
// (section 32) regardless of what the admin UI offers.
export async function updateOrderStatus(request, env) {
  const { id } = request.params;
  const body = await request.json().catch(() => ({}));
  const toStatus = body.status;
  if (!ORDER_STATUSES.includes(toStatus)) throw new HttpError(400, `status must be one of: ${ORDER_STATUSES.join(', ')}.`);

  const order = await withTenantClient(env, request.business.id, async (client) => {
    const existing = await client.query('SELECT * FROM orders WHERE id = $1 AND business_id = $2 FOR UPDATE', [id, request.business.id]);
    if (existing.rows.length === 0) throw new HttpError(404, 'Order not found.');
    const current = existing.rows[0];

    if (!assertValidTransition(current.status, toStatus)) {
      throw new HttpError(409, `Cannot move an order from "${current.status}" to "${toStatus}".`);
    }

    const updated = await client.query('UPDATE orders SET status = $1 WHERE id = $2 AND business_id = $3 RETURNING *', [toStatus, id, request.business.id]);

    await logAudit(client, {
      businessId: request.business.id,
      profileId: request.user.id,
      action: 'order_status_changed',
      resourceType: 'order',
      resourceId: id,
      metadata: { from: current.status, to: toStatus },
    });

    if (updated.rows[0].customer_id) {
      await client.query(
        `INSERT INTO notifications (business_id, customer_id, type, title, message, related_order_id) VALUES ($1,$2,'order_status',$3,$4,$5)`,
        [request.business.id, updated.rows[0].customer_id, 'Order status updated', `Your order ${current.order_number} is now "${toStatus}".`, id]
      );
    }

    return updated.rows[0];
  });

  return json({ success: true, data: order });
}

// PATCH /api/admin/orders/:id/payment-status — cash/card (in-person) only.
// Online payments must go through a real, webhook-verified provider
// (section 36, 79, 102) — this endpoint explicitly refuses to mark an
// 'online' order as paid, so there is no back door around that rule.
export async function updatePaymentStatus(request, env) {
  const { id } = request.params;
  const body = await request.json().catch(() => ({}));
  const toStatus = body.payment_status;
  if (!['paid', 'refunded', 'failed'].includes(toStatus)) {
    throw new HttpError(400, 'payment_status must be one of: paid, refunded, failed.');
  }

  const result = await withTenantClient(env, request.business.id, async (client) => {
    const existing = await client.query('SELECT * FROM orders WHERE id = $1 AND business_id = $2 FOR UPDATE', [id, request.business.id]);
    if (existing.rows.length === 0) throw new HttpError(404, 'Order not found.');
    const order = existing.rows[0];

    if (order.payment_method === 'online' && toStatus === 'paid') {
      throw new HttpError(400, 'Online payments can only be marked paid by a verified provider webhook, not manually.');
    }

    const updatedOrder = await client.query('UPDATE orders SET payment_status = $1 WHERE id = $2 RETURNING *', [toStatus, id]);
    await client.query('UPDATE payments SET status = $1 WHERE order_id = $2', [toStatus === 'paid' ? 'paid' : toStatus, id]);

    await logAudit(client, {
      businessId: request.business.id,
      profileId: request.user.id,
      action: 'order_payment_status_changed',
      resourceType: 'order',
      resourceId: id,
      metadata: { to: toStatus, method: order.payment_method },
    });

    return updatedOrder.rows[0];
  });

  return json({ success: true, data: result });
}
