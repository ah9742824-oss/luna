// Small, dependency-free validation helpers shared by the controllers.
// None of these throw — callers decide what HttpError to raise.

export function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

// Category slugs: lowercase letters/numbers separated by single hyphens (e.g. "hot-drinks").
export function isValidSlug(value) {
  return typeof value === 'string' && /^[a-z0-9]+(-[a-z0-9]+)*$/.test(value);
}

export function isFiniteNumber(value) {
  if (typeof value === 'boolean' || value === '' || value === null || value === undefined) return false;
  return Number.isFinite(Number(value));
}

export function isNonNegativeNumber(value) {
  return isFiniteNumber(value) && Number(value) >= 0;
}

export function isPositiveInteger(value) {
  const n = Number(value);
  return Number.isInteger(n) && n > 0;
}

// For optional boolean fields: fine if omitted, must be a real boolean if present.
export function isBooleanIfProvided(value) {
  return value === undefined || typeof value === 'boolean';
}

export function isNumberIfProvided(value) {
  return value === undefined || value === null || isFiniteNumber(value);
}

export function isValidRating(value) {
  const n = Number(value);
  return Number.isInteger(n) && n >= 1 && n <= 5;
}

// For optional URL fields (cafe info, gallery images): fine if empty, must
// parse as a URL if a non-empty value was given.
export function isValidUrlIfProvided(value) {
  if (value === undefined || value === null || value === '') return true;
  try {
    new URL(value);
    return true;
  } catch {
    return false;
  }
}

// For optional email fields: fine if empty, must look like an email if a
// non-empty value was given. Deliberately simple (not RFC 5322-complete) —
// this is UX validation, not a security boundary.
export function isValidEmailIfProvided(value) {
  if (value === undefined || value === null || value === '') return true;
  return typeof value === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}
