const API_KEY_REGEX = /^ck_(live|test)_[A-Za-z0-9_-]{16,}$/;

export interface ParsedApiKey {
  prefix: string;
  environment: 'live' | 'test';
}

/**
 * Parses a ClawDB API key of the form `ck_live_...` or `ck_test_...`.
 * Returns null if the format is invalid.
 */
export function parseApiKey(raw: string): ParsedApiKey | null {
  if (typeof raw !== 'string') return null;
  const match = API_KEY_REGEX.exec(raw);
  if (!match) return null;
  const environment = match[1] as 'live' | 'test';
  // prefix = everything up to and including the environment segment
  const prefix = raw.slice(0, raw.indexOf('_', 3 + environment.length + 1) + 1);
  return { prefix: prefix.endsWith('_') ? prefix.slice(0, -1) : prefix, environment };
}

/**
 * Masks an API key showing only the first 12 characters followed by dots.
 * e.g. `ck_live_abcd1234` → `ck_live_abcd••••••••`
 */
export function maskApiKey(raw: string): string {
  if (typeof raw !== 'string' || raw.length < 12) return '••••••••••••';
  return raw.slice(0, 12) + '••••••••';
}

/**
 * Returns true iff the raw string matches the expected `ck_live_...` / `ck_test_...` format.
 */
export function isValidApiKeyFormat(raw: string): boolean {
  return typeof raw === 'string' && API_KEY_REGEX.test(raw);
}
