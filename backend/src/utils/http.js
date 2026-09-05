// Small shared helpers used by every route handler.

// Builds a JSON Response the same way res.json(data) used to.
export function json(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...extraHeaders },
  });
}

// Thrown by controllers for expected error cases (bad input, not found, etc).
// Caught centrally in worker.js and turned into a clean JSON error response.
export class HttpError extends Error {
  constructor(status, message, code) {
    super(message);
    this.status = status;
    this.code = code;
  }
}
