/**
 * OAuth API Client
 *
 * Handles OAuth authorization flow between Dashboard and Extension.
 * Dashboard acts as the Identity Provider (IdP) for the browser extension.
 */

import config from '../../config';
import { authManager } from '../auth';

/**
 * Consent data as the backend ACTUALLY returns it — `AuthorizationConsentRequest`
 * (faultmaven `modules/auth/api/oauth.py:83`). Flat, and deliberately narrow.
 *
 * This previously declared a nested `user: {email, display_name}` plus
 * `code_challenge` / `code_challenge_method`, none of which that endpoint sends.
 * Two consequences, both live: `consent.user.display_name` threw on render
 * ("Cannot read properties of undefined"), and `handleApprove` would have POSTed
 * `undefined` PKCE values had the render survived (copilot#185).
 *
 * The missing pieces come from where they actually live, not from here:
 * the PKCE parameters are the extension's own request, echoed in the URL; the
 * display identity comes from the dashboard's authenticated session — the same
 * session the backend authorized this request with.
 */
export interface OAuthConsentData {
  client_id: string;
  /**
   * Present in the response, but deliberately NOT rendered.
   *
   * The backend computes it as `client_names.get(client_id, client_id)` and
   * GET /auth/oauth/authorize validates neither `client_id` nor `redirect_uri`
   * — so for any unknown client this is the caller's own raw string. Showing it
   * would let a crafted `?client_id=` choose the heading on the one screen whose
   * job is telling the user who is asking. React escapes it, so this is
   * phishing text rather than injection, but it is still worse than the fixed
   * heading it would replace.
   *
   * The fix belongs server-side (reject unknown client_ids on the GET) and is
   * filed there; until then the heading stays fixed. Typed here because the
   * field genuinely is in the response.
   */
  client_name: string;
  redirect_uri: string;
  scope: string;
  state: string;
  user_id: string;
  username: string;
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
