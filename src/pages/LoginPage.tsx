import React, { useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { devLogin, authManager, SIGNOUT_NOTICE_KEY } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { invalidateAvailableScopes } from '../hooks/useAvailableScopes';

const inputClass = 'w-full px-4 py-2 bg-fm-surface-alt border border-fm-border rounded-fm-input text-fm-text-primary placeholder:text-fm-text-tertiary focus:ring-2 focus:ring-fm-accent focus:border-transparent transition-colors';

export default function LoginPage() {
  const [username, setUsername] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();
  const location = useLocation();
  const { deployment, configStatus, retryConfigDetection, loginUrl, setAuthState } = useAuth();

  // When the API is unreachable, check whether the browser's Local Network
  // Access permission is the blocker, to make the error actionable. The
  // permission name is 'local-network' as of Chrome 145, with the launch-era
  // 'local-network-access' kept as an alias; other browsers throw on unknown
  // names, hence the try-per-name. Detection only — never pass
  // `targetAddressSpace` on the fetch itself: the same bundle serves external
  // users whose API resolves publicly, and a declared-space mismatch fails the
  // request outright.
  // Rendered only inside the unreachable branch, so a stale value from a
  // previous unreachable episode is invisible; the async query refreshes it
  // (both directions) each time the state is entered.
  const [lnaBlocked, setLnaBlocked] = useState(false);
  useEffect(() => {
    if (configStatus !== 'unreachable') return;
    let cancelled = false;
    (async () => {
      for (const name of ['local-network', 'local-network-access']) {
        try {
          const status = await navigator.permissions.query({
            name: name as PermissionName,
          });
          if (!cancelled) setLnaBlocked(status.state === 'denied');
          return;
        } catch {
          // Unknown permission name in this browser — try the next alias.
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [configStatus]);
  // The sign-out that sent the user here could not confirm that the account's
  // other sessions ended (logoutAuth). The menu that asked is long gone by now,
  // so this screen is where the user finds out. Read at mount and consumed
  // immediately after, so it reports that sign-out and not a later, clean one.
  const [signOutUnconfirmed] = useState(() => {
    try {
      return sessionStorage.getItem(SIGNOUT_NOTICE_KEY) !== null;
    } catch {
      // Storage denied (private mode): nothing was recorded, nothing to show.
      return false;
    }
  });

  const isExtensionLogin = new URLSearchParams(location.search).get('source') === 'extension';

  // Consumed in an effect, not in the initializer above: the initializer runs
  // during render (twice under StrictMode) and must stay free of side effects.
  useEffect(() => {
    try {
      sessionStorage.removeItem(SIGNOUT_NOTICE_KEY);
    } catch {
      /* Nothing was recorded, so there is nothing to consume. */
    }
  }, []);

  const signOutNotice = signOutUnconfirmed ? (
    <div
      role="status"
      className="mb-4 text-sm text-fm-warning bg-fm-warning-bg border border-fm-warning-border p-3 rounded-fm-btn"
    >
      Signed out on this device. We could not confirm that your other sessions
      ended — if you are signed in to the FaultMaven Copilot or another browser,
      sign out there too.
    </div>
  ) : null;

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!username || username.trim().length < 3) {
      setError('Username must be at least 3 characters');
      return;
    }

    setLoading(true);
    try {
      const authState = await devLogin(username.trim());

      window.postMessage({
        type: 'FM_AUTH_SUCCESS',
        payload: authState
      }, window.location.origin);

      // Only the copilot extension bridge needs the `fm_auth_state` localStorage
      // mirror; creating it here arms AuthManager's rotation-sync. A plain
      // dashboard login must NOT create it (keeps full tokens, incl. the refresh
      // token, out of plain localStorage for ordinary sessions).
      if (isExtensionLogin) {
        authManager.writeBridgeAuthState(authState);
      }

      // Evict any previous identity's cached KB scopes before the new session
      // renders (cross-user residue guard).
      invalidateAvailableScopes();
      await setAuthState(authState);

      const oauthRedirect = sessionStorage.getItem('oauth_redirect_after_login');
      if (oauthRedirect) {
        sessionStorage.removeItem('oauth_redirect_after_login');
        navigate(oauthRedirect);
        return;
      }

      if (isExtensionLogin) {
        setLoading(false);
        return;
      }

      navigate('/kb');
    } catch (err: unknown) {
      let errorMessage = 'Login failed. Please check your connection to the backend.';

      if (err instanceof Error) {
        errorMessage = err.message;
      }

      if (err instanceof TypeError && err.message.includes('fetch')) {
        errorMessage = 'Could not reach API. Is the backend running on port 8090?';
      }

      setError(errorMessage);
      setLoading(false);
    }
  };

  const handleCloudSignIn = () => {
    setError(null);
    if (!loginUrl) {
      // The IdP authorize URL comes from the deployment's auth config; if the
      // backend hasn't advertised one yet, fail honestly rather than silently.
      setError('Single sign-on is not configured for this deployment yet.');
      return;
    }
    // Deployment-config-driven redirect (OIDC IdP): hands off to the advertised
    // hosted-login URL; the backend redirects back to /auth/sso/callback
    // (SSOCallbackPage) with a completion code. Forward the ProtectedRoute-saved
    // destination as return_to so the backend echoes it through the IdP round
    // trip (belt to sessionStorage's braces — survives a cleared tab state).
    const returnTo = sessionStorage.getItem('oauth_redirect_after_login');
    const target =
      returnTo && returnTo.startsWith('/') && !returnTo.startsWith('//')
        ? `${loginUrl}${loginUrl.includes('?') ? '&' : '?'}return_to=${encodeURIComponent(returnTo)}`
        : loginUrl;
    window.location.assign(target);
  };

  // Deployment could not be confirmed: fail CLOSED with a retriable error.
  // Rendering either login variant here would be a guess — and the standalone
  // guess is how cloud users ended up on a "LOCAL MODE ACTIVE" dev-login they
  // could never sign in through (Chrome's Local Network Access blocking the
  // config fetch on networks where the API resolves to a private address).
  if (configStatus === 'unreachable') {
    return (
      <div className="flex items-center justify-center min-h-screen bg-fm-canvas">
        <div className="bg-fm-surface border border-fm-border rounded-fm-card shadow-fm-card p-8 w-full max-w-md">
          <div className="text-center mb-6 mt-2">
            <img src="/icon/design-transparent.svg" alt="FaultMaven — Always on call" className="h-12 mx-auto mb-6" />
            <h2 className="text-xl font-semibold text-fm-text-primary mb-2">
              Can&apos;t reach the FaultMaven API
            </h2>
            <p className="text-sm text-fm-text-secondary">
              The dashboard could not contact its API server to determine how to
              sign you in. Check that the API is running and reachable from this
              browser, then try again.
            </p>
          </div>

          {lnaBlocked && (
            <div
              role="status"
              className="mb-4 text-sm text-fm-warning bg-fm-warning-bg border border-fm-warning-border p-3 rounded-fm-btn"
            >
              Your browser is blocking this site&apos;s access to the local
              network, which can block the API when it resolves to a private
              address. In Chrome, open this site&apos;s settings and set
              &ldquo;Local network access&rdquo; to Allow, then retry.
            </div>
          )}

          <button
            type="button"
            onClick={retryConfigDetection}
            className="w-full px-4 py-3 bg-fm-accent text-white font-medium rounded-fm-btn hover:brightness-110 transition-colors"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  // Wait for deployment detection before rendering a login variant, so a cloud
  // user never briefly sees the standalone username form (and vice versa).
  if (deployment === null) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-fm-canvas">
        <div className="text-fm-text-secondary">Loading...</div>
      </div>
    );
  }

  // Cloud (OIDC) deployment: no password, no dev-login — redirect to the IdP.
  if (deployment === 'cloud') {
    return (
      <div className="flex items-center justify-center min-h-screen bg-fm-canvas">
        <div className="bg-fm-surface border border-fm-border rounded-fm-card shadow-fm-card p-8 w-full max-w-md">
          <div className="text-center mb-8 mt-6">
            <img src="/icon/design-transparent.svg" alt="FaultMaven — Always on call" className="h-12 mx-auto mb-6" />
            <p className="text-fm-text-secondary">
              Sign in with your organization account to access the Knowledge Base, view case metrics, and launch the AI Copilot.
            </p>
          </div>

          {signOutNotice}

          {error && (
            <div className="mb-4 text-sm text-fm-critical bg-fm-critical-bg border border-fm-critical-border p-3 rounded-fm-btn">
              {error}
            </div>
          )}

          <button
            type="button"
            onClick={handleCloudSignIn}
            className="w-full px-4 py-3 bg-fm-accent text-white font-medium rounded-fm-btn hover:brightness-110 transition-colors"
          >
            Sign In
          </button>
        </div>
      </div>
    );
  }

  // Standalone (self-hosted): passwordless, single-user dev-login.
  if (isExtensionLogin && authManager.hasBridgeAuthState() && !loading && !error) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-fm-canvas">
        <div className="bg-fm-surface border border-fm-border rounded-fm-card shadow-fm-card p-8 w-full max-w-md text-center">
          <div className="w-16 h-16 bg-fm-success-bg text-fm-success rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h2 className="text-2xl font-bold text-fm-text-primary mb-2">Sign in Successful!</h2>
          <p className="text-fm-text-secondary mb-6">
            You have successfully authenticated with FaultMaven. You can now close this tab and return to the browser extension.
          </p>
          <button
            onClick={() => window.close()}
            className="px-6 py-2 bg-fm-elevated text-fm-text-secondary font-medium rounded-fm-btn hover:bg-fm-surface-alt transition-colors"
          >
            Close Tab
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-center min-h-screen bg-fm-canvas">
      <div className="bg-fm-surface border border-fm-border rounded-fm-card shadow-fm-card p-8 w-full max-w-md relative">
        {/* Local Mode Badge — only for a confirmed standalone backend, never cloud */}
        <div className="absolute top-4 right-4">
          <div className="flex items-center gap-1.5 px-3 py-1.5 bg-fm-warning-bg text-fm-warning text-xs font-semibold rounded-full border border-fm-warning-border">
            <span className="w-2 h-2 bg-fm-warning rounded-full animate-pulse-dot"></span>
            LOCAL MODE ACTIVE
          </div>
          <div className="text-fm-xs text-fm-text-tertiary text-right mt-1 font-medium">
            Authentication Bypassed
          </div>
        </div>

        {/* Logo and Header */}
        <div className="text-center mb-8 mt-6">
          <img src="/icon/design-transparent.svg" alt="FaultMaven — Always on call" className="h-12 mx-auto mb-6" />
          <p className="text-fm-text-secondary">
            Authenticate to access the Knowledge Base, view case metrics, and launch the AI Copilot.
          </p>
        </div>

        {signOutNotice}

        {/* Login Form */}
        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label htmlFor="username" className="block text-sm font-medium text-fm-text-secondary mb-2">
              Username
            </label>
            <input
              type="text"
              id="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className={inputClass}
              placeholder="Enter your username"
              disabled={loading}
              autoFocus
            />
          </div>

          {error && (
            <div className="text-sm text-fm-critical bg-fm-critical-bg border border-fm-critical-border p-3 rounded-fm-btn">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full px-4 py-3 bg-fm-accent text-white font-medium rounded-fm-btn hover:brightness-110 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {loading ? 'Signing in...' : 'Sign In'}
          </button>
        </form>
      </div>
    </div>
  );
}
