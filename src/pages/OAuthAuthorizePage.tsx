import { useState, useEffect, useRef } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import {
  getOAuthConsent,
  submitOAuthApproval,
  OAuthConsentData,
  OAuthApprovalResponse,
} from '../lib/api/oauth';
import { useAuth } from '../context/AuthContext';
import { authManager } from '../lib/auth';

// Defence in depth. `redirect_uri` used to reach this page UNVALIDATED — the
// server checked only `response_type` and echoed the rest back, deferring the
// allowlist to mint time — so a crafted `?redirect_uri=` rendered an ordinary
// consent screen and Cancel sent this tab wherever the attacker chose. That
// hole is closed: GET /auth/oauth/authorize now rejects an unlisted
// `redirect_uri` (and an unknown `client_id`) with a 400 before any consent
// screen exists, so a disallowed value no longer reaches this component
// (faultmaven#1053).
//
// This check stays anyway, because the property it protects is local: this page
// must not navigate the browser somewhere it cannot vouch for, whatever a server
// hands it. It is now a second opinion rather than the only guard.
//
// Approve is unaffected — it never navigates off-origin (see redirectToExtension).
// Only the deny path leaves, so only it needs this.
//
// Extension schemes ONLY, deliberately. The server's allowlist
// (`oauth_redirect_uri_patterns`) is exactly two patterns —
// chrome-extension://<32>/callback.html and moz-extension://<uuid>/callback.html —
// so permitting `https:` here would be strictly wider than the policy it backs
// up, and still an open redirect to any host. A deployment that widens the server
// patterns degrades to an in-page message rather than a silent navigation, which
// is the right way round.
const SAFE_REDIRECT_SCHEMES = ['chrome-extension:', 'moz-extension:'];

function isSafeRedirectUri(uri: string): boolean {
  try {
    return SAFE_REDIRECT_SCHEMES.includes(new URL(uri).protocol);
  } catch {
    return false;
  }
}

// Build the OAuth error redirect (RFC 6749 §4.1.2.1). Each value is
// percent-encoded so a redirect_uri that already carries a query, or a
// `state` containing reserved characters (&, =, #), can't corrupt the
// parameters the extension parses back out.
function denyRedirectUrl(redirectUri: string, state: string): string {
  const params = new URLSearchParams({
    error: 'access_denied',
    error_description: 'User denied authorization',
    state,
  });
  const separator = redirectUri.includes('?') ? '&' : '?';
  return `${redirectUri}${separator}${params.toString()}`;
}

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

  // PKCE parameters belong to the extension's authorization request and are
  // echoed in the URL. The consent response does NOT carry them, so reading
  // them off `consent` sent `undefined` to the approval endpoint.
  // `||` not `??`: an explicitly empty `?code_challenge_method=` must fall back
  // to the default rather than being forwarded as ''. An empty code_challenge is
  // refused outright below — minting a code against an empty challenge defeats
  // PKCE and only surfaces later, at the extension's token exchange.
  const codeChallenge = searchParams.get('code_challenge') || '';
  const codeChallengeMethod = searchParams.get('code_challenge_method') || 'S256';

  // Send the user to sign in, remembering this authorization request so login
  // returns them here rather than to the dashboard home. Used from mount (no
  // session yet) and from the click-time pin (session expired while the consent
  // screen sat open) — the two cases want identical recovery.
  function goSignIn() {
    sessionStorage.setItem(
      'oauth_redirect_after_login',
      `/auth/authorize?${searchParams.toString()}`
    );
    navigate('/login');
  }

  useEffect(() => {
    if (!authState) {
      goSignIn();
      return;
    }

    if (!hasLoadedRef.current) {
      hasLoadedRef.current = true;
      loadConsentData();
    }
    // Intentionally keyed on authState only: this consent flow must fire exactly
    // once when auth resolves (guarded by hasLoadedRef). loadConsentData/navigate/
    // searchParams are stable for this render and must not re-trigger the effect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authState]);

  async function loadConsentData() {
    try {
      setLoading(true);
      setError(null);

      if (!codeChallenge) {
        setError('Invalid authorization request: missing PKCE code challenge');
        return;
      }

      // The two halves of the backend used to disagree about this parameter, and
      // the disagreement landed on the user: GET /auth/oauth/authorize took it as
      // a bare `str` Query and echoed the request back, so
      // `?code_challenge_method=plain` rendered an ordinary consent screen, while
      // the approval BODY typed it `Optional[Literal["S256"]]` and 422'd the
      // moment Authorize was clicked. They agree now — the GET rejects anything
      // but S256 up front (faultmaven#1053).
      //
      // Still refused here, and deliberately: this runs before any network call,
      // so a plainly malformed request costs nothing and says something specific.
      // Not normalised to S256 either — a client that really asked for `plain`
      // would then have a code minted against a challenge it will verify
      // differently, turning a legible refusal into a failure at the token
      // exchange, and silently accepting a plain challenge as S256 is exactly the
      // downgrade PKCE exists to prevent.
      if (codeChallengeMethod !== 'S256') {
        setError(
          `Unsupported PKCE method "${codeChallengeMethod}". This server supports S256 only.`
        );
        return;
      }

      const data = await getOAuthConsent(searchParams);

      if ('code' in data && data.code) {
        const approvalResponse = data as OAuthApprovalResponse;
        redirectToExtension(approvalResponse);
        return;
      }

      const consentData = data as OAuthConsentData;

      // F2: the identity shown and the identity the code is minted for must be
      // the same one. AuthContext snapshots `authState` on mount and has no
      // storage/BroadcastChannel listener, while the consent and approval calls
      // read auth fresh from localStorage — so signing in as B in another tab
      // leaves this screen naming A while Authorize would mint a code for B.
      // The server-authoritative user_id settles it.
      //
      // No absent-session branch here, deliberately, unlike handleApprove. This
      // reads AuthContext's snapshot and the effect above already returned on a
      // null one — and a truthy snapshot always carries `user`, because
      // AuthContext dereferences `state.user.roles` unguarded while loading, so a
      // state without it throws there and never reaches this page. The equivalent
      // check at the click site is live only because that one re-reads storage.
      if (authState?.user?.user_id !== consentData.user_id) {
        setError('Your signed-in account changed. Reload this page to continue.');
        return;
      }

      setConsent(consentData);
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

      // Re-pin at click time, against a FRESH read. `authState` is AuthContext's
      // mount snapshot, and submitOAuthApproval re-reads auth from storage when
      // it fires — so checking only at load closed a millisecond window while
      // leaving open the whole time this screen is displayed. Signing in as
      // someone else in another tab mid-consent would otherwise mint a code for
      // them under a screen still naming the first account.
      const current = await authManager.getAuthState();

      // NO session is not a changed identity. An expired session, a refresh that
      // failed, or a sign-out in another tab all land here with `current == null`,
      // and folding them into the mismatch branch below told the user their
      // ACCOUNT had changed and to reload — on a screen whose only control is an
      // inert window.close(). Send them to sign in, and back here afterwards.
      if (!current?.user) {
        goSignIn();
        return;
      }

      if (current.user.user_id !== consent.user_id) {
        setError('Your signed-in account changed. Reload this page to continue.');
        setSubmitting(false);
        return;
      }

      const approval = await submitOAuthApproval({
        approved: true,
        client_id: consent.client_id,
        redirect_uri: consent.redirect_uri,
        code_challenge: codeChallenge,
        code_challenge_method: codeChallengeMethod,
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
        code_challenge: codeChallenge,
        code_challenge_method: codeChallengeMethod,
        scope: consent.scope,
        state: consent.state,
      });

    } catch {
      // Expected: the backend answers a denial by RAISING 400 ("User denied
      // authorization request"), so this is the ordinary path, not an error one.
      // Reporting the denial is best-effort; returning the user to the extension
      // is what matters, and happens either way below.
    } finally {
      leaveToDenyRedirect(consent.redirect_uri, consent.state);
    }
  }

  function leaveToDenyRedirect(redirectUri: string, state: string) {
    if (!isSafeRedirectUri(redirectUri)) {
      setError('This authorization request has an unsupported redirect target.');
      setSubmitting(false);
      return;
    }
    window.location.href = denyRedirectUrl(redirectUri, state);
  }

  function redirectToExtension(approval: OAuthApprovalResponse) {
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

    const callbackParams = new URLSearchParams({ code: approval.code, state: approval.state });
    const callbackUrl = `${window.location.origin}${window.location.pathname}?${callbackParams.toString()}`;
    window.history.replaceState({}, '', callbackUrl);
    setRedirectUrl(callbackUrl);
    setLoading(false);
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-fm-canvas">
        <div className="bg-fm-surface border border-fm-border rounded-fm-card shadow-fm-card p-8 w-full max-w-md text-center">
          <div className="w-12 h-12 border-4 border-fm-accent border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <h2 className="text-xl font-semibold text-fm-text-primary">Loading authorization request...</h2>
        </div>
      </div>
    );
  }

  if (redirectUrl) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-fm-canvas">
        <div className="bg-fm-surface border border-fm-border rounded-fm-card shadow-fm-card p-8 w-full max-w-md">
          <div className="w-16 h-16 bg-fm-success-bg text-fm-success rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h2 className="text-2xl font-bold text-fm-text-primary mb-2 text-center">Authorization Successful!</h2>
          <p className="text-fm-text-secondary mb-6 text-center">
            Sign-in complete! This window will close automatically.
          </p>
          <div className="flex items-center justify-center">
            <div className="w-8 h-8 border-4 border-fm-success border-t-transparent rounded-full animate-spin"></div>
          </div>
          <p className="text-fm-xs text-fm-text-tertiary text-center mt-4">
            Returning to FaultMaven Copilot...
          </p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-fm-canvas">
        <div className="bg-fm-surface border border-fm-border rounded-fm-card shadow-fm-card p-8 w-full max-w-md">
          <div className="w-16 h-16 bg-fm-critical-bg text-fm-critical rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </div>
          <h2 className="text-2xl font-bold text-fm-text-primary mb-2 text-center">Authorization Error</h2>
          <p className="text-fm-text-secondary mb-6 text-center">{error}</p>
          <button
            onClick={() => window.close()}
            className="w-full px-4 py-2 bg-fm-elevated text-fm-text-secondary font-medium rounded-fm-btn hover:bg-fm-surface-alt transition-colors"
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

  const ScopeItem = ({ children }: { children: React.ReactNode }) => (
    <li className="flex items-start">
      <svg className="w-5 h-5 text-fm-accent mr-2 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
        <path
          fillRule="evenodd"
          d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
          clipRule="evenodd"
        />
      </svg>
      <span className="text-fm-text-secondary">{children}</span>
    </li>
  );

  return (
    <div className="flex items-center justify-center min-h-screen bg-fm-canvas p-4">
      <div className="bg-fm-surface border border-fm-border rounded-fm-card shadow-fm-card p-8 w-full max-w-md">
        {/* Header */}
        <div className="text-center mb-6">
          <img src="/icon/square-transparent.svg" alt="FaultMaven" className="w-16 h-16 rounded-xl mx-auto mb-4" />
          <h1 className="text-2xl font-bold text-fm-text-primary mb-2">Authorize FaultMaven Copilot</h1>
          <p className="text-fm-text-secondary">
            The FaultMaven browser extension is requesting access to your account.
          </p>
        </div>

        {/* User Info */}
        <div className="bg-fm-elevated border border-fm-border rounded-fm-btn p-4 mb-6">
          <div className="text-sm text-fm-text-tertiary mb-1">Signing in as:</div>
          <div className="font-semibold text-fm-text-primary">
            {authState?.user?.display_name || authState?.user?.username || consent.username}
          </div>
          {authState?.user?.email && (
            <div className="text-sm text-fm-text-secondary">{authState.user.email}</div>
          )}
        </div>

        {/* Permissions */}
        <div className="mb-6">
          <h3 className="font-semibold text-fm-text-primary mb-3">This application will be able to:</h3>
          <ul className="space-y-2">
            {scopes.includes('openid') && <ScopeItem>Access your user ID</ScopeItem>}
            {scopes.includes('profile') && <ScopeItem>Access your profile information</ScopeItem>}
            {scopes.includes('cases:read') && <ScopeItem>Read your cases</ScopeItem>}
            {scopes.includes('cases:write') && <ScopeItem>Create and update cases</ScopeItem>}
            {scopes.includes('knowledge:read') && <ScopeItem>Read knowledge base articles</ScopeItem>}
            {scopes.includes('evidence:read') && <ScopeItem>Read evidence files</ScopeItem>}
          </ul>
        </div>

        {/* Action Buttons */}
        <div className="flex gap-3">
          <button
            onClick={handleDeny}
            disabled={submitting}
            className="flex-1 px-4 py-3 bg-fm-elevated text-fm-text-secondary font-medium rounded-fm-btn hover:bg-fm-surface-alt disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleApprove}
            disabled={submitting}
            className="flex-1 px-4 py-3 bg-fm-accent text-white font-medium rounded-fm-btn hover:brightness-110 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {submitting ? 'Authorizing...' : 'Authorize'}
          </button>
        </div>

        {/* Security Note */}
        <p className="text-fm-xs text-fm-text-tertiary text-center mt-6">
          This authorization expires in 7 days. You can revoke access anytime from your account settings.
        </p>
      </div>
    </div>
  );
}
