// Authentication API functions

import config from '../../config';
import { authManager, deriveExpiresAt } from './AuthManager';
import { AuthenticationError, type AuthState } from './types';
import { isSafeLogoutUrl } from './logoutUrl';

export type PublishableScope = 'personal' | 'team' | 'global';

interface AvailableScopesResponse {
  scopes: PublishableScope[];
}

/**
 * Fetch the KB scopes the current user can target when publishing a runbook.
 *
 * Backend gates by actual memberships (not AUTH_MODE), so this is the
 * single source of truth for which radio buttons / select options to render.
 */
export async function getAvailableScopes(): Promise<PublishableScope[]> {
  const token = await authManager.getAccessToken();
  if (!token) throw new AuthenticationError('Not authenticated');

  const response = await fetch(
    `${config.apiUrl}/api/v1/auth/me/available-scopes`,
    {
      method: 'GET',
      headers: { Authorization: `Bearer ${token}` },
    },
  );

  if (!response.ok) {
    throw new Error(`available-scopes fetch failed: ${response.status}`);
  }

  const body = (await response.json()) as AvailableScopesResponse;
  return body.scopes;
}

/** The tenant a session is bound to, as `/auth/me` names it. */
export interface AccountOrganization {
  organization_id: string;
  name: string;
}

export interface AccountProfile {
  user_id: string;
  username: string;
  email: string;
  display_name: string;
  roles: string[];
  /** Absent when there is no tenant worth naming, or its row was unreadable.
   *  Never a permission signal — `/auth/me` already succeeded. */
  organization: AccountOrganization | null;
}

/**
 * Fetch the signed-in account, including the organization it is bound to.
 *
 * Separate from the stored `AuthState.user`, which comes from the login
 * response and carries no organization *name* — only its id. This is the
 * canonical "who am I" read, and the only place the tenant is named.
 *
 * Called when the account menu opens rather than on every page load: the
 * organization is worth a request exactly when someone asks whose session
 * this is, and never otherwise.
 */
export async function getAccountProfile(): Promise<AccountProfile> {
  const token = await authManager.getAccessToken();
  if (!token) throw new AuthenticationError('Not authenticated');

  const response = await fetch(`${config.apiUrl}/api/v1/auth/me`, {
    method: 'GET',
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!response.ok) {
    throw new Error(`profile fetch failed: ${response.status}`);
  }

  return (await response.json()) as AccountProfile;
}

/**
 * Development login (no password required)
 *
 * @param username - Username for dev login
 * @returns Authentication state with access token
 * @throws {AuthenticationError} If login fails
 */
export async function devLogin(username: string): Promise<AuthState> {
  try {
    const response = await fetch(`${config.apiUrl}/api/v1/auth/dev-login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ username }),
    });

    if (!response.ok) {
      throw new AuthenticationError('Login failed');
    }

    // The backend returns expires_in (seconds) + refresh_token; derive the
    // absolute expires_at (epoch ms) that AuthManager checks. Previously the raw
    // response was stored verbatim, leaving expires_at undefined so the expiry
    // guard never fired (and there was no refresh_token to renew with).
    const body = await response.json();
    const expiresAt = deriveExpiresAt(body.expires_in);
    if (!body.access_token || expiresAt === null) {
      // A 2xx login that omits a usable token/expiry is a contract violation;
      // fail loudly instead of storing an instantly-stale session.
      throw new AuthenticationError('Login response missing a valid token');
    }
    const authState: AuthState = {
      ...body,
      expires_at: expiresAt,
    };
    await authManager.saveAuthState(authState);
    return authState;
  } catch (error) {
    // Enhanced error handling for network issues
    if (error instanceof TypeError && error.message.includes('fetch')) {
      throw new TypeError('Could not reach API. Is the backend running on port 8090?');
    }
    throw error;
  }
}

/**
 * Exchange an SSO completion code for a FaultMaven session (ADR-015).
 *
 * The backend's `/auth/sso/callback` redirects the browser to the dashboard
 * with a short-lived single-use `code`; this trades it for the standard token
 * response. The code is single-use and expires in ~60s, so any failure means
 * the user must restart the hosted-login flow — surfaced as an
 * AuthenticationError, never retried here.
 *
 * @param code - Single-use completion code from the SSO callback redirect
 * @returns Authentication state with access token (already persisted)
 * @throws {AuthenticationError} If the exchange fails
 */
export async function ssoExchange(code: string): Promise<AuthState> {
  const response = await fetch(`${config.apiUrl}/api/v1/auth/sso/exchange`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ code }),
  });

  if (!response.ok) {
    // The backend deliberately returns a uniform 401 for every failure mode
    // (expired/replayed code, deactivated user) — don't over-interpret.
    throw new AuthenticationError('Sign-in could not be completed');
  }

  // Same contract handling as devLogin: derive the absolute expires_at that
  // AuthManager's expiry guard checks from the backend's expires_in (seconds).
  const body = await response.json();
  const expiresAt = deriveExpiresAt(body.expires_in);
  if (!body.access_token || expiresAt === null) {
    throw new AuthenticationError('Login response missing a valid token');
  }
  const authState: AuthState = {
    ...body,
    expires_at: expiresAt,
  };
  await authManager.saveAuthState(authState);
  return authState;
}

/**
 * Logout and clear authentication state
 *
 * Attempts to call the logout endpoint best-effort and always clears local auth
 * state. Reads the RAW stored token (peekAccessToken) rather than
 * getAccessToken: the latter would silently refresh a near-expired session,
 * minting a rotated refresh token only to discard it on logout and leaving a
 * live token orphaned server-side. Sending a possibly-expired token is fine —
 * server-side logout is best-effort and the local state is cleared regardless.
 */
export async function logoutAuth(): Promise<void> {
  // Read before teardown — clearing the state destroys the URL along with it.
  // peek, not getAuthState: the latter would silently refresh a near-expired
  // session, and on one with no refresh token it clears the state outright —
  // destroying the URL this is here to read.
  let idpLogoutUrl: string | null = null;
  try {
    idpLogoutUrl = await authManager.peekIdpLogoutUrl();
  } catch (error) {
    // A state we cannot read costs single-logout, not the logout. Logged rather
    // than swallowed: today readState cannot throw, so silence here would mean
    // a future change quietly disabling single-logout with no signal at all.
    console.error('Could not read IdP logout URL; signing out locally only:', error);
  }

  try {
    const token = await authManager.peekAccessToken();
    if (token) {
      // X-Session-Id lets the server end the IdP session itself. That path does
      // not depend on the browser completing the redirect below, so a closed
      // tab no longer leaves the IdP session alive with nothing able to end it.
      const sessionId = await authManager.peekSessionId();
      await fetch(`${config.apiUrl}/api/v1/auth/logout`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          ...(sessionId ? { 'X-Session-Id': sessionId } : {}),
        },
      });
    }
  } catch (error) {
    console.error('Logout error:', error);
  } finally {
    await authManager.clearAuthState();
  }

  // Only after local state is gone. The IdP holds its own session cookie on its
  // own domain, which nothing here can clear: revoking our token leaves that
  // session live, so the next authorization request is answered without a
  // prompt — the account cannot be switched, and the next person at a shared
  // browser is one click from being signed back in.
  //
  // This navigates away, so it must be last: nothing after it is guaranteed to
  // run. Absent for dev/password logins and for sessions stored before the
  // backend sent this field, where the caller's own redirect still applies.
  if (isSafeLogoutUrl(idpLogoutUrl)) {
    window.location.assign(idpLogoutUrl);
  }
}

