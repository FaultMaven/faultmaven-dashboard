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
   * Present in the response, and no longer caller-controlled — but still NOT
   * rendered, now as a product choice rather than a mitigation.
   *
   * The backend computes it as `client_names.get(client_id, client_id)`. That
   * fallback used to be reachable by ANY string, because GET
   * /auth/oauth/authorize validated neither `client_id` nor `redirect_uri`, so a
   * crafted `?client_id=` could choose the heading on the one screen whose job is
   * telling the user who is asking. The GET now rejects unknown clients with a
   * 400 (faultmaven#1053), so the fallback can only yield an id an operator put
   * in `oauth_allowed_clients`.
   *
   * So rendering it would be safe today. It stays off the screen because a fixed
   * heading is not worse for the two clients that have real names, and turning it
   * on is a deliberate decision to take rather than a default to drift into.
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
    throw new Error(messageForFailure(response, 'Failed to fetch OAuth consent data'));
  }

  return response.json();
}

/**
 * Turn a failed authorize/approval response into a message worth showing.
 *
 * This used to read `error_description` off the body. Nothing ever sets it:
 * both endpoints raise FastAPI `HTTPException`, so the body is `{"detail": ...}`,
 * and the routes catch `InvalidRequestError` themselves rather than letting a
 * handler reshape it into the OAuth `{error, error_description}` form. Every
 * refusal therefore fell through to the caller's generic fallback — including,
 * after faultmaven#1053, the precise 400 the server now returns for an unknown
 * client or an unlisted redirect target.
 *
 * The `detail` string is still not surfaced. It interpolates the caller's own
 * values — `Unknown client_id: <raw>`, `Invalid redirect_uri: <raw>` — so
 * rendering it would put an attacker-chosen string on the dashboard's origin,
 * which is precisely why `client_name` stays off the consent screen. React
 * escapes it, so that is phishing text rather than injection, and a refusal page
 * is a weaker lure than a consent heading — but the user cannot act on the raw
 * value either way, so there is nothing to buy with it. The status says what to
 * do next; the specifics stay in the server log.
 */
function messageForFailure(response: Response, fallback: string): string {
  switch (response.status) {
    case 400:
      return 'This authorization request was rejected. The application asking for access, or the address it wants to return you to, is not one this FaultMaven deployment recognises.';
    case 401:
      return 'Your session is no longer valid. Sign in again to authorize this application.';
    case 429:
      return 'Too many authorization attempts. Wait a moment, then try again.';
    case 503:
      return 'OAuth is not enabled on this FaultMaven deployment.';
    default:
      return fallback;
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
    throw new Error(messageForFailure(response, 'Failed to submit OAuth approval'));
  }

  return response.json();
}
