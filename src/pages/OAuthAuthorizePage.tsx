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
// BOTH paths need it now. Approve used to rewrite the address bar same-origin
// and let the extension scrape `code`/`state` off it with a `tabs.onUpdated`
// watcher, so only Cancel ever left. copilot#192 moves sign-in to
// `identity.launchWebAuthFlow`, which settles on exactly one event — a
// navigation to the extension's redirect URI — and deletes that watcher, so
// approve navigates off-origin too (see redirectToExtension).
//
// Two shapes, deliberately kept narrow — and they are not interchangeable, so
// they are separate predicates rather than one flat list. Which one a
// redirect_uri matches decides HOW the code is handed back, not just whether it
// may be:
//
//   - `chrome-extension:` / `moz-extension:`, matched by scheme. These back the
//     server's original patterns (chrome-extension://<32>/callback.html,
//     moz-extension://<uuid>/callback.html) and are retained for extension
//     builds predating copilot#192, exactly as faultmaven#1065 retains them
//     server-side.
//   - The two `launchWebAuthFlow` hosts, matched by FULL URI shape rather than
//     by scheme. `https:` as a scheme entry would be strictly wider than the
//     policy this backs up and an open redirect to any host; pinning the host
//     shape keeps the "no wider than the server" property. The patterns mirror
//     faultmaven#1065's verbatim so the two allowlists cannot drift.
//
// A deployment that widens the server patterns degrades to an in-page message
// rather than a silent navigation, which is the right way round.
const LEGACY_EXTENSION_SCHEMES = ['chrome-extension:', 'moz-extension:'];

const WEB_AUTH_FLOW_PATTERNS = [
  // Chrome/Chromium: https://<extension-id>.chromiumapp.org/
  /^https:\/\/[a-p]{32}\.chromiumapp\.org\/?$/,
  // Firefox: https://<sha1-of-add-on-id>.extensions.allizom.org/ — a 40-char
  // hex digest, NOT the hyphenated per-install UUID that forms the
  // `moz-extension://` origin. The two are different values for the same
  // add-on, and only this one appears in the redirect host.
  /^https:\/\/[a-f0-9]{40}\.extensions\.allizom\.org\/?$/,
];

// A redirect target the browser itself owns: `launchWebAuthFlow` watches the
// auth window for a navigation here, and closes it and resolves on the match.
function isWebAuthFlowRedirect(uri: string): boolean {
  // Matched against the raw string, anchored, before any parsing: URL parsing
  // normalises away differences an allowlist is supposed to notice, and JS `$`
  // (unlike Python's) matches only at the very end of the input, so no trailing
  // path, query or newline sneaks past.
  return WEB_AUTH_FLOW_PATTERNS.some((pattern) => pattern.test(uri));
}

// A redirect target belonging to an extension build predating copilot#192,
// which completes the flow by scraping a same-origin URL (see redirectToExtension).
function isLegacyExtensionRedirect(uri: string): boolean {
  try {
    return LEGACY_EXTENSION_SCHEMES.includes(new URL(uri).protocol);
  } catch {
    return false;
  }
}

function isSafeRedirectUri(uri: string): boolean {
  return isWebAuthFlowRedirect(uri) || isLegacyExtensionRedirect(uri);
}

// Append OAuth response parameters to a redirect_uri. Each value is
// percent-encoded so a redirect_uri that already carries a query, or a
// `state` containing reserved characters (&, =, #), can't corrupt the
// parameters the extension parses back out.
function redirectUrlWith(redirectUri: string, params: URLSearchParams): string {
  // Split any fragment off first. Appending after it would bury code/state in
  // the hash, where the `URLSearchParams(location.search)` on the other end
  // never looks — the flow would stall with no error anywhere. The server's
  // `/callback\.html$` pattern happens to exclude fragments today, but this
  // guard exists precisely so as not to depend on that.
  const hashAt = redirectUri.indexOf('#');
  const base = hashAt === -1 ? redirectUri : redirectUri.slice(0, hashAt);
  const fragment = hashAt === -1 ? '' : redirectUri.slice(hashAt);
  const separator = base.includes('?') ? '&' : '?';
  return `${base}${separator}${params.toString()}${fragment}`;
}

// The OAuth error redirect (RFC 6749 §4.1.2.1).
function denyRedirectUrl(redirectUri: string, state: string): string {
  return redirectUrlWith(
    redirectUri,
    new URLSearchParams({
      error: 'access_denied',
      error_description: 'User denied authorization',
      state,
    })
  );
}

export default function OAuthAuthorizePage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { authState } = useAuth();
  const [consent, setConsent] = useState<OAuthConsentData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [redirecting, setRedirecting] = useState(false);
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
        redirectToExtension(approvalResponse, searchParams.get('redirect_uri'));
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
        redirectToExtension(approval, consent.redirect_uri);
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

  // `redirectUri` is passed in rather than read off the URL here, because the
  // two callers have different best answers and this value is load-bearing now
  // that it is navigated to. After consent it must be `consent.redirect_uri` —
  // the URI the server minted the code against — so that a server which ever
  // normalises or substitutes what it echoes back cannot leave us delivering a
  // code bound to URI A at URI B, where the extension's token exchange fails
  // RFC 6749 §4.1.3 matching with nothing legible to show for it. The
  // already-approved fast path has no consent object and the URL is all there
  // is.
  function redirectToExtension(approval: OAuthApprovalResponse, redirectUri: string | null) {
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

    // Same guard as the deny path. This is a real off-origin navigation now, so
    // "the server already checked" is not enough on its own.
    if (!isSafeRedirectUri(redirectUri)) {
      setError('This authorization request has an unsupported redirect target.');
      setLoading(false);
      setSubmitting(false);
      return;
    }

    const params = new URLSearchParams({ code: approval.code, state: approval.state });
    setLoading(false);

    // Two handoffs, because the two redirect shapes complete the flow in
    // genuinely different ways and giving both the same treatment breaks one of
    // them.
    //
    // Legacy (`chrome-extension:` / `moz-extension:`): rewrite the address bar
    // SAME-ORIGIN and let the extension's `tabs.onUpdated` watcher read
    // code/state off it and close the tab. Navigating to the real
    // `chrome-extension://<id>/callback.html` instead would not work: neither
    // built manifest declares that page in `web_accessible_resources`, so both
    // browsers block a web page from navigating to it — the watcher would never
    // see a URL carrying `code`, and the user would sit on the spinner below
    // forever. These builds are exactly the ones that still HAVE the watcher,
    // which is what makes the same-origin rewrite the working answer for them.
    if (isLegacyExtensionRedirect(redirectUri)) {
      const sameOrigin = `${window.location.origin}${window.location.pathname}?${params.toString()}`;
      window.history.replaceState({}, '', sameOrigin);
      setRedirecting(true);
      return;
    }

    // launchWebAuthFlow: navigate for real. This IS the handoff — it resolves on
    // the auth window reaching the extension's redirect URI and on nothing else,
    // and the browser closes that window itself the instant the navigation
    // lands. Doing the same-origin rewrite here is the bug this fixes: copilot#192
    // deletes the watcher, so nothing was left to notice it and launchWebAuthFlow
    // stayed pending until the side panel's own timeout gave up (dashboard#89).
    //
    // `setRedirecting` AFTER the assignment, deliberately. Its branch renders
    // ahead of the error branch, so setting it first would mean a throw here —
    // caught by both callers, which then call setError — left the user on an
    // unrecoverable spinner with the reason rendered nowhere.
    window.location.href = redirectUrlWith(redirectUri, params);
    setRedirecting(true);
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

  // Ordered ahead of `redirecting` so a failure can never be masked by the
  // spinner: the spinner is a terminal state with no way out of it, and the
  // handoffs above are the last thing that runs, so anything that goes wrong
  // afterwards has only this branch left to say so.
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

  // Shown only for the moment between handing the code back and whoever owns
  // the window taking it away — the browser on the launchWebAuthFlow path, the
  // extension's own watcher on the legacy one. Nothing here claims the window
  // will close, and nothing here has to make it happen.
  if (redirecting) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-fm-canvas">
        <div className="bg-fm-surface border border-fm-border rounded-fm-card shadow-fm-card p-8 w-full max-w-md text-center">
          <div className="w-12 h-12 border-4 border-fm-accent border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <h2 className="text-xl font-semibold text-fm-text-primary">Returning to the application...</h2>
        </div>
      </div>
    );
  }

  if (!consent) {
    return null;
  }

  const scopes = consent.scope.split(' ');

  // Name the application that actually asked. The heading used to be the literal
  // string "Authorize FaultMaven Copilot", which is true only while
  // `oauth_allowed_clients` holds nothing else — and the backend's display-name
  // map already anticipates `faultmaven-cli`. Adding one client would have left
  // this screen telling the user the browser extension was asking while it minted
  // a code for something else: a consent screen naming the WRONG requester, with
  // no error to notice.
  //
  // Safe to render since faultmaven#1053: the GET refuses an unknown client_id,
  // so `client_name` is either one of the backend's friendly names or an id an
  // operator put in the allowlist — never a caller-chosen string, which is the
  // reason this was kept off the screen before.
  //
  // Falling back to `client_id` rather than to a generic word: the whole point of
  // this screen is saying who is asking, so a blank or missing name must still
  // resolve to something identifying.
  const requester = consent.client_name || consent.client_id;

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
          <h1 className="text-2xl font-bold text-fm-text-primary mb-2">Authorize {requester}</h1>
          <p className="text-fm-text-secondary">
            This application is requesting access to your FaultMaven account.
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
