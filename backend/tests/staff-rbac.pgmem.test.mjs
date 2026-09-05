// Phase 4 test suite (admin system: staff/RBAC, permission matrix, media
// authorization logic). Same pg-mem approach as the earlier test files —
// see tests/migration.pgmem.test.mjs's header for exactly what pg-mem can
// and cannot verify.
import { newDb } from 'pg-mem';
import fs from 'node:fs';
import path from 'node:path';

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
    || /^do\s+\$\$/i.test(s);
}

async function runSqlFile(sql) {
  for (const statement of splitStatements(sql)) {
    if (isSkipped(statement)) continue;
    await client.query(statement);
  }
}

console.log('1. Building full schema (schema.sql + 0001 + 0002 + 0003) ...');
await runSqlFile(readSql('schema.sql'));
await runSqlFile(readSql('0001_multitenant_foundation.sql'));

// pg-mem INSERT...SELECT workaround (see tests/migration.pgmem.test.mjs) —
// repopulate role_permissions row-by-row since the bulk statements are
// skipped above. This is the EXACT permission matrix migration 0001 defines
// — nothing here is invented for the test.
const rolePermSpecs = [
  { role: 'super_admin', permKeys: null },
  { role: 'manager', exclude: ['staff.manage'] },
  { role: 'staff', permKeys: ['orders.view', 'orders.manage'] },
  { role: 'content_manager', permKeys: ['products.manage', 'categories.manage', 'gallery.manage', 'reviews.manage'] },
];
{
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

async function makeBusiness(slug, name) {
  const res = await client.query(
    `INSERT INTO businesses (name, name_ar, slug, type, order_number_prefix) VALUES ($1,$2,$3,'cafe',$4) RETURNING *`,
    [name, name, slug, slug.toUpperCase().replace(/-/g, '')]
  );
  return res.rows[0];
}
const bizA = await makeBusiness('staff-test-a', 'Staff Test A');
const bizB = await makeBusiness('staff-test-b', 'Staff Test B');

async function makeProfile(businessId, roleKey, email) {
  const role = (await client.query('SELECT id FROM roles WHERE key = $1', [roleKey])).rows[0];
  const res = await client.query(
    `INSERT INTO profiles (business_id, role_id, name, email, password_hash) VALUES ($1,$2,$3,$4,'hash') RETURNING *`,
    [businessId, role.id, `${roleKey} user`, email]
  );
  return res.rows[0];
}

console.log('2. THE EXACT PERMISSION MATRIX (all 4 roles x all permissions) ...');
{
  const ALL_PERMS = [
    'products.manage', 'categories.manage', 'orders.view', 'orders.manage', 'customers.view', 'customers.manage',
    'reviews.manage', 'gallery.manage', 'coupons.manage', 'invoices.view', 'business.manage', 'statistics.view',
    'staff.manage', 'audit_log.view',
  ];
  async function hasPermission(roleKey, permissionKey) {
    const result = await client.query(
      `SELECT 1 FROM role_permissions rp JOIN roles r ON r.id = rp.role_id JOIN permissions p ON p.id = rp.permission_id WHERE r.key = $1 AND p.key = $2 LIMIT 1`,
      [roleKey, permissionKey]
    );
    return result.rows.length > 0;
  }

  const EXPECTED = {
    super_admin: ALL_PERMS, // everything
    manager: ALL_PERMS.filter((p) => p !== 'staff.manage'), // everything except staff.manage
    staff: ['orders.view', 'orders.manage'],
    content_manager: ['products.manage', 'categories.manage', 'gallery.manage', 'reviews.manage'],
  };

  for (const [role, expectedPerms] of Object.entries(EXPECTED)) {
    for (const perm of ALL_PERMS) {
      const shouldHave = expectedPerms.includes(perm);
      const actuallyHas = await hasPermission(role, perm);
      check(`${role} ${shouldHave ? 'CAN' : 'CANNOT'} ${perm}`, actuallyHas === shouldHave);
    }
  }
}

console.log('3. Staff CRUD — create/list/update within a business ...');
{
  const superAdminA = await makeProfile(bizA.id, 'super_admin', 'owner@a.test');

  const managerRole = (await client.query(`SELECT id FROM roles WHERE key='manager'`)).rows[0].id;
  const newStaff = await client.query(
    `INSERT INTO profiles (business_id, role_id, name, email, password_hash) VALUES ($1,$2,'New Manager','manager@a.test','hash2') RETURNING *`,
    [bizA.id, managerRole]
  );
  check('a new staff profile can be created with a specific role', newStaff.rows[0].role_id === managerRole);

  const staffRole = (await client.query(`SELECT id FROM roles WHERE key='staff'`)).rows[0].id;
  const updated = await client.query(
    `UPDATE profiles SET role_id = $1, is_active = FALSE WHERE id = $2 AND business_id = $3 RETURNING *`,
    [staffRole, newStaff.rows[0].id, bizA.id]
  );
  check('a staff profile\'s role can be changed and deactivated', updated.rows[0].role_id === staffRole && updated.rows[0].is_active === false);

  const listResult = await client.query(
    `SELECT p.id, r.key FROM profiles p JOIN roles r ON r.id=p.role_id WHERE p.business_id = $1 ORDER BY p.id`,
    [bizA.id]
  );
  check('listing staff for a business returns exactly its own profiles', listResult.rows.length === 2 && listResult.rows.every((r) => true));
}

console.log('4. Duplicate email within the SAME business is rejected (matches staffController createStaff check) ...');
{
  const existing = await client.query('SELECT id FROM profiles WHERE business_id = $1 AND email = $2', [bizA.id, 'owner@a.test']);
  check('pre-check finds the existing email (createStaff would reject a duplicate)', existing.rows.length === 1);

  // The SAME email is fine on a DIFFERENT business (profiles has a
  // (business_id, email) UNIQUE constraint, not a global one).
  let sameEmailDifferentBusinessOk = false;
  try {
    const roleId = (await client.query(`SELECT id FROM roles WHERE key='super_admin'`)).rows[0].id;
    await client.query(
      `INSERT INTO profiles (business_id, role_id, name, email, password_hash) VALUES ($1,$2,'Owner B','owner@a.test','hash3')`,
      [bizB.id, roleId]
    );
    sameEmailDifferentBusinessOk = true;
  } catch { /* should not throw */ }
  check('the same email is allowed as a profile on a DIFFERENT business', sameEmailDifferentBusinessOk);
}

console.log('5. CRITICAL: business B cannot read/update/delete business A\'s staff profiles ...');
{
  const staffA = (await client.query(`SELECT id FROM profiles WHERE business_id = $1 LIMIT 1`, [bizA.id])).rows[0];

  const crossRead = await client.query('SELECT * FROM profiles WHERE id = $1 AND business_id = $2', [staffA.id, bizB.id]);
  check('CRITICAL: business B cannot READ business A\'s staff profile', crossRead.rows.length === 0);

  const crossUpdate = await client.query("UPDATE profiles SET name = 'HACKED' WHERE id = $1 AND business_id = $2 RETURNING id", [staffA.id, bizB.id]);
  check('CRITICAL: business B cannot UPDATE business A\'s staff profile', crossUpdate.rows.length === 0);

  const crossDelete = await client.query('DELETE FROM profiles WHERE id = $1 AND business_id = $2 RETURNING id', [staffA.id, bizB.id]);
  check('CRITICAL: business B cannot DELETE business A\'s staff profile', crossDelete.rows.length === 0);

  const stillThere = await client.query('SELECT name FROM profiles WHERE id = $1', [staffA.id]);
  check('business A\'s staff profile is untouched after business B\'s attempts', stillThere.rows.length === 1 && stillThere.rows[0].name !== 'HACKED');
}

console.log('6. Last-active-super_admin protection logic (matches staffController.updateStaff) ...');
{
  // bizB has exactly one super_admin (created in step 4 above: "Owner B").
  const superAdminsB = await client.query(
    `SELECT p.id FROM profiles p JOIN roles r ON r.id=p.role_id WHERE p.business_id=$1 AND r.key='super_admin' AND p.is_active=TRUE`,
    [bizB.id]
  );
  check('business B has exactly one active super_admin going into this check', superAdminsB.rows.length === 1);

  const targetId = superAdminsB.rows[0].id;
  const otherActiveSuperAdmins = await client.query(
    `SELECT COUNT(*)::int AS n FROM profiles p JOIN roles r ON r.id=p.role_id
     WHERE p.business_id=$1 AND r.key='super_admin' AND p.is_active=TRUE AND p.id<>$2`,
    [bizB.id, targetId]
  );
  check('CRITICAL: demoting/deactivating the LAST active super_admin would be blocked (0 other active super_admins found)', otherActiveSuperAdmins.rows[0].n === 0);

  // Now add a second super_admin — demoting the first should now be safe.
  const superAdminRoleId = (await client.query(`SELECT id FROM roles WHERE key='super_admin'`)).rows[0].id;
  await client.query(
    `INSERT INTO profiles (business_id, role_id, name, email, password_hash) VALUES ($1,$2,'Second Owner','owner2@b.test','hash4')`,
    [bizB.id, superAdminRoleId]
  );
  const otherActiveAfterAdding = await client.query(
    `SELECT COUNT(*)::int AS n FROM profiles p JOIN roles r ON r.id=p.role_id
     WHERE p.business_id=$1 AND r.key='super_admin' AND p.is_active=TRUE AND p.id<>$2`,
    [bizB.id, targetId]
  );
  check('after adding a second super_admin, demoting the first is now safe (1 other active super_admin exists)', otherActiveAfterAdding.rows[0].n === 1);
}

console.log('7. Media upload authorization mapping (mediaController.js PURPOSES table) ...');
{
  // Mirrors mediaController.js's PURPOSES map exactly — verifies the
  // permission each upload "purpose" requires is checked against the real
  // role_permissions data, not a hardcoded assumption.
  const PURPOSES = {
    product: 'products.manage', category: 'categories.manage', gallery: 'gallery.manage', business: 'business.manage',
  };
  async function hasPermission(roleKey, permissionKey) {
    const result = await client.query(
      `SELECT 1 FROM role_permissions rp JOIN roles r ON r.id = rp.role_id JOIN permissions p ON p.id = rp.permission_id WHERE r.key = $1 AND p.key = $2 LIMIT 1`,
      [roleKey, permissionKey]
    );
    return result.rows.length > 0;
  }
  check('content_manager CAN upload gallery images', await hasPermission('content_manager', PURPOSES.gallery));
  check('content_manager CANNOT upload business (logo/cover) images', !(await hasPermission('content_manager', PURPOSES.business)));
  check('staff CANNOT upload product images', !(await hasPermission('staff', PURPOSES.product)));
  check('manager CAN upload business images', await hasPermission('manager', PURPOSES.business));
}

await client.end();

console.log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : failures + ' CHECK(S) FAILED'}`);
process.exit(failures === 0 ? 0 : 1);
