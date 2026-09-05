// Real image upload to Supabase Storage (section 20). No fake/local-only
// upload path — if SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY aren't configured,
// this fails loudly (500 with a clear message) rather than pretending to
// succeed, per "No fake statistics, fake orders, or placeholder CRUD."
//
// The service-role key lives ONLY in Worker secrets (never sent to the
// frontend — section 51/80) and is used purely server-side to write to
// Storage on the admin's behalf after requireAuth + a permission check.
import { json, HttpError } from '../utils/http.js';
import { hasPermission } from '../middleware/permissions.js';

const ALLOWED_MIME_TYPES = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
};
const MAX_BYTES = 5 * 1024 * 1024; // 5MB
const BUCKET = 'business-media';

// purpose -> which permission gates uploading to that folder, and which
// folder it lands in. Deliberately whitelisted (not derived from client
// input) so a caller can't upload into an arbitrary path.
const PURPOSES = {
  product: { folder: 'products', permission: 'products.manage' },
  category: { folder: 'categories', permission: 'categories.manage' },
  gallery: { folder: 'gallery', permission: 'gallery.manage' },
  business: { folder: 'business', permission: 'business.manage' },
};

function base64ToBytes(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function randomFileId() {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

// POST /api/admin/uploads
// Body: { purpose: 'product'|'category'|'gallery'|'business', mime_type, content_base64 }
// Deliberately JSON+base64 rather than multipart/form-data — Cloudflare
// Workers' Request.formData() doesn't reliably stream large multipart
// bodies in every runtime context, and this keeps validation (size, MIME)
// simple and explicit before anything touches Storage.
export async function uploadMedia(request, env) {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new HttpError(500, 'Image upload is not configured on the server (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY missing).');
  }

  const body = await request.json().catch(() => ({}));
  const { purpose, mime_type: mimeType, content_base64: contentBase64 } = body;

  const purposeConfig = PURPOSES[purpose];
  if (!purposeConfig) {
    throw new HttpError(400, `purpose must be one of: ${Object.keys(PURPOSES).join(', ')}.`);
  }

  // Authorization depends on `purpose` (a product image needs
  // products.manage, a gallery image needs gallery.manage, etc.) so this is
  // checked here rather than via a single static requirePermission() on the
  // route — see middleware/permissions.js's hasPermission() docstring.
  const allowed = await hasPermission(env, request.user.roleKey, purposeConfig.permission);
  if (!allowed) {
    throw new HttpError(403, `Your role does not have the '${purposeConfig.permission}' permission required to upload ${purpose} images.`);
  }

  // Validate the ACTUAL MIME type against an allowlist — never trust a
  // client-supplied filename/extension alone (section 20, 97).
  const extension = ALLOWED_MIME_TYPES[mimeType];
  if (!extension) {
    throw new HttpError(400, `mime_type must be one of: ${Object.keys(ALLOWED_MIME_TYPES).join(', ')}.`);
  }
  if (typeof contentBase64 !== 'string' || contentBase64.length === 0) {
    throw new HttpError(400, 'content_base64 is required.');
  }

  let bytes;
  try {
    bytes = base64ToBytes(contentBase64);
  } catch {
    throw new HttpError(400, 'content_base64 is not valid base64.');
  }
  if (bytes.byteLength === 0) throw new HttpError(400, 'The uploaded file is empty.');
  if (bytes.byteLength > MAX_BYTES) throw new HttpError(400, `File too large — the limit is ${MAX_BYTES / (1024 * 1024)}MB.`);

  // Unique, server-generated filename — never the client's original
  // filename (section 97: "Do not trust original filenames"), and scoped
  // under this business's own folder (section 8 isolation applies to
  // storage paths too, not just DB rows).
  const path = `${request.business.id}/${purposeConfig.folder}/${randomFileId()}.${extension}`;

  const uploadResponse = await fetch(`${env.SUPABASE_URL}/storage/v1/object/${BUCKET}/${path}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      apikey: env.SUPABASE_SERVICE_ROLE_KEY,
      'Content-Type': mimeType,
      'x-upsert': 'false',
    },
    body: bytes,
  });

  if (!uploadResponse.ok) {
    const errText = await uploadResponse.text().catch(() => '');
    console.error('Supabase Storage upload failed:', uploadResponse.status, errText);
    throw new HttpError(502, 'Image upload to storage failed.');
  }

  // Public URL — requires the bucket to be configured as public in
  // Supabase (documented in backend/README.md, "Image uploads — Supabase
  // Storage setup"). Every image this system displays (products, gallery,
  // business logo/cover) is already public information shown on the
  // storefront, so this matches the existing trust model rather than
  // introducing a new one.
  const publicUrl = `${env.SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${path}`;
  return json({ success: true, data: { url: publicUrl, path } }, 201);
}
