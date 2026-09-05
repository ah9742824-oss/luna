// CORS handling. We use Bearer-token auth (not cookies), so this is safe
// without Access-Control-Allow-Credentials — but we still avoid a bare "*"
// so the API only serves configured frontend origins by default.
//
// SECURITY FIX (Phase 7 audit): the original version only ever allowed a
// single origin from CLIENT_URL. That's a real gap for this project's own
// stated architecture — ONE reusable backend is meant to serve MANY client
// frontends (section 74/81), each realistically on its own domain
// (client-a.pages.dev, client-b.example.com, ...). A single-origin CORS
// policy would silently break every business except whichever one
// happened to be configured last. CLIENT_URL now accepts a comma-separated
// list of allowed origins, and the request's actual Origin header is
// checked against that list before being echoed back — never reflecting
// an arbitrary Origin unconditionally (that would defeat the point of an
// allowlist).
const DEV_FALLBACK_ORIGIN = 'http://localhost:5173';

function parseAllowedOrigins(env) {
  const raw = env.CLIENT_URL || DEV_FALLBACK_ORIGIN;
  return raw.split(',').map((o) => o.trim()).filter(Boolean);
}

function resolveAllowedOrigin(env, requestOrigin) {
  const allowed = parseAllowedOrigins(env);
  if (requestOrigin && allowed.includes(requestOrigin)) return requestOrigin;
  // No match (or no Origin header, e.g. a server-to-server call like a
  // payment webhook): fall back to the first configured origin. This
  // never widens access — a browser enforces CORS using its own real
  // Origin, so a mismatched fallback value here simply means that
  // browser's request gets correctly blocked by the browser itself.
  return allowed[0];
}

function buildCorsHeaders(env, requestOrigin) {
  return {
    'Access-Control-Allow-Origin': resolveAllowedOrigin(env, requestOrigin),
    'Access-Control-Allow-Methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Business-Slug, Idempotency-Key',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin',
  };
}

// Wraps any Response with the CORS headers above.
export function withCors(response, env, request) {
  const headers = new Headers(response.headers);
  const requestOrigin = request?.headers?.get('Origin');
  for (const [key, value] of Object.entries(buildCorsHeaders(env, requestOrigin))) {
    headers.set(key, value);
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

// Handles the browser's CORS preflight (OPTIONS) request.
export function handlePreflight(env, request) {
  const requestOrigin = request?.headers?.get('Origin');
  return new Response(null, { status: 204, headers: buildCorsHeaders(env, requestOrigin) });
}
