// Sensitive-admin-action audit trail (section 58). Call this from within the
// SAME transaction/client as the action being logged whenever possible, so
// the audit entry and the change it describes commit or roll back together.
//
// profileId is null for actions taken by an unauthenticated customer (e.g.
// placing an order) — audit_logs.profile_id is nullable specifically for
// that case; resourceType/action still identify what happened.
export async function logAudit(client, { businessId, profileId = null, action, resourceType, resourceId = null, metadata = {} }) {
  await client.query(
    `INSERT INTO audit_logs (business_id, profile_id, action, resource_type, resource_id, metadata)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [businessId, profileId, action, resourceType, resourceId ? String(resourceId) : null, JSON.stringify(metadata)]
  );
}
