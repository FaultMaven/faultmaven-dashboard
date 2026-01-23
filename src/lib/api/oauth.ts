/**
 * OAuth API Client
 *
 * Handles OAuth authorization flow between Dashboard and Extension.
 * Dashboard acts as the Identity Provider (IdP) for the browser extension.
 */

import config from '../../config';

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
  const response = await fetch(`${apiUrl}/auth/oauth/authorize?${searchParams.toString()}`, {
    method: 'GET',
    credentials: 'include', // Send session cookie
    headers: {
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error_description || 'Failed to fetch OAuth consent data');
  }

  return response.json();
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
  const response = await fetch(`${apiUrl}/auth/oauth/authorize`, {
    method: 'POST',
    credentials: 'include', // Send session cookie
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(approval),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error_description || 'Failed to submit OAuth approval');
  }

  return response.json();
}
