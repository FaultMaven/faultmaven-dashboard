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

/**
 * Read the `roles` claim out of an access token, for display gating only.
 *
 * The stored `user` object is a login-time snapshot, and refresh replaces only
 * the tokens — so without this, a session that predates a role change keeps
 * showing (or hiding) operator UI indefinitely even though the refreshed token
 * already authorizes it. Neither backend grant path revokes tokens: the
 * standalone bootstrap self-heal and `promote_to_platform_admin.py` both leave
 * existing sessions running.
 *
 * No signature verification, deliberately: this only decides what the UI
 * OFFERS. Every request is independently authorized server-side, so a forged
 * local token buys a broken page, not access. Returns null on anything
 * malformed, so a bad token can never clear a valid role set.
 */
export function readRolesFromAccessToken(token: string): string[] | null {
  try {
    const payload = token.split('.')[1];
    if (!payload) return null;
    // base64url -> base64, then pad.
    const base64 = payload.replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), '=');
    const claims = JSON.parse(atob(padded)) as { roles?: unknown };
    if (!Array.isArray(claims.roles)) return null;
    return claims.roles.filter((r): r is string => typeof r === 'string');
  } catch {
    return null;
  }
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

  // Listeners notified whenever auth state is cleared — logout OR an
  // AuthManager-initiated wipe (e.g. a definitive refresh failure). React
  // context subscribes so it can drop its cached auth state and route back to
  // login instead of leaving the user on an error banner with stale
  // "authenticated" state; process-wide caches (e.g. available KB scopes)
  // subscribe so the next identity never sees the previous user's values.
  private authClearedListeners = new Set<() => void>();

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
   * Subscribe to auth-cleared events. The listener fires after storage is wiped
   * (logout or a definitive refresh failure). Returns an unsubscribe function.
   */
  onAuthCleared(listener: () => void): () => void {
    this.authClearedListeners.add(listener);
    return () => {
      this.authClearedListeners.delete(listener);
    };
  }

  private notifyAuthCleared(): void {
    for (const listener of this.authClearedListeners) {
      try {
        listener();
      } catch (error: unknown) {
        console.error('[AuthManager] auth-cleared listener failed:', error);
      }
    }
  }

  /**
   * Create/refresh the extension-bridge mirror (`fm_auth_state`).
   *
   * Only the copilot auth-bridge flow needs this localStorage key. A plain
   * dashboard session must NEVER create it, so that syncBridgeAuthState's
   * "update only when already present" guard keeps ordinary sessions from ever
   * mirroring tokens (incl. the refresh token) into plain localStorage. Call
   * this exclusively from the extension-login path.
   */
  writeBridgeAuthState(authState: AuthState): void {
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem('fm_auth_state', JSON.stringify(authState));
      }
    } catch {
      // localStorage unavailable/blocked — non-fatal.
    }
  }

  /**
   * Whether the extension-bridge mirror currently exists. Lets the
   * extension-login screen decide what to render without reading raw
   * localStorage at the call site.
   */
  hasBridgeAuthState(): boolean {
    try {
      return typeof localStorage !== 'undefined' && localStorage.getItem('fm_auth_state') !== null;
    } catch {
      return false;
    }
  }

  /**
   * Read the stored access token verbatim, WITHOUT triggering a refresh.
   *
   * For best-effort logout: getAccessToken would silently refresh an expired
   * session, minting a rotated refresh token only to discard it on logout and
   * leaving a live token orphaned server-side. Returns null when no session is
   * stored.
   */
  async peekAccessToken(): Promise<string | null> {
    const authState = await this.readState();
    return authState?.access_token ?? null;
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

      // Carry the refreshed token's roles onto the stored user. Without this
      // the UI keeps gating on whatever the roles were at login; see
      // readRolesFromAccessToken. Falls back to the existing roles when the
      // claim is absent or unparseable, so a malformed token cannot silently
      // strip a user's UI.
      const refreshedRoles = readRolesFromAccessToken(body.access_token);
      const next: AuthState = {
        ...authState,
        user: refreshedRoles
          ? { ...authState.user, roles: refreshedRoles }
          : authState.user,
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
    // Notify subscribers (React context, per-user caches) AFTER storage is wiped
    // so they observe a clean, logged-out world.
    this.notifyAuthCleared();
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
