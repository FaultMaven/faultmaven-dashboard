// Shared API client utilities

import config from '../../config';
import { authManager, AuthenticationError } from '../auth';

/**
 * Make an authenticated API request
 *
 * Attaches the bearer access token. The backend derives the caller's identity
 * and roles from that verified JWT — the dashboard does NOT assert its own
 * identity via headers. (The former `X-User-ID`/`X-User-Roles` headers had zero
 * backend consumers and, being client-asserted, were a security smell.)
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

  const headers = new Headers(options.headers);
  headers.set('Authorization', `Bearer ${token}`);

  const fullUrl = url.startsWith('http') ? url : `${config.apiUrl}${url}`;

  const response = await fetch(fullUrl, {
    ...options,
    headers,
  });

  // Reactive refresh: the proactive skew in getAccessToken covers the common
  // case, but a 401 can still happen (clock skew, server-side revocation). Try
  // a single silent refresh + retry before surfacing the failure.
  if (response.status === 401) {
    const newToken = await authManager.refreshTokens();
    if (newToken) {
      headers.set('Authorization', `Bearer ${newToken}`);
      return fetch(fullUrl, { ...options, headers });
    }
  }

  return response;
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
