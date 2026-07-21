// Authentication API functions

import config from '../../config';
import { authManager, deriveExpiresAt } from './AuthManager';
import { AuthenticationError, type AuthState } from './types';

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
  try {
    const token = await authManager.peekAccessToken();
    if (token) {
      await fetch(`${config.apiUrl}/api/v1/auth/logout`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
    }
  } catch (error) {
    console.error('Logout error:', error);
  } finally {
    await authManager.clearAuthState();
  }
}
