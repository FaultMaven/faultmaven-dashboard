/**
 * OAuth API Client
 *
 * Handles OAuth authorization flow between Dashboard and Extension.
 * Dashboard acts as the Identity Provider (IdP) for the browser extension.
 */

import config from '../../config';
import { authManager } from '../auth';

export interface OAuthConsentData {
  client_id: string;
  redirect_uri: string;
  scope: string;
  state: string;
  code_challenge: string;
  code_challenge_method: string;
  user: {
    user_id: string;
    username: string;
    email: string;
    display_name: string;
  };
}

export interface OAuthApprovalRequest {
  approved: boolean;
  client_id: string;
  redirect_uri: string;
  code_challenge: string;
  code_challenge_method: string;
  scope: string;
  state: string;
}

export interface OAuthApprovalResponse {
  code?: string;
  state?: string;
  error?: string;
  error_description?: string;
}

/**
 * Get OAuth consent data from backend.
 * Called when user lands on /auth/authorize with query params.
 *
 * @param searchParams - URL search params from authorization request
 * @returns Consent data to display to user, or auto-approval response
 */
export async function getOAuthConsent(
  searchParams: URLSearchParams
): Promise<OAuthConsentData | OAuthApprovalResponse> {
  const apiUrl = config.apiUrl;
  const authState = await authManager.getAuthState();

  const headers: HeadersInit = {
    'Content-Type': 'application/json',
  };

  // Add Authorization header if user is authenticated
  if (authState?.access_token) {
    headers['Authorization'] = `Bearer ${authState.access_token}`;
  }

  const response = await fetch(`${apiUrl}/api/v1/auth/oauth/authorize?${searchParams.toString()}`, {
    method: 'GET',
    credentials: 'include', // Send session cookie (if any)
    headers,
  });

  if (!response.ok) {
    throw new Error((await readErrorDescription(response)) || 'Failed to fetch OAuth consent data');
  }

  return response.json();
}

/**
 * Best-effort read of the OAuth `error_description` from an error response.
 * The body may be empty or non-JSON (gateway/proxy errors), so parsing is
 * guarded — an unguarded `response.json()` would throw and mask the real
 * HTTP failure with a "Unexpected end of JSON input" error.
 */
async function readErrorDescription(response: Response): Promise<string | undefined> {
  try {
    const body = (await response.json()) as { error_description?: string } | null;
    return body?.error_description;
  } catch {
    return undefined;
  }
}

/**
 * Submit OAuth approval decision to backend.
 *
 * @param approval - User's approval decision with authorization details
 * @returns Authorization code and state for redirect to extension
 */
export async function submitOAuthApproval(
  approval: OAuthApprovalRequest
): Promise<OAuthApprovalResponse> {
  const apiUrl = config.apiUrl;
  const authState = await authManager.getAuthState();

  const headers: HeadersInit = {
    'Content-Type': 'application/json',
  };

  // Add Authorization header if user is authenticated
  if (authState?.access_token) {
    headers['Authorization'] = `Bearer ${authState.access_token}`;
  }

  const response = await fetch(`${apiUrl}/api/v1/auth/oauth/authorize`, {
    method: 'POST',
    credentials: 'include', // Send session cookie (if any)
    headers,
    body: JSON.stringify(approval),
  });

  if (!response.ok) {
    throw new Error((await readErrorDescription(response)) || 'Failed to submit OAuth approval');
  }

  return response.json();
}
