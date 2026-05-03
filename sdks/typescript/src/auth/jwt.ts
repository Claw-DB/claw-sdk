export interface JwtPayload {
  sub: string;
  exp: number;
  iat: number;
  workspace_id: string;
  role: string;
  scopes: string[];
  [key: string]: unknown;
}

export interface DecodedJwt {
  header: object;
  payload: JwtPayload;
  raw: string;
}

function base64UrlDecode(input: string): string {
  // Normalise base64url → base64
  const base64 = input.replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), '=');
  if (typeof atob !== 'undefined') {
    return atob(padded);
  }
  // Node.js fallback
  return Buffer.from(padded, 'base64').toString('binary');
}

function decodeBase64UrlJson(segment: string): unknown {
  try {
    return JSON.parse(base64UrlDecode(segment));
  } catch {
    return null;
  }
}

/**
 * Decodes a JWT without cryptographic verification (for reading client-side claims).
 * Returns null if the token is malformed.
 */
export function decodeJwt(token: string): DecodedJwt | null {
  if (typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;

  const header = decodeBase64UrlJson(parts[0]!);
  const payload = decodeBase64UrlJson(parts[1]!);

  if (header === null || typeof header !== 'object' || Array.isArray(header)) return null;
  if (payload === null || typeof payload !== 'object' || Array.isArray(payload)) return null;

  const p = payload as Record<string, unknown>;
  if (typeof p['sub'] !== 'string') return null;
  if (typeof p['exp'] !== 'number') return null;
  if (typeof p['iat'] !== 'number') return null;

  return {
    header: header as object,
    payload: payload as JwtPayload,
    raw: token,
  };
}

/**
 * Returns true if the token's `exp` claim is in the past.
 * Returns true for unparseable tokens (fail-safe).
 */
export function isJwtExpired(token: string): boolean {
  const decoded = decodeJwt(token);
  if (!decoded) return true;
  return decoded.payload.exp * 1000 < Date.now();
}

/**
 * Returns milliseconds until the token expires.
 * Negative value means the token is already expired.
 * Returns -Infinity for unparseable tokens.
 */
export function jwtExpiresIn(token: string): number {
  const decoded = decodeJwt(token);
  if (!decoded) return -Infinity;
  return decoded.payload.exp * 1000 - Date.now();
}

/**
 * Returns the decoded payload or null if the token is unparseable.
 */
export function getJwtClaims(token: string): JwtPayload | null {
  return decodeJwt(token)?.payload ?? null;
}
