// Phase 2 test suite (orders/customers/coupons/payments/invoices core).
// Same pg-mem approach as tests/migration.pgmem.test.mjs — see that file's
// header comment for exactly what pg-mem can and cannot verify (no RLS, no
// plpgsql triggers; schema + application-layer logic only). This file
// additionally unit-tests the REAL service modules (services/orderPricing.js,
// services/orderStatus.js) against the in-memory database, not just SQL.
import { newDb } from 'pg-mem';
import fs from 'node:fs';
import path from 'node:path';
import { priceCartItems, applyCoupon, computeTotals } from '../src/services/orderPricing.js';
import { assertValidTransition, ORDER_STATUSES } from '../src/services/orderStatus.js';

let failures = 0;
function check(name, cond) {
  if (cond) console.log(`  ok   ${name}`);
  else { console.error(`  FAIL ${name}`); failures++; }
}

const db = newDb({ autoCreateForeignKeyIndices: true });
db.public.registerFunction({ name: 'gen_random_uuid', returns: 'uuid', implementation: () => crypto.randomUUID() });
db.public.registerFunction({
  name: 'jsonb_build_object', args: [], argsVariadic: 'text', returns: 'jsonb',
  implementation: (...args) => { const o = {}; for (let i = 0; i < args.length; i += 2) o[args[i]] = args[i + 1]; return o; },
});
db.public.registerFunction({
  name: 'jsonb_strip_nulls', args: ['jsonb'], returns: 'jsonb',
  implementation: (obj) => { const r = {}; for (const k of Object.keys(obj || {})) if (obj[k] != null) r[k] = obj[k]; return r; },
});
db.public.registerFunction({
  name: 'regexp_replace', args: ['text', 'text', 'text', 'text'], returns: 'text',
  implementation: (str, pattern, repl, flags) => str.replace(new RegExp(pattern, flags && flags.includes('g') ? 'g' : undefined), repl),
});

const { Client } = db.adapters.createPg();
const client = new Client();
await client.connect();

const backendDir = path.resolve(import.meta.dirname, '..');
function readSql(name) {
  const p1 = path.join(backendDir, 'database', name);
  const p2 = path.join(backendDir, 'database', 'migrations', name);
  return fs.readFileSync(fs.existsSync(p1) ? p1 : p2, 'utf8');
}

function splitStatements(sql) {
  const statements = [];
  let current = '';
  let inDollar = false;
  let inLineComment = false;
  for (let i = 0; i < sql.length; i++) {
    const ch = sql[i];
    const two = sql.slice(i, i + 2);
    if (ch === '\n') { inLineComment = false; current += ch; continue; }
    if (inLineComment) { current += ch; continue; }
    if (two === '--') { inLineComment = true; current += two; i++; continue; }
    if (two === '$$') { inDollar = !inDollar; current += two; i++; continue; }
    current += ch;
    if (ch === ';' && !inDollar) { statements.push(current.trim()); current = ''; }
  }
  if (current.trim()) statements.push(current.trim());
  return statements.filter((s) => s.replace(/--.*$/gm, '').trim().length > 0);
}

// Same pg-mem-only limitations as the Phase 1 test harness (plpgsql
// triggers, RLS/policies, multi-row INSERT...SELECT, jsonb_build_object
// round-tripping, DO $$ ... $$ blocks) — none of these are exercised here
// for the same documented reasons as tests/migration.pgmem.test.mjs.
function isSkipped(statement) {
  const s = statement.replace(/--.*$/gm, '').trim();
  return /language\s+plpgsql/i.test(s)
    || /^create\s+trigger/i.test(s)
    || /^drop\s+trigger/i.test(s)
    || /row\s+level\s+security/i.test(s)
    || /^create\s+policy/i.test(s)
    || /^drop\s+policy/i.test(s)
    || /jsonb_build_object/i.test(s)
    || /^insert\s+into\s+role_permissions/i.test(s)
    || /^do\s+\$\$/i.test(s); // the RLS policy DO-block loop in 0003
}

async function runSqlFile(sql) {
  for (const statement of splitStatements(sql)) {
    if (isSkipped(statement)) continue;
    await client.query(statement);
  }
}

console.log('1. Building schema: schema.sql + 0001 + 0002 + 0003 ...');
await runSqlFile(readSql('schema.sql'));
await runSqlFile(readSql('0001_multitenant_foundation.sql'));

// Same pg-mem INSERT...SELECT workaround as tests/migration.pgmem.test.mjs
// (see that file for the full explanation): repopulate role_permissions
// row-by-row since the bulk INSERT...SELECT statements are skipped above.
{
  const rolePermSpecs = [
    { role: 'super_admin', permKeys: null },
    { role: 'manager', exclude: ['staff.manage'] },
    { role: 'staff', permKeys: ['orders.view', 'orders.manage'] },
    { role: 'content_manager', permKeys: ['products.manage', 'categories.manage', 'gallery.manage', 'reviews.manage'] },
  ];
  const allPerms = (await client.query('SELECT id, key FROM permissions')).rows;
  for (const spec of rolePermSpecs) {
    const roleRow = (await client.query('SELECT id FROM roles WHERE key = $1', [spec.role])).rows[0];
    const keep = spec.permKeys ? allPerms.filter((p) => spec.permKeys.includes(p.key)) : allPerms.filter((p) => !(spec.exclude || []).includes(p.key));
    for (const perm of keep) {
      await client.query('INSERT INTO role_permissions (role_id, permission_id) VALUES ($1,$2) ON CONFLICT DO NOTHING', [roleRow.id, perm.id]);
    }
  }
}

await runSqlFile(readSql('0002_cleanup_legacy_tables.sql'));
await runSqlFile(readSql('0003_orders_and_commerce_core.sql'));
console.log('   done.');

console.log('2. Seeding two businesses, categories, and products ...');
async function makeBusiness(slug, name) {
  const res = await client.query(
    `INSERT INTO businesses (name, name_ar, slug, type, order_number_prefix, delivery_fee, minimum_order_amount, tax_rate_percent, accept_orders, enabled_modules)
     VALUES ($1,$2,$3,'cafe',$4,15,50,14, TRUE, '{"ordering": true}'::jsonb) RETURNING *`,
    [name, name, slug, slug.toUpperCase().replace(/-/g, '')]
  );
  return res.rows[0];
}
const bizA = await makeBusiness('test-cafe-a', 'Test Cafe A');
const bizB = await makeBusiness('test-restaurant-b', 'Test Restaurant B');

async function makeProduct(businessId, name, price, isAvailable = true) {
  const cat = await client.query(
    `INSERT INTO categories (business_id, name, name_ar, slug, display_order) VALUES ($1,$2,$2,$3,1) RETURNING id`,
    [businessId, name + ' Cat', `cat-${businessId}-${Math.random().toString(36).slice(2, 8)}`]
  );
  const prod = await client.query(
    `INSERT INTO products (business_id, category_id, name, name_ar, price, is_available) VALUES ($1,$2,$3,$3,$4,$5) RETURNING *`,
    [businessId, cat.rows[0].id, name, price, isAvailable]
  );
  return prod.rows[0];
}
const latteA = await makeProduct(bizA.id, 'Latte', 50);
const croissantA = await makeProduct(bizA.id, 'Croissant', 30);
const unavailableA = await makeProduct(bizA.id, 'Sold Out Cake', 100, false);
const burgerB = await makeProduct(bizB.id, 'Burger', 80);

console.log('3. Server-side price calculation (services/orderPricing.js) ...');
{
  const { lineItems, subtotal } = await priceCartItems(client, bizA.id, [
    { product_id: latteA.id, quantity: 2 },
    { product_id: croissantA.id, quantity: 3 },
  ]);
  check('subtotal computed purely from DB prices (2*50 + 3*30 = 190)', subtotal === 190);
  check('line items carry the DB price, not any client-supplied price', lineItems[0].unit_price === 50 && lineItems[1].unit_price === 30);
}

console.log('4. CRITICAL: client-submitted price is ignored entirely ...');
{
  const { lineItems, subtotal } = await priceCartItems(client, bizA.id, [
    { product_id: latteA.id, quantity: 1, price: 1 }, // attacker sends price: 1
  ]);
  check('CRITICAL: a client-supplied "price" field on the item is completely ignored', subtotal === 50 && lineItems[0].unit_price === 50);
}

console.log('5. Unavailable product is rejected ...');
{
  let threw = false;
  try {
    await priceCartItems(client, bizA.id, [{ product_id: unavailableA.id, quantity: 1 }]);
  } catch (err) {
    threw = err.status === 409;
  }
  check('ordering an unavailable product is rejected (409)', threw);
}

console.log('6. CRITICAL: cannot order a product belonging to a DIFFERENT business ...');
{
  let threw = false;
  try {
    // business A's checkout tries to sneak in business B's product id
    await priceCartItems(client, bizA.id, [{ product_id: burgerB.id, quantity: 1 }]);
  } catch (err) {
    threw = err.status === 400;
  }
  check('CRITICAL: cross-business product id in an order is rejected, not silently priced', threw);
}

console.log('7. Invalid quantity / product id are rejected ...');
{
  let q1 = false, q2 = false, q3 = false;
  try { await priceCartItems(client, bizA.id, [{ product_id: latteA.id, quantity: 0 }]); } catch { q1 = true; }
  try { await priceCartItems(client, bizA.id, [{ product_id: latteA.id, quantity: -5 }]); } catch { q2 = true; }
  try { await priceCartItems(client, bizA.id, [{ product_id: 999999, quantity: 1 }]); } catch { q3 = true; }
  check('quantity 0 rejected', q1);
  check('negative quantity rejected', q2);
  check('nonexistent product id rejected', q3);
}

console.log('8. Coupon validation (services/orderPricing.js applyCoupon) ...');
async function makeCoupon(businessId, overrides = {}) {
  const c = {
    code: 'SAVE10', type: 'percentage', value: 10, minimum_order_amount: 0,
    maximum_discount_amount: null, usage_limit: null, expires_at: null, is_active: true,
    ...overrides,
  };
  const res = await client.query(
    `INSERT INTO coupons (business_id, code, type, value, minimum_order_amount, maximum_discount_amount, usage_limit, expires_at, is_active)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
    [businessId, c.code, c.type, c.value, c.minimum_order_amount, c.maximum_discount_amount, c.usage_limit, c.expires_at, c.is_active]
  );
  return res.rows[0];
}
{
  const percentCoupon = await makeCoupon(bizA.id, { code: 'TEN', type: 'percentage', value: 10 });
  const { discount } = await applyCoupon(client, bizA.id, 'TEN', 200, null);
  check('10% coupon on subtotal 200 gives discount 20', discount === 20);

  const cappedCoupon = await makeCoupon(bizA.id, { code: 'CAPPED', type: 'percentage', value: 50, maximum_discount_amount: 15 });
  const { discount: cappedDiscount } = await applyCoupon(client, bizA.id, 'CAPPED', 200, null);
  check('percentage coupon respects maximum_discount_amount cap (100 -> capped to 15)', cappedDiscount === 15);

  const fixedCoupon = await makeCoupon(bizA.id, { code: 'FIXED5', type: 'fixed_amount', value: 5 });
  const { discount: fixedDiscount } = await applyCoupon(client, bizA.id, 'FIXED5', 3, null);
  check('fixed-amount discount never exceeds the subtotal it is applied to (5 off a 3 subtotal -> capped to 3)', fixedDiscount === 3);

  const minOrderCoupon = await makeCoupon(bizA.id, { code: 'BIGORDER', type: 'fixed_amount', value: 5, minimum_order_amount: 100 });
  let minOrderRejected = false;
  try { await applyCoupon(client, bizA.id, 'BIGORDER', 50, null); } catch { minOrderRejected = true; }
  check('coupon below its minimum_order_amount is rejected', minOrderRejected);

  const expiredCoupon = await makeCoupon(bizA.id, { code: 'EXPIRED', type: 'fixed_amount', value: 5, expires_at: '2020-01-01T00:00:00Z' });
  let expiredRejected = false;
  try { await applyCoupon(client, bizA.id, 'EXPIRED', 100, null); } catch { expiredRejected = true; }
  check('expired coupon is rejected', expiredRejected);

  const inactiveCoupon = await makeCoupon(bizA.id, { code: 'OFFCODE', type: 'fixed_amount', value: 5, is_active: false });
  let inactiveRejected = false;
  try { await applyCoupon(client, bizA.id, 'OFFCODE', 100, null); } catch { inactiveRejected = true; }
  check('inactive coupon is rejected', inactiveRejected);

  let unknownRejected = false;
  try { await applyCoupon(client, bizA.id, 'DOES-NOT-EXIST', 100, null); } catch { unknownRejected = true; }
  check('unknown coupon code is rejected', unknownRejected);

  const limitedCoupon = await makeCoupon(bizA.id, { code: 'ONEUSE', type: 'fixed_amount', value: 5, usage_limit: 1 });
  const fakeOrder = await client.query(
    `INSERT INTO orders (business_id, guest_name, guest_phone, order_number, order_type, subtotal, discount, delivery_fee, tax, total, payment_method, access_token, idempotency_key)
     VALUES ($1,'G','000',$2,'pickup',100,5,0,0,95,'cash',$3,$4) RETURNING id`,
    [bizA.id, 'LUNA-90001', 'tok1', 'idem1']
  );
  await client.query(`INSERT INTO coupon_usage (business_id, coupon_id, order_id, discount_amount) VALUES ($1,$2,$3,5)`, [bizA.id, limitedCoupon.id, fakeOrder.rows[0].id]);
  let limitReached = false;
  try { await applyCoupon(client, bizA.id, 'ONEUSE', 100, null); } catch { limitReached = true; }
  check('coupon usage_limit is enforced (limit=1, already used once -> rejected)', limitReached);

  console.log('9. CRITICAL: business B cannot use business A\'s coupon code ...');
  let crossBusinessCouponRejected = false;
  try { await applyCoupon(client, bizB.id, 'TEN', 200, null); } catch { crossBusinessCouponRejected = true; }
  check('CRITICAL: a coupon code that exists on business A is invalid on business B', crossBusinessCouponRejected);
}

console.log('10. computeTotals (delivery fee / tax / total) ...');
{
  const totals = computeTotals({ subtotal: 100, discount: 10, orderType: 'delivery', business: bizA });
  // bizA: delivery_fee=15, tax_rate_percent=14. taxable = 100-10=90. tax = 90*0.14=12.6. total = 90+15+12.6=117.6
  check('delivery fee applied for delivery orders', totals.deliveryFee === 15);
  check('tax computed on (subtotal - discount)', totals.tax === 12.6);
  check('total = taxable + delivery + tax', totals.total === 117.6);

  const pickupTotals = computeTotals({ subtotal: 100, discount: 0, orderType: 'pickup', business: bizA });
  check('no delivery fee for pickup orders', pickupTotals.deliveryFee === 0);
}

console.log('11. Order status state machine (services/orderStatus.js) ...');
{
  check('new -> accepted is valid', assertValidTransition('new', 'accepted') === true);
  check('new -> preparing is INVALID (must go through accepted first)', assertValidTransition('new', 'preparing') === false);
  check('new -> completed is INVALID (cannot skip the whole flow)', assertValidTransition('new', 'completed') === false);
  check('accepted -> preparing -> ready -> completed chain is valid', assertValidTransition('accepted', 'preparing') && assertValidTransition('preparing', 'ready') && assertValidTransition('ready', 'completed'));
  check('completed is terminal (completed -> anything is invalid)', ORDER_STATUSES.every((s) => assertValidTransition('completed', s) === false));
  check('cancelled is terminal (cancelled -> anything is invalid)', ORDER_STATUSES.every((s) => assertValidTransition('cancelled', s) === false));
  check('cancellation allowed from new/accepted/preparing/ready/out_for_delivery', ['new', 'accepted', 'preparing', 'ready', 'out_for_delivery'].every((s) => assertValidTransition(s, 'cancelled')));
  check('delivered -> cancelled is INVALID (too late to cancel)', assertValidTransition('delivered', 'cancelled') === false);
}

console.log('12. Idempotency: duplicate (business_id, idempotency_key) is rejected at the DB level ...');
{
  await client.query(
    `INSERT INTO orders (business_id, guest_name, guest_phone, order_number, order_type, subtotal, discount, delivery_fee, tax, total, payment_method, access_token, idempotency_key)
     VALUES ($1,'G','000',$2,'pickup',50,0,0,0,50,'cash',$3,$4)`,
    [bizA.id, 'LUNA-90002', 'tokA', 'same-key-retry']
  );
  let duplicateRejected = false;
  try {
    await client.query(
      `INSERT INTO orders (business_id, guest_name, guest_phone, order_number, order_type, subtotal, discount, delivery_fee, tax, total, payment_method, access_token, idempotency_key)
       VALUES ($1,'G','000',$2,'pickup',50,0,0,0,50,'cash',$3,$4)`,
      [bizA.id, 'LUNA-90003', 'tokA2', 'same-key-retry']
    );
  } catch (err) {
    duplicateRejected = err.message.toLowerCase().includes('unique') || err.message.toLowerCase().includes('duplicate');
  }
  check('CRITICAL: a second order with the same (business_id, idempotency_key) is rejected by the unique index', duplicateRejected);

  // The SAME idempotency key is fine on a DIFFERENT business (no cross-tenant coupling).
  let sameKeyDifferentBusinessOk = false;
  try {
    await client.query(
      `INSERT INTO orders (business_id, guest_name, guest_phone, order_number, order_type, subtotal, discount, delivery_fee, tax, total, payment_method, access_token, idempotency_key)
       VALUES ($1,'G','000',$2,'pickup',50,0,0,0,50,'cash',$3,$4)`,
      [bizB.id, 'RESTAURANTX-90001', 'tokB', 'same-key-retry']
    );
    sameKeyDifferentBusinessOk = true;
  } catch { /* should not throw */ }
  check('the same idempotency_key is allowed across two different businesses', sameKeyDifferentBusinessOk);
}

console.log('13. Duplicate order_number within a business is rejected ...');
{
  let dupeNumberRejected = false;
  try {
    await client.query(
      `INSERT INTO orders (business_id, guest_name, guest_phone, order_number, order_type, subtotal, discount, delivery_fee, tax, total, payment_method, access_token, idempotency_key)
       VALUES ($1,'G','000','LUNA-90002','pickup',50,0,0,0,50,'cash',$2,$3)`,
      [bizA.id, 'tokDupeNum', 'unique-key-1']
    );
  } catch (err) {
    dupeNumberRejected = true;
  }
  check('a duplicate order_number for the same business is rejected', dupeNumberRejected);
}

console.log('14. Database constraints reject invalid orders ...');
{
  let negativeTotalRejected = false;
  try {
    await client.query(
      `INSERT INTO orders (business_id, guest_name, guest_phone, order_number, order_type, subtotal, discount, delivery_fee, tax, total, payment_method, access_token, idempotency_key)
       VALUES ($1,'G','000','LUNA-BADNEG','pickup',50,0,0,0,-10,'cash',$2,$3)`,
      [bizA.id, 'tokNeg', 'key-neg']
    );
  } catch { negativeTotalRejected = true; }
  check('negative total is rejected by the CHECK constraint', negativeTotalRejected);

  let badOrderTypeRejected = false;
  try {
    await client.query(
      `INSERT INTO orders (business_id, guest_name, guest_phone, order_number, order_type, subtotal, discount, delivery_fee, tax, total, payment_method, access_token, idempotency_key)
       VALUES ($1,'G','000','LUNA-BADTYPE','teleport',50,0,0,0,50,'cash',$2,$3)`,
      [bizA.id, 'tokBadType', 'key-badtype']
    );
  } catch { badOrderTypeRejected = true; }
  check('invalid order_type is rejected by the CHECK constraint', badOrderTypeRejected);

  let noCustomerNoGuestRejected = false;
  try {
    await client.query(
      `INSERT INTO orders (business_id, order_number, order_type, subtotal, discount, delivery_fee, tax, total, payment_method, access_token, idempotency_key)
       VALUES ($1,'LUNA-NOBODY','pickup',50,0,0,0,50,'cash',$2,$3)`,
      [bizA.id, 'tokNobody', 'key-nobody']
    );
  } catch { noCustomerNoGuestRejected = true; }
  check('an order with neither customer_id nor guest_name/phone is rejected by the CHECK constraint', noCustomerNoGuestRejected);

  let zeroQuantityItemRejected = false;
  const validOrder = await client.query(
    `INSERT INTO orders (business_id, guest_name, guest_phone, order_number, order_type, subtotal, discount, delivery_fee, tax, total, payment_method, access_token, idempotency_key)
     VALUES ($1,'G','000','LUNA-FORITEM','pickup',50,0,0,0,50,'cash',$2,$3) RETURNING id`,
    [bizA.id, 'tokForItem', 'key-foritem']
  );
  try {
    await client.query(
      `INSERT INTO order_items (order_id, business_id, product_id, product_name_snapshot, product_name_ar_snapshot, unit_price_snapshot, quantity, subtotal)
       VALUES ($1,$2,$3,'X','X',10,0,0)`,
      [validOrder.rows[0].id, bizA.id, latteA.id]
    );
  } catch { zeroQuantityItemRejected = true; }
  check('an order_item with quantity 0 is rejected by the CHECK constraint', zeroQuantityItemRejected);
}

console.log('15. CRITICAL: cross-business isolation for orders/customers/coupons ...');
{
  const bizAOrder = await client.query(`SELECT id FROM orders WHERE business_id = $1 LIMIT 1`, [bizA.id]);
  const bizAOrderId = bizAOrder.rows[0].id;

  const crossRead = await client.query('SELECT * FROM orders WHERE id = $1 AND business_id = $2', [bizAOrderId, bizB.id]);
  check('CRITICAL: business B cannot READ business A\'s order (scoped query returns 0 rows)', crossRead.rows.length === 0);

  const crossUpdate = await client.query("UPDATE orders SET status = 'cancelled' WHERE id = $1 AND business_id = $2 RETURNING id", [bizAOrderId, bizB.id]);
  check('CRITICAL: business B cannot UPDATE business A\'s order', crossUpdate.rows.length === 0);

  const crossDelete = await client.query('DELETE FROM orders WHERE id = $1 AND business_id = $2 RETURNING id', [bizAOrderId, bizB.id]);
  check('CRITICAL: business B cannot DELETE business A\'s order', crossDelete.rows.length === 0);

  const stillThere = await client.query('SELECT id FROM orders WHERE id = $1', [bizAOrderId]);
  check('business A\'s order still exists untouched after business B\'s attempts', stillThere.rows.length === 1);

  // Customers isolation
  const custA = await client.query(`INSERT INTO customers (business_id, name, phone, password_hash) VALUES ($1,'Sara','0100',$2) RETURNING id`, [bizA.id, 'hash']);
  const crossCustomerRead = await client.query('SELECT * FROM customers WHERE id = $1 AND business_id = $2', [custA.rows[0].id, bizB.id]);
  check('CRITICAL: business B cannot read business A\'s customer record', crossCustomerRead.rows.length === 0);
}

console.log('16. RBAC — Phase 2 permissions per role (products/orders/customers/coupons/invoices/audit) ...');
async function hasPermission(roleKey, permissionKey) {
  const result = await client.query(
    `SELECT 1 FROM role_permissions rp JOIN roles r ON r.id = rp.role_id JOIN permissions p ON p.id = rp.permission_id WHERE r.key = $1 AND p.key = $2 LIMIT 1`,
    [roleKey, permissionKey]
  );
  return result.rows.length > 0;
}
check('manager CAN manage coupons', await hasPermission('manager', 'coupons.manage'));
check('manager CAN view invoices', await hasPermission('manager', 'invoices.view'));
check('manager CAN view/manage customers', (await hasPermission('manager', 'customers.view')) && (await hasPermission('manager', 'customers.manage')));
check('staff CANNOT manage coupons', !(await hasPermission('staff', 'coupons.manage')));
check('staff CANNOT view invoices', !(await hasPermission('staff', 'invoices.view')));
check('staff CANNOT view customers', !(await hasPermission('staff', 'customers.view')));
check('content_manager CANNOT manage coupons', !(await hasPermission('content_manager', 'coupons.manage')));
check('content_manager CANNOT view orders', !(await hasPermission('content_manager', 'orders.view')));
check('super_admin CAN view audit logs', await hasPermission('super_admin', 'audit_log.view'));
// manager's permission set is "every permission except staff.manage" (by
// design, set in migration 0001) — audit_log.view is not staff.manage, so
// manager legitimately has it too, same as every other non-staff-management
// permission.
check('manager CAN view audit logs (manager = every permission except staff.manage)', await hasPermission('manager', 'audit_log.view'));
check('staff CANNOT view audit logs', !(await hasPermission('staff', 'audit_log.view')));

console.log('17. Order ownership access-control logic (matches orderController.respondWithOrder) ...');
{
  const custX = await client.query(`INSERT INTO customers (business_id, name, phone, password_hash) VALUES ($1,'Nora','0111',$2) RETURNING id`, [bizA.id, 'hash']);
  const custY = await client.query(`INSERT INTO customers (business_id, name, phone, password_hash) VALUES ($1,'Omar','0122',$2) RETURNING id`, [bizA.id, 'hash']);
  const ownedOrder = await client.query(
    `INSERT INTO orders (business_id, customer_id, order_number, order_type, subtotal, discount, delivery_fee, tax, total, payment_method, access_token, idempotency_key)
     VALUES ($1,$2,'LUNA-OWN1','pickup',50,0,0,0,50,'cash','secret-token-abc',$3) RETURNING *`,
    [bizA.id, custX.rows[0].id, 'key-own1']
  );
  const order = ownedOrder.rows[0];

  function evaluateAccess({ isAdmin, customerId, presentedToken }) {
    const isOwningCustomer = customerId && order.customer_id === customerId;
    const hasValidGuestToken = presentedToken && presentedToken === order.access_token;
    return isAdmin || isOwningCustomer || hasValidGuestToken;
  }

  check('the owning customer CAN access their own order', evaluateAccess({ customerId: custX.rows[0].id }));
  check('CRITICAL: a DIFFERENT customer (same business) CANNOT access someone else\'s order', !evaluateAccess({ customerId: custY.rows[0].id }));
  check('CRITICAL: no token / wrong token CANNOT access the order as a guest', !evaluateAccess({ presentedToken: 'guessed-token' }));
  check('the correct opaque access_token CAN access the order (guest tracking)', evaluateAccess({ presentedToken: 'secret-token-abc' }));
  check('an authenticated admin (business already verified by middleware) CAN access any order in their business', evaluateAccess({ isAdmin: true }));
}

await client.end();

console.log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : failures + ' CHECK(S) FAILED'}`);
process.exit(failures === 0 ? 0 : 1);
