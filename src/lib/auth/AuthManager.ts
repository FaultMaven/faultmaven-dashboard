// Authentication manager for handling auth state

import config from '../../config';
import type { AuthState } from './types';

// Refresh the access token this long before it actually expires so an in-flight
// request never races the expiry boundary.
const EXPIRY_SKEW_MS = 30_000;

/**
 * Convert the backend's `expires_in` (seconds) into an absolute `expires_at`
 * (epoch ms). Returns null when `expires_in` is missing or not a positive,
 * finite number — callers must treat that as an unusable token rather than
 * storing `Date.now() + NaN` (which makes every `Date.now() < expires_at`
 * check false and spins an endless refresh loop) or `Date.now() + 0` (an
 * instantly-expired token).
 */
export function deriveExpiresAt(expiresInSeconds: unknown): number | null {
  if (typeof expiresInSeconds !== 'number' || !Number.isFinite(expiresInSeconds)) {
    return null;
  }
  if (expiresInSeconds <= 0) {
    return null;
  }
  return Date.now() + expiresInSeconds * 1000;
}

// Access window.browser directly to avoid module load-time evaluation issues
// The storage adapter (lib/storage.ts) initializes window.browser as a side-effect
function getBrowserStorage() {
  if (typeof window === 'undefined') return undefined;
  return window.browser;
}

/**
 * Manages authentication state in browser storage
 *
 * Handles token storage, retrieval, silent refresh, expiry checking, and cleanup.
 */
export class AuthManager {
  // Dedupe concurrent refreshes: many requests can discover the expiry at once,
  // but only one /auth/refresh call should fire (rotation revokes the old token).
  private refreshInFlight: Promise<string | null> | null = null;

  constructor() {
    // Dev-mode assertion: Ensure storage adapter is initialized
    if (import.meta.env.DEV && typeof window !== 'undefined' && !getBrowserStorage()?.storage) {
      console.error(
        '❌ CRITICAL: Browser storage adapter not initialized! ' +
        'Auth will fail. Ensure lib/storage.ts is imported in main.tsx.'
      );
    }
  }

  /**
   * Save authentication state to browser storage
   */
  async saveAuthState(authState: AuthState): Promise<void> {
    const browser = getBrowserStorage();
    if (browser?.storage) {
      await browser.storage.local.set({ authState });
    }
    // Keep the extension-bridge copy current on every save — including token
    // rotation (#109).
    this.syncBridgeAuthState(authState);
  }

  /**
   * Mirror the current auth state into `fm_auth_state`, the localStorage key the
   * copilot's auth-bridge content script re-forwards to the extension.
   *
   * Written at login (LoginPage) but previously NOT on rotation, so after a
   * silent refresh the bridge still held the ORIGINAL — now-revoked — refresh
   * token. A dashboard reload then re-forwarded that revoked token and logged
   * the extension out (#109). Keeping it in sync means the bridge always forwards
   * the live token. Only UPDATE the key when it already exists (login creates it);
   * never create it here, so a non-bridge dashboard session stays untouched.
   */
  private syncBridgeAuthState(authState: AuthState): void {
    try {
      if (typeof localStorage !== 'undefined' && localStorage.getItem('fm_auth_state')) {
        localStorage.setItem('fm_auth_state', JSON.stringify(authState));
      }
    } catch {
      // localStorage unavailable/blocked — non-fatal; the bridge falls back to
      // its page-load read and the extension's own refresh path.
    }
  }

  /**
   * Read the raw stored auth state without any expiry handling.
   * Internal: callers that need a *valid* token use getAuthState/getAccessToken.
   */
  private async readState(): Promise<AuthState | null> {
    const browser = getBrowserStorage();
    try {
      if (browser?.storage) {
        const result = (await browser.storage.local.get(['authState'])) as { authState?: AuthState };
        return result.authState ?? null;
      }
    } catch (error: unknown) {
      console.error('[AuthManager] Failed to get auth state:', error);
    }
    return null;
  }

  /**
   * Retrieve a valid authentication state.
   *
   * If the access token is still fresh, returns it. If it is at/near expiry but
   * a refresh token is available, transparently refreshes first. Returns null
   * (and clears state) only when there is no session and no way to renew it —
   * the access token is short-lived and CANNOT be extended by activity, so
   * without this refresh the user is force-logged-out at expiry.
   */
  async getAuthState(): Promise<AuthState | null> {
    const authState = await this.readState();
    if (!authState) {
      return null;
    }

    // Still comfortably valid → use as-is.
    if (Date.now() < authState.expires_at - EXPIRY_SKEW_MS) {
      return authState;
    }

    // Expired or about to: try a silent refresh.
    if (authState.refresh_token) {
      const refreshed = await this.refreshTokens();
      if (refreshed) {
        return this.readState();
      }
      return null; // refreshTokens already cleared state on failure
    }

    // No refresh token (legacy session): nothing we can do — log out.
    await this.clearAuthState();
    return null;
  }

  /**
   * Exchange the stored refresh token for a new access + refresh token pair.
   *
   * Concurrent callers share a single in-flight request. Returns the new access
   * token on success, or null (after clearing auth state) if refresh is not
   * possible — the caller should then treat the user as logged out.
   */
  async refreshTokens(): Promise<string | null> {
    if (this.refreshInFlight) {
      return this.refreshInFlight;
    }
    this.refreshInFlight = this.doRefresh().finally(() => {
      this.refreshInFlight = null;
    });
    return this.refreshInFlight;
  }

  private async doRefresh(): Promise<string | null> {
    const authState = await this.readState();
    if (!authState?.refresh_token) {
      await this.clearAuthState();
      return null;
    }

    try {
      const response = await fetch(`${config.apiUrl}/api/v1/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refresh_token: authState.refresh_token }),
      });

      if (!response.ok) {
        // 401 → refresh token expired/revoked; any other failure is unrecoverable
        // here. Clear so the app routes back to login.
        await this.clearAuthState();
        return null;
      }

      const body = (await response.json()) as {
        access_token: string;
        expires_in: number;
        refresh_token: string;
      };

      const expiresAt = deriveExpiresAt(body.expires_in);
      if (!body.access_token || expiresAt === null) {
        // Malformed refresh response — storing it would mint a NaN/instantly-
        // stale token and re-enter refresh on the next request forever. Treat
        // as unrecoverable and route back to login instead of looping.
        await this.clearAuthState();
        return null;
      }

      const next: AuthState = {
        ...authState,
        access_token: body.access_token,
        refresh_token: body.refresh_token,
        expires_at: expiresAt,
      };
      await this.saveAuthState(next);
      return next.access_token;
    } catch (error: unknown) {
      // Network error — do NOT clear state (the session may still be valid once
      // connectivity returns); just report failure for this attempt.
      console.error('[AuthManager] Token refresh failed:', error);
      return null;
    }
  }

  /**
   * Clear authentication state from browser storage
   */
  async clearAuthState(): Promise<void> {
    const browser = getBrowserStorage();
    if (browser?.storage) {
      await browser.storage.local.remove(['authState']);
    }
    // Also drop the bridge copy so a dashboard logout / definitive refresh
    // rejection can't leave a revoked token for the bridge to re-forward (#109).
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.removeItem('fm_auth_state');
      }
    } catch {
      // localStorage unavailable/blocked — non-fatal.
    }
  }

  /**
   * Get current access token, refreshing transparently if needed.
   * Returns null if not authenticated or the session cannot be renewed.
   */
  async getAccessToken(): Promise<string | null> {
    const authState = await this.readState();
    if (!authState) {
      return null;
    }

    // Still fresh → use directly.
    if (Date.now() < authState.expires_at - EXPIRY_SKEW_MS) {
      return authState.access_token || null;
    }

    // Expired/near-expiry → renew if we can; refreshTokens returns the new
    // access token (or null after clearing state).
    if (authState.refresh_token) {
      return this.refreshTokens();
    }

    await this.clearAuthState();
    return null;
  }
}

/**
 * Singleton instance of AuthManager
 */
export const authManager = new AuthManager();
