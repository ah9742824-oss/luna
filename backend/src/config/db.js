// PostgreSQL access via Cloudflare Hyperdrive.
//
// Workers are stateless per-request, so we open a `pg` Client for each query
// using the connection string Hyperdrive provides on env.HYPERDRIVE, then
// close it before returning. Closing it (client.end()) terminates this
// Worker-to-Hyperdrive connection — it does NOT "return a connection to a
// pool" from the Worker's perspective. Hyperdrive maintains its own,
// separate pool of connections to Supabase behind the scenes regardless of
// how the Worker opens/closes connections to it; closing promptly here just
// avoids leaving idle connections open on the Worker side, which is the
// documented Cloudflare Hyperdrive + node-postgres usage pattern.
import { Client } from 'pg';

export async function withClient(env, callback) {
  if (!env.HYPERDRIVE || !env.HYPERDRIVE.connectionString) {
    throw new Error(
      'HYPERDRIVE binding is not configured. Add it under [[hyperdrive]] in wrangler.jsonc ' +
      'or in the Cloudflare dashboard under Workers > Settings > Bindings.'
    );
  }

  const client = new Client({ connectionString: env.HYPERDRIVE.connectionString });
  await client.connect();
  try {
    return await callback(client);
  } finally {
    await client.end();
  }
}

// Convenience wrapper for the common case of a single parameterized query.
export async function query(env, text, params = []) {
  return withClient(env, (client) => client.query(text, params));
}

// ----------------------------------------------------------------------------
// Multi-tenant security model
// ----------------------------------------------------------------------------
// Business isolation (section 8) is enforced at TWO independent layers:
//
//   1. APPLICATION LAYER (primary, always on): every controller that touches
//      a business-scoped table includes `WHERE business_id = $businessId` (or
//      equivalent) explicitly in its SQL, using the business resolved by
//      middleware/tenant.js from the authenticated request. This is the line
//      that must never be skipped, and it is what actually protects the data
//      even if RLS below were ever misconfigured or bypassed.
//
//   2. DATABASE LAYER (defense-in-depth): migration 0001 enables Postgres Row
//      Level Security with FORCE ROW LEVEL SECURITY on every business-scoped
//      table, with a policy keyed on the session GUC `app.current_business_id`.
//      withTenantClient() below sets that GUC with SET LOCAL at the start of
//      every tenant-scoped request, inside a transaction, so a bug that
//      forgets the WHERE clause in layer 1 still cannot leak cross-business
//      rows — Postgres itself rejects/filters the rows.
//
// IMPORTANT — RLS is only real protection if the Postgres role the Worker
// connects as is NOT a table owner and NOT a superuser (FORCE ROW LEVEL
// SECURITY does not apply to the table owner). Supabase's default
// `postgres` role owns every table and BYPASSES RLS entirely. Before
// relying on layer 2 in production, create a dedicated least-privilege role
// for Hyperdrive to connect as (see docs/DEPLOYMENT.md, "Database role for
// the Worker connection") and grant it only SELECT/INSERT/UPDATE/DELETE on
// the specific tables it needs — never table ownership.
//
// KNOWN LIMITATION (documented, not silently assumed away): every WRITE to
// an RLS-protected table in this codebase goes through withTenantClient/
// tenantQuery, so layer 2 is real for writes today. Most READS, however,
// currently go through the plain query()/withClient() below WITHOUT setting
// app.current_business_id — they rely entirely on layer 1 (their explicit
// `WHERE business_id = $1`). That is fine and intentional AS LONG AS the
// Worker's DB role still bypasses RLS (the current default). If you harden
// that role per the paragraph above, you must also switch every read that
// touches an RLS-protected table to tenantQuery/withTenantClient — otherwise
// those SELECTs will start returning zero rows once RLS is actually
// enforced. This is tracked as a Phase 7 (security hardening) follow-up
// rather than done now, to avoid a transaction-per-read performance cost
// for every public GET endpoint while RLS enforcement isn't even turned on.
export async function withTenantClient(env, businessId, callback) {
  if (!businessId || !Number.isInteger(Number(businessId))) {
    throw new Error('withTenantClient requires a resolved integer businessId.');
  }
  if (!env.HYPERDRIVE || !env.HYPERDRIVE.connectionString) {
    throw new Error(
      'HYPERDRIVE binding is not configured. Add it under [[hyperdrive]] in wrangler.jsonc ' +
      'or in the Cloudflare dashboard under Workers > Settings > Bindings.'
    );
  }

  const client = new Client({ connectionString: env.HYPERDRIVE.connectionString });
  await client.connect();
  try {
    await client.query('BEGIN');
    try {
      // set_config's third arg (is_local=true) behaves like SET LOCAL: scoped
      // to this transaction only, never leaks to a reused/pooled connection.
      await client.query('SELECT set_config($1, $2, true)', ['app.current_business_id', String(businessId)]);
      const result = await callback(client);
      await client.query('COMMIT');
      return result;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    }
  } finally {
    await client.end();
  }
}

// Convenience wrapper for a single parameterized query scoped to a business.
export async function tenantQuery(env, businessId, text, params = []) {
  return withTenantClient(env, businessId, (client) => client.query(text, params));
}
