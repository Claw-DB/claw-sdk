import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { parseApiKey, maskApiKey, isValidApiKeyFormat } from '../auth/api-key.js';
import { decodeJwt, isJwtExpired, jwtExpiresIn, getJwtClaims } from '../auth/jwt.js';
import { SessionTokenManager } from '../auth/session.js';

// ──────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────

function makeJwt(payload: object, exp?: number): string {
  const header = { alg: 'HS256', typ: 'JWT' };
  const now = Math.floor(Date.now() / 1000);
  const fullPayload = { sub: 'agent-1', iat: now, workspace_id: 'ws-1', role: 'assistant', scopes: [], exp: exp ?? now + 3600, ...payload };
  const b64 = (obj: object) =>
    btoa(JSON.stringify(obj)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
  return `${b64(header)}.${b64(fullPayload)}.fakesig`;
}

// ──────────────────────────────────────────────────────────────
// parseApiKey
// ──────────────────────────────────────────────────────────────

describe('parseApiKey', () => {
  it('parses a live key', () => {
    const result = parseApiKey('ck_live_abcdefgh12345678');
    expect(result).not.toBeNull();
    expect(result?.environment).toBe('live');
  });

  it('parses a test key', () => {
    const result = parseApiKey('ck_test_abcdefgh12345678');
    expect(result?.environment).toBe('test');
  });

  it('returns null for invalid prefix', () => {
    expect(parseApiKey('sk_live_abcdefgh12345678')).toBeNull();
  });

  it('returns null for too-short secret segment', () => {
    expect(parseApiKey('ck_live_short')).toBeNull();
  });

  it('returns null for empty string', () => {
    expect(parseApiKey('')).toBeNull();
  });

  it('returns null for non-string input', () => {
    // @ts-expect-error intentional wrong type
    expect(parseApiKey(12345)).toBeNull();
  });
});

// ──────────────────────────────────────────────────────────────
// maskApiKey
// ──────────────────────────────────────────────────────────────

describe('maskApiKey', () => {
  it('masks showing first 12 chars + dots', () => {
    const masked = maskApiKey('ck_live_abcdefgh12345678');
    expect(masked).toBe('ck_live_abcd••••••••');
    expect(masked.startsWith('ck_live_abcd')).toBe(true);
  });

  it('handles short string gracefully', () => {
    expect(maskApiKey('short')).toBe('••••••••••••');
  });
});

// ──────────────────────────────────────────────────────────────
// isValidApiKeyFormat
// ──────────────────────────────────────────────────────────────

describe('isValidApiKeyFormat', () => {
  it('returns true for valid live key', () => {
    expect(isValidApiKeyFormat('ck_live_abcdefgh12345678')).toBe(true);
  });

  it('returns true for valid test key', () => {
    expect(isValidApiKeyFormat('ck_test_abcdefgh12345678')).toBe(true);
  });

  it('returns false for invalid format', () => {
    expect(isValidApiKeyFormat('Bearer abc')).toBe(false);
    expect(isValidApiKeyFormat('')).toBe(false);
  });
});

// ──────────────────────────────────────────────────────────────
// decodeJwt
// ──────────────────────────────────────────────────────────────

describe('decodeJwt', () => {
  it('decodes a well-formed JWT', () => {
    const token = makeJwt({ workspace_id: 'ws-99', role: 'admin' });
    const decoded = decodeJwt(token);
    expect(decoded).not.toBeNull();
    expect(decoded?.payload.workspace_id).toBe('ws-99');
    expect(decoded?.payload.role).toBe('admin');
    expect(decoded?.raw).toBe(token);
  });

  it('returns null for malformed token (no dots)', () => {
    expect(decodeJwt('notajwt')).toBeNull();
  });

  it('returns null for non-JSON segment', () => {
    expect(decodeJwt('!!!.!!!.!!!')).toBeNull();
  });

  it('returns null for empty string', () => {
    expect(decodeJwt('')).toBeNull();
  });
});

// ──────────────────────────────────────────────────────────────
// isJwtExpired
// ──────────────────────────────────────────────────────────────

describe('isJwtExpired', () => {
  it('returns false for a future exp', () => {
    const token = makeJwt({}, Math.floor(Date.now() / 1000) + 3600);
    expect(isJwtExpired(token)).toBe(false);
  });

  it('returns true for a past exp', () => {
    const token = makeJwt({}, Math.floor(Date.now() / 1000) - 1);
    expect(isJwtExpired(token)).toBe(true);
  });

  it('returns true for unparseable token', () => {
    expect(isJwtExpired('garbage')).toBe(true);
  });

  it('uses mocked Date.now correctly', () => {
    const futureExp = Math.floor(Date.now() / 1000) + 100;
    const token = makeJwt({}, futureExp);
    // Advance time past expiry
    vi.setSystemTime(new Date((futureExp + 10) * 1000));
    expect(isJwtExpired(token)).toBe(true);
    vi.useRealTimers();
  });
});

// ──────────────────────────────────────────────────────────────
// getJwtClaims
// ──────────────────────────────────────────────────────────────

describe('getJwtClaims', () => {
  it('returns payload for a valid token', () => {
    const token = makeJwt({ scopes: ['read', 'write'] });
    const claims = getJwtClaims(token);
    expect(claims?.scopes).toEqual(['read', 'write']);
  });

  it('returns null for invalid token', () => {
    expect(getJwtClaims('bad')).toBeNull();
  });
});

// ──────────────────────────────────────────────────────────────
// SessionTokenManager
// ──────────────────────────────────────────────────────────────

describe('SessionTokenManager', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('returns null when no token is set', () => {
    const mgr = new SessionTokenManager();
    expect(mgr.get()).toBeNull();
  });

  it('stores and retrieves a token', () => {
    const mgr = new SessionTokenManager();
    const token = makeJwt({});
    mgr.set(token);
    expect(mgr.get()).toBe(token);
  });

  it('isValid returns true for a fresh token', () => {
    const mgr = new SessionTokenManager();
    mgr.set(makeJwt({}, Math.floor(Date.now() / 1000) + 3600));
    expect(mgr.isValid()).toBe(true);
  });

  it('isValid returns false for expired token', () => {
    const mgr = new SessionTokenManager();
    mgr.set(makeJwt({}, Math.floor(Date.now() / 1000) - 10));
    expect(mgr.isValid()).toBe(false);
  });

  it('clear removes the token', () => {
    const mgr = new SessionTokenManager();
    mgr.set(makeJwt({}));
    mgr.clear();
    expect(mgr.get()).toBeNull();
  });

  it('scheduleRefresh calls refreshFn near expiry', async () => {
    const exp = Math.floor(Date.now() / 1000) + 10 * 60; // 10 min from now
    const token = makeJwt({}, exp);
    const newToken = makeJwt({}, exp + 3600);

    const mgr = new SessionTokenManager({ autoRefresh: true });
    mgr.set(token);

    const refreshFn = vi.fn().mockResolvedValue(newToken);
    mgr.scheduleRefresh(refreshFn);

    // Advance to 5 min before expiry — timer should fire
    vi.advanceTimersByTime(5 * 60 * 1000 + 1);
    await Promise.resolve(); // flush microtask
    await Promise.resolve();

    expect(refreshFn).toHaveBeenCalledOnce();
    expect(mgr.get()).toBe(newToken);
  });

  it('uses provided storage', () => {
    const store = new Map<string, string>();
    const storage: Storage = {
      length: 0,
      clear: () => store.clear(),
      getItem: (k) => store.get(k) ?? null,
      key: () => null,
      removeItem: (k) => store.delete(k),
      setItem: (k, v) => store.set(k, v),
    };
    const mgr = new SessionTokenManager({ storage, tokenKey: 'my_token' });
    const token = makeJwt({});
    mgr.set(token);
    expect(store.get('my_token')).toBe(token);
  });
});
