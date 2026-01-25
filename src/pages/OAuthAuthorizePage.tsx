import { useState, useEffect, useRef } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import {
  getOAuthConsent,
  submitOAuthApproval,
  OAuthConsentData,
  OAuthApprovalResponse,
} from '../lib/api/oauth';
import { useAuth } from '../context/AuthContext';

export default function OAuthAuthorizePage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { authState } = useAuth();
  const [consent, setConsent] = useState<OAuthConsentData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [redirectUrl, setRedirectUrl] = useState<string | null>(null);
  const hasLoadedRef = useRef(false);

  useEffect(() => {
    // Redirect to login if not authenticated
    if (!authState) {
      // Save OAuth redirect for after login
      const oauthParams = searchParams.toString();
      sessionStorage.setItem('oauth_redirect_after_login', `/auth/authorize?${oauthParams}`);
      navigate('/login');
      return;
    }

    // Only load consent data once
    if (!hasLoadedRef.current) {
      hasLoadedRef.current = true;
      loadConsentData();
    }
  }, [authState]);

  async function loadConsentData() {
    try {
      setLoading(true);
      setError(null);

      const data = await getOAuthConsent(searchParams);

      // Check if auto-approved (dev mode)
      if ('code' in data && data.code) {
        const approvalResponse = data as OAuthApprovalResponse;
        redirectToExtension(approvalResponse);
        return;
      }

      // Show consent screen
      setConsent(data as OAuthConsentData);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load authorization request';
      setError(message);
    } finally {
      setLoading(false);
    }
  }

  async function handleApprove() {
    if (!consent) return;

    try {
      setSubmitting(true);
      setError(null);

      const approval = await submitOAuthApproval({
        approved: true,
        client_id: consent.client_id,
        redirect_uri: consent.redirect_uri,
        code_challenge: consent.code_challenge,
        code_challenge_method: consent.code_challenge_method,
        scope: consent.scope,
        state: consent.state,
      });

      if (approval.code && approval.state) {
        redirectToExtension(approval);
      } else if (approval.error) {
        setError(approval.error_description || 'Authorization failed');
        setSubmitting(false);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to authorize application';
      setError(message);
      setSubmitting(false);
    }
  }

  async function handleDeny() {
    if (!consent) return;

    try {
      setSubmitting(true);

      await submitOAuthApproval({
        approved: false,
        client_id: consent.client_id,
        redirect_uri: consent.redirect_uri,
        code_challenge: consent.code_challenge,
        code_challenge_method: consent.code_challenge_method,
        scope: consent.scope,
        state: consent.state,
      });

      // Redirect with error
      const errorUrl = `${consent.redirect_uri}?error=access_denied&error_description=User denied authorization&state=${consent.state}`;
      window.location.href = errorUrl;
    } catch (err) {
      // Even if backend call fails, redirect with error
      const errorUrl = `${consent.redirect_uri}?error=access_denied&error_description=User denied authorization&state=${consent.state}`;
      window.location.href = errorUrl;
    }
  }

  function redirectToExtension(approval: OAuthApprovalResponse) {
    // Get redirect_uri from URL params (works for both consent and auto-approval flows)
    const redirectUri = searchParams.get('redirect_uri');

    if (!redirectUri) {
      setError('Invalid authorization request: missing redirect_uri');
      setLoading(false);
      return;
    }

    if (!approval.code || !approval.state) {
      setError(`Invalid OAuth response from server. Missing ${!approval.code ? 'code' : 'state'}`);
      setLoading(false);
      return;
    }

    // Build URL with code and state parameters
    const callbackUrl = `${window.location.origin}${window.location.pathname}?code=${approval.code}&state=${approval.state}`;

    // Update the browser URL to include code and state
    // The extension will monitor for this and extract the code
    window.history.replaceState({}, '', callbackUrl);

    // Show success message
    setRedirectUrl(callbackUrl);
    setLoading(false);
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-blue-50 to-indigo-50">
        <div className="bg-white border border-gray-200 rounded-xl shadow-lg p-8 w-full max-w-md text-center">
          <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <h2 className="text-xl font-semibold text-gray-800">Loading authorization request...</h2>
        </div>
      </div>
    );
  }

  if (redirectUrl) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-blue-50 to-indigo-50">
        <div className="bg-white border border-gray-200 rounded-xl shadow-lg p-8 w-full max-w-md">
          <div className="w-16 h-16 bg-green-100 text-green-600 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M5 13l4 4L19 7"
              />
            </svg>
          </div>
          <h2 className="text-2xl font-bold text-gray-800 mb-2 text-center">Authorization Successful!</h2>
          <p className="text-gray-600 mb-6 text-center">
            Sign-in complete! This window will close automatically.
          </p>
          <div className="flex items-center justify-center">
            <div className="w-8 h-8 border-4 border-green-600 border-t-transparent rounded-full animate-spin"></div>
          </div>
          <p className="text-xs text-gray-500 text-center mt-4">
            Returning to FaultMaven Copilot...
          </p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-blue-50 to-indigo-50">
        <div className="bg-white border border-gray-200 rounded-xl shadow-lg p-8 w-full max-w-md">
          <div className="w-16 h-16 bg-red-100 text-red-600 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </div>
          <h2 className="text-2xl font-bold text-gray-800 mb-2 text-center">Authorization Error</h2>
          <p className="text-gray-600 mb-6 text-center">{error}</p>
          <button
            onClick={() => window.close()}
            className="w-full px-4 py-2 bg-gray-100 text-gray-700 font-medium rounded-lg hover:bg-gray-200 transition-colors"
          >
            Close Window
          </button>
        </div>
      </div>
    );
  }

  if (!consent) {
    return null;
  }

  const scopes = consent.scope.split(' ');

  return (
    <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-blue-50 to-indigo-50 p-4">
      <div className="bg-white border border-gray-200 rounded-xl shadow-lg p-8 w-full max-w-md">
        {/* Header */}
        <div className="text-center mb-6">
          <div className="w-16 h-16 bg-blue-600 rounded-xl flex items-center justify-center mx-auto mb-4">
            <svg className="w-10 h-10 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
              />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-gray-800 mb-2">Authorize FaultMaven Copilot</h1>
          <p className="text-gray-600">
            The FaultMaven browser extension is requesting access to your account.
          </p>
        </div>

        {/* User Info */}
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 mb-6">
          <div className="text-sm text-gray-600 mb-1">Signing in as:</div>
          <div className="font-semibold text-gray-800">{consent.user.display_name}</div>
          <div className="text-sm text-gray-600">{consent.user.email}</div>
        </div>

        {/* Permissions */}
        <div className="mb-6">
          <h3 className="font-semibold text-gray-800 mb-3">This application will be able to:</h3>
          <ul className="space-y-2">
            {scopes.includes('openid') && (
              <li className="flex items-start">
                <svg className="w-5 h-5 text-blue-600 mr-2 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                  <path
                    fillRule="evenodd"
                    d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                    clipRule="evenodd"
                  />
                </svg>
                <span className="text-gray-700">Access your user ID</span>
              </li>
            )}
            {scopes.includes('profile') && (
              <li className="flex items-start">
                <svg className="w-5 h-5 text-blue-600 mr-2 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                  <path
                    fillRule="evenodd"
                    d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                    clipRule="evenodd"
                  />
                </svg>
                <span className="text-gray-700">Access your profile information</span>
              </li>
            )}
            {scopes.includes('cases:read') && (
              <li className="flex items-start">
                <svg className="w-5 h-5 text-blue-600 mr-2 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                  <path
                    fillRule="evenodd"
                    d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                    clipRule="evenodd"
                  />
                </svg>
                <span className="text-gray-700">Read your cases</span>
              </li>
            )}
            {scopes.includes('cases:write') && (
              <li className="flex items-start">
                <svg className="w-5 h-5 text-blue-600 mr-2 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                  <path
                    fillRule="evenodd"
                    d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                    clipRule="evenodd"
                  />
                </svg>
                <span className="text-gray-700">Create and update cases</span>
              </li>
            )}
            {scopes.includes('knowledge:read') && (
              <li className="flex items-start">
                <svg className="w-5 h-5 text-blue-600 mr-2 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                  <path
                    fillRule="evenodd"
                    d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                    clipRule="evenodd"
                  />
                </svg>
                <span className="text-gray-700">Read knowledge base articles</span>
              </li>
            )}
            {scopes.includes('evidence:read') && (
              <li className="flex items-start">
                <svg className="w-5 h-5 text-blue-600 mr-2 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                  <path
                    fillRule="evenodd"
                    d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                    clipRule="evenodd"
                  />
                </svg>
                <span className="text-gray-700">Read evidence files</span>
              </li>
            )}
          </ul>
        </div>

        {/* Action Buttons */}
        <div className="flex gap-3">
          <button
            onClick={handleDeny}
            disabled={submitting}
            className="flex-1 px-4 py-3 bg-gray-100 text-gray-700 font-medium rounded-lg hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleApprove}
            disabled={submitting}
            className="flex-1 px-4 py-3 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {submitting ? 'Authorizing...' : 'Authorize'}
          </button>
        </div>

        {/* Security Note */}
        <p className="text-xs text-gray-500 text-center mt-6">
          This authorization expires in 7 days. You can revoke access anytime from your account settings.
        </p>
      </div>
    </div>
  );
}
