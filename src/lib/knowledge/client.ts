// Shared API client utilities

import config from '../../config';
import { authManager, AuthenticationError } from '../auth';

/**
 * Make an authenticated API request
 *
 * Automatically includes authentication token and user ID headers.
 *
 * @param url - API endpoint URL (relative or absolute)
 * @param options - Fetch options
 * @returns Fetch response
 * @throws {AuthenticationError} If not authenticated
 */
export async function makeAuthenticatedRequest(
  url: string,
  options: RequestInit = {}
): Promise<Response> {
  const token = await authManager.getAccessToken();
  if (!token) {
    throw new AuthenticationError('Not authenticated');
  }

  const authState = await authManager.getAuthState();
  if (!authState) {
    throw new AuthenticationError('Not authenticated');
  }

  const headers = new Headers(options.headers);
  headers.set('Authorization', `Bearer ${token}`);
  headers.set('X-User-ID', authState.user.user_id);

  if (authState.user.roles) {
    headers.set('X-User-Roles', authState.user.roles.join(','));
  }

  const fullUrl = url.startsWith('http') ? url : `${config.apiUrl}${url}`;

  return fetch(fullUrl, {
    ...options,
    headers,
  });
}

/**
 * Build query parameters from object
 *
 * @param params - Object of query parameters
 * @returns URLSearchParams string
 */
export function buildQueryParams(params: Record<string, string | number | undefined>): string {
  const queryParams = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) {
      queryParams.set(key, value.toString());
    }
  }

  return queryParams.toString();
}
