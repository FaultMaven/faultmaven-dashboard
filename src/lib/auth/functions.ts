// Authentication API functions

import config from '../../config';
import { authManager } from './AuthManager';
import { AuthenticationError, type AuthState } from './types';

/**
 * Development login (no password required)
 *
 * @param username - Username for dev login
 * @returns Authentication state with access token
 * @throws {AuthenticationError} If login fails
 */
export async function devLogin(username: string): Promise<AuthState> {
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

  const authState = await response.json();
  await authManager.saveAuthState(authState);
  return authState;
}

/**
 * Logout and clear authentication state
 *
 * Attempts to call logout endpoint and always clears local auth state.
 */
export async function logoutAuth(): Promise<void> {
  try {
    const token = await authManager.getAccessToken();
    if (token) {
      await fetch(`${config.apiUrl}/v1/auth/logout`, {
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
