// Parses simple duration strings like "7d", "24h", "30m", "3600s" into seconds.
// Falls back to 7 days if the value is missing or not in a recognized format —
// used only for the JWT "exp" claim, never for anything security-critical
// beyond that expiry length.
export function parseDurationToSeconds(value) {
  const DEFAULT_SECONDS = 7 * 24 * 60 * 60; // 7 days
  if (!value || typeof value !== 'string') return DEFAULT_SECONDS;

  const match = value.trim().match(/^(\d+)\s*(s|m|h|d)$/i);
  if (!match) return DEFAULT_SECONDS;

  const amount = Number(match[1]);
  const unit = match[2].toLowerCase();
  const unitSeconds = { s: 1, m: 60, h: 3600, d: 86400 }[unit];
  return amount * unitSeconds;
}
