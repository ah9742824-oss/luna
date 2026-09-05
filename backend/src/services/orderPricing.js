// Server-side order pricing (section 29): the ONLY place price math happens.
// Both POST /api/cart/validate and POST /api/orders call this — the frontend
// never sends, and the backend never trusts, a subtotal/discount/tax/total.
//
// Every function here expects `client` to be a pg Client already inside a
// tenant transaction opened by withTenantClient(env, businessId, ...) (see
// config/db.js) — this file never opens its own connection, so RLS's
// app.current_business_id is already set for the duration of the calls.
import { HttpError } from '../utils/http.js';

function round2(n) {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

// Locks each referenced product row (FOR UPDATE) so a concurrent admin
// availability/price edit can't race with an in-flight checkout, re-reads
// the authoritative price from the database, and rejects anything that
// isn't real: unknown product id, product from a different business,
// unavailable product, non-integer/non-positive quantity.
export async function priceCartItems(client, businessId, items) {
  if (!Array.isArray(items) || items.length === 0) {
    throw new HttpError(400, 'At least one item is required.');
  }
  if (items.length > 100) {
    throw new HttpError(400, 'Too many distinct items in one order.');
  }

  const lineItems = [];
  let subtotal = 0;

  for (const rawItem of items) {
    const productId = Number(rawItem?.product_id);
    const quantity = Number(rawItem?.quantity);

    if (!Number.isInteger(productId) || productId <= 0) {
      throw new HttpError(400, 'Each item must have a valid product_id.');
    }
    if (!Number.isInteger(quantity) || quantity <= 0 || quantity > 50) {
      throw new HttpError(400, `Invalid quantity for product ${productId}. Must be an integer between 1 and 50.`);
    }

    const result = await client.query(
      `SELECT id, business_id, name, name_ar, price, is_available
       FROM products WHERE id = $1 AND business_id = $2 FOR UPDATE`,
      [productId, businessId]
    );
    const product = result.rows[0];
    if (!product) {
      throw new HttpError(400, `Product ${productId} does not exist on this business.`);
    }
    if (!product.is_available) {
      throw new HttpError(409, `"${product.name}" is currently unavailable.`);
    }

    // Authoritative price — from the database row just locked, never from
    // the request body, even if the request body also sent a price.
    const unitPrice = Number(product.price);
    const lineSubtotal = round2(unitPrice * quantity);
    subtotal = round2(subtotal + lineSubtotal);

    lineItems.push({
      product_id: product.id,
      name: product.name,
      name_ar: product.name_ar,
      unit_price: unitPrice,
      quantity,
      subtotal: lineSubtotal,
    });
  }

  return { lineItems, subtotal };
}

// Validates a coupon code server-side (section 38) and returns the discount
// amount for the given subtotal. Never trusts a client-submitted discount.
// Locks the coupon row so two concurrent orders can't both slip in under a
// usage_limit of 1.
export async function applyCoupon(client, businessId, couponCode, subtotal, customerId) {
  if (!couponCode) return { coupon: null, discount: 0 };

  const result = await client.query(
    `SELECT * FROM coupons WHERE business_id = $1 AND UPPER(code) = UPPER($2) FOR UPDATE`,
    [businessId, couponCode]
  );
  const coupon = result.rows[0];
  if (!coupon) throw new HttpError(400, 'Invalid coupon code.');
  if (!coupon.is_active) throw new HttpError(400, 'This coupon is no longer active.');
  if (coupon.expires_at && new Date(coupon.expires_at) < new Date()) {
    throw new HttpError(400, 'This coupon has expired.');
  }
  if (Number(coupon.minimum_order_amount) > subtotal) {
    throw new HttpError(400, `This coupon requires a minimum order of ${coupon.minimum_order_amount}.`);
  }

  if (coupon.usage_limit !== null) {
    const usageResult = await client.query('SELECT COUNT(*)::int AS n FROM coupon_usage WHERE coupon_id = $1', [coupon.id]);
    if (usageResult.rows[0].n >= coupon.usage_limit) {
      throw new HttpError(400, 'This coupon has reached its usage limit.');
    }
  }

  let discount;
  if (coupon.type === 'percentage') {
    discount = round2((subtotal * Number(coupon.value)) / 100);
    if (coupon.maximum_discount_amount !== null) {
      discount = Math.min(discount, Number(coupon.maximum_discount_amount));
    }
  } else {
    discount = Number(coupon.value);
  }
  // Discount can never exceed the subtotal it's applied to.
  discount = Math.min(round2(discount), subtotal);

  return { coupon, discount };
}

// Delivery fee + tax + final total. `orderType` must already be validated
// against the business's accept_pickup/accept_delivery/accept_dine_in flags
// by the caller before this runs.
export function computeTotals({ subtotal, discount, orderType, business }) {
  const deliveryFee = orderType === 'delivery' ? Number(business.delivery_fee) : 0;
  const taxableAmount = Math.max(0, round2(subtotal - discount));
  const tax = round2((taxableAmount * Number(business.tax_rate_percent)) / 100);
  const total = round2(Math.max(0, taxableAmount + deliveryFee + tax));
  return { deliveryFee: round2(deliveryFee), tax, total };
}
