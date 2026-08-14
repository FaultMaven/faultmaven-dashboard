import { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { ssoExchange } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { invalidateAvailableScopes } from '../hooks/useAvailableScopes';

// Sanitized error slugs the backend SSO callback may emit. The producer side is
// the ERROR_* constants in sso_login_service.py, funnelled through its
// _dashboard_redirect() — the single writer of `?error=`. Anything not listed
// here renders the generic message; raw query content is never echoed.
//
// This pairing is a hand-maintained cross-repo contract: the slugs are query
// params on a 302, so they appear nowhere in openapi.json and the api-types
// drift gate does not cover them. A backend-side addition cannot turn this file
// red — sso_org_unmapped was added by faultmaven#869 six days after this page
// shipped and went unnoticed until faultmaven-dashboard#79. Adding a slug there
// means adding it here; SSOCallbackPage.test.tsx pins the set below so the
// change is at least deliberate on this side.
// Exported so the contract pin in SSOCallbackPage.test.tsx can assert the
// handled set exactly, rather than inferring it from rendered copy.
export const ERROR_MESSAGES: Record<string, string> = {
  sso_access_denied: 'Sign-in was cancelled or denied at the identity provider.',
  sso_user_inactive: 'Your account is not active. Please contact your administrator.',
  sso_state_invalid: 'This sign-in attempt expired or was invalid. Please try again.',
  sso_exchange_failed: 'Sign-in could not be completed. Please try again.',
  // Multi-tenant only: the IdP reported no organization, or one this deployment
  // has no mapping for. Deliberately NOT a "try again" message — retrying is
  // guaranteed to fail identically until an operator provisions the mapping,
  // and this is the one SSO failure they can actually fix. Says only that this
  // deployment does not recognise the organization, matching what the backend
  // guarantees the slug leaks.
  sso_org_unmapped:
    'Your organization is not set up for access yet. Please contact your administrator.',
  sso_failed: 'Sign-in failed. Please try again.',
};
export const GENERIC_ERROR = 'Sign-in failed. Please try again.';
const EXCHANGE_ERROR =
  'Sign-in could not be completed — the sign-in link may have expired. Please try again.';

const MAX_RETURN_TO_LENGTH = 512;

/**
 * Same-origin path guard for the post-login destination, mirroring the
 * backend's sanitize_return_to: an absolute path only ("//host" is a
 * scheme-relative URL and is rejected), no backslashes (browsers normalize
 * "\" to "/"), no control characters or whitespace, bounded length. Anything
 * else falls through to the default destination.
 */
function sanitizeReturnTo(value: string | null): string | null {
  if (!value || value.length > MAX_RETURN_TO_LENGTH) return null;
  if (!value.startsWith('/') || value.startsWith('//')) return null;
  if (value.includes('\\')) return null;
  // eslint-disable-next-line no-control-regex
  if (/[\x00-\x1f\x7f ]/.test(value)) return null;
  return value;
}

/**
 * SSOCallbackPage — dashboard leg of the cloud hosted-login flow (ADR-015).
 *
 * The backend's GET /auth/sso/callback always 302s here with either a
 * single-use completion `code` (+ optional `return_to`) or a sanitized
 * `error` slug. The page trades the code for a FaultMaven session via
 * POST /auth/sso/exchange, stores it exactly like a LoginPage sign-in, and
 * forwards to the intended destination.
 */
export default function SSOCallbackPage() {
  const [exchangeError, setExchangeError] = useState<string | null>(null);
  const navigate = useNavigate();
  const location = useLocation();
  const { deployment, setAuthState } = useAuth();
  const startedRef = useRef(false);

  // The error-slug / missing-code outcome is a pure derivation of the URL —
  // computed at render (no effect/setState needed). Only an exchange failure
  // is genuinely asynchronous state.
  const params = new URLSearchParams(location.search);
  const code = params.get('code');
  const errorSlug = params.get('error');
  const paramError =
    errorSlug || !code
      ? errorSlug
        ? (ERROR_MESSAGES[errorSlug] ?? GENERIC_ERROR)
        : GENERIC_ERROR
      : null;
  const error = paramError ?? exchangeError;

  useEffect(() => {
    if (paramError || !code) return;

    // Wait for auth-config resolution: setAuthState derives the dashboard role
    // from `deployment`, so exchanging before it resolves would store a session
    // with no role (same reason LoginPage gates its variants on deployment).
    if (deployment === null) return;

    // The completion code is single-use: StrictMode's double-invoked effect
    // must not POST it twice (the second exchange would 401 and clobber a
    // successful login with an error screen).
    if (startedRef.current) return;
    startedRef.current = true;

    // Post-login destination: backend-echoed return_to first (survives even if
    // this tab's sessionStorage was cleared mid-flow), then the
    // ProtectedRoute-saved hint, else the KB (LoginPage's default).
    const returnTo =
      sanitizeReturnTo(new URLSearchParams(location.search).get('return_to')) ??
      sanitizeReturnTo(sessionStorage.getItem('oauth_redirect_after_login')) ??
      '/kb';

    (async () => {
      try {
        const authState = await ssoExchange(code);
        // Evict any previous identity's cached KB scopes before the new
        // session renders (cross-user residue guard, mirrors LoginPage).
        invalidateAvailableScopes();
        await setAuthState(authState);
        sessionStorage.removeItem('oauth_redirect_after_login');
        navigate(returnTo, { replace: true });
      } catch {
        // The backend 401s identically for every exchange failure (expired,
        // replayed, or unknown code; deactivated user) — one message, and the
        // fix is always the same: restart the sign-in flow.
        setExchangeError(EXCHANGE_ERROR);
      }
    })();
  }, [paramError, code, deployment, location.search, navigate, setAuthState]);

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-fm-canvas">
        <div className="bg-fm-surface border border-fm-border rounded-fm-card shadow-fm-card p-8 w-full max-w-md">
          <div className="text-center mb-6 mt-2">
            <img src="/icon/design-transparent.svg" alt="FaultMaven — Always on call" className="h-12 mx-auto mb-6" />
          </div>
          <div className="mb-6 text-sm text-fm-critical bg-fm-critical-bg border border-fm-critical-border p-3 rounded-fm-btn" role="alert">
            {error}
          </div>
          <Link
            to="/login"
            replace
            className="block w-full px-4 py-3 bg-fm-accent text-white font-medium text-center rounded-fm-btn hover:brightness-110 transition-colors"
          >
            Back to sign in
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-center min-h-screen bg-fm-canvas">
      <div className="text-fm-text-secondary">Completing sign-in...</div>
    </div>
  );
}
