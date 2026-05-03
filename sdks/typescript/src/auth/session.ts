import { isJwtExpired, jwtExpiresIn } from './jwt.js';

const FIVE_MINUTES_MS = 5 * 60 * 1000;

export interface SessionTokenManagerOptions {
  /** Web Storage implementation; defaults to `globalThis.sessionStorage` if available, else in-memory. */
  storage?: Storage;
  /** Key under which the token is stored. Defaults to `'clawdb_token'`. */
  tokenKey?: string;
  /** Whether to automatically schedule token refresh before expiry. Defaults to `true`. */
  autoRefresh?: boolean;
}

class MemoryStorage implements Storage {
  private store = new Map<string, string>();
  get length() { return this.store.size; }
  clear() { this.store.clear(); }
  getItem(key: string) { return this.store.get(key) ?? null; }
  key(index: number) { return [...this.store.keys()][index] ?? null; }
  removeItem(key: string) { this.store.delete(key); }
  setItem(key: string, value: string) { this.store.set(key, value); }
}

/**
 * Manages JWT token storage and optional auto-refresh in browser and edge environments.
 */
export class SessionTokenManager {
  private readonly storage: Storage;
  private readonly tokenKey: string;
  private readonly autoRefresh: boolean;
  private refreshTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(options: SessionTokenManagerOptions = {}) {
    this.tokenKey = options.tokenKey ?? 'clawdb_token';
    this.autoRefresh = options.autoRefresh ?? true;

    if (options.storage) {
      this.storage = options.storage;
    } else if (typeof globalThis.sessionStorage !== 'undefined') {
      this.storage = globalThis.sessionStorage;
    } else {
      this.storage = new MemoryStorage();
    }
  }

  /** Returns the currently stored token, or null if none is stored. */
  get(): string | null {
    return this.storage.getItem(this.tokenKey);
  }

  /** Stores a new token and (if autoRefresh is enabled) reschedules the refresh timer. */
  set(token: string): void {
    this.storage.setItem(this.tokenKey, token);
    if (this.autoRefresh && this.refreshTimer !== null) {
      clearTimeout(this.refreshTimer);
      this.refreshTimer = null;
    }
  }

  /** Removes the stored token and cancels any pending refresh. */
  clear(): void {
    this.storage.removeItem(this.tokenKey);
    if (this.refreshTimer !== null) {
      clearTimeout(this.refreshTimer);
      this.refreshTimer = null;
    }
  }

  /**
   * Returns true if a token is stored and is not expired.
   */
  isValid(): boolean {
    const token = this.get();
    if (!token) return false;
    return !isJwtExpired(token);
  }

  /**
   * Schedules a refresh 5 minutes before the current token expires.
   * When the timer fires, calls `refreshFn`, updates the stored token,
   * and automatically re-schedules for the new token.
   */
  scheduleRefresh(refreshFn: () => Promise<string>): void {
    if (this.refreshTimer !== null) {
      clearTimeout(this.refreshTimer);
      this.refreshTimer = null;
    }

    const token = this.get();
    if (!token) return;

    const msUntilExpiry = jwtExpiresIn(token);
    const delay = msUntilExpiry - FIVE_MINUTES_MS;

    if (delay <= 0) {
      // Already close to or past expiry — refresh immediately
      void this.doRefresh(refreshFn);
      return;
    }

    this.refreshTimer = setTimeout(() => {
      void this.doRefresh(refreshFn);
    }, delay);
  }

  private async doRefresh(refreshFn: () => Promise<string>): Promise<void> {
    try {
      const newToken = await refreshFn();
      this.set(newToken);
      // Re-schedule for the new token
      this.scheduleRefresh(refreshFn);
    } catch {
      // Refresh failures are silent — callers should detect expiry via isValid()
    }
  }
}
