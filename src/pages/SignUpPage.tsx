import { useEffect } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { buildHostedLoginUrl } from '../lib/auth/hostedLoginUrl';

/**
 * Hands a first-time visitor straight to the hosted login's SIGN-UP screen.
 *
 * A hosted login opens on sign-in unless told otherwise, so before this a
 * visitor following "try it" from the marketing site was shown a form asking
 * for an account they do not have (faultmaven-website#42). The core API grew
 * an optional `screen_hint` for exactly this (contract 6.1.0); this route is
 * the one place that asks for it.
 *
 * It is a redirect shim, not a page: it renders no form and asks nothing,
 * which is what website#42's invariant requires — "without an intermediate
 * page that asks them to sign in". The marketing site links here rather than
 * at the API directly so that where the IdP lives stays a fact the backend
 * advertises through `/auth/config` and the Dashboard resolves, rather than a
 * second origin the website has to be told about and kept in step with.
 *
 * Returning users are untouched: `/login` does not pass a hint, so its
 * request is byte-identical to before.
 */
export default function SignUpPage() {
  const { deployment, configStatus, loginUrl, isAuthenticated } = useAuth();

  // Every state this page can be in resolves to exactly one of three
  // outcomes, decided once here so the effect and the render cannot disagree.
  // They did: the effect originally ignored `configStatus` while the returns
  // below were driven by it, so an unreachable config with a stale loginUrl
  // rendered "go to /login" *and* fired the redirect.
  const ready = configStatus === 'ok';
  const canHandOff = ready && deployment === 'cloud' && !!loginUrl && !isAuthenticated;

  useEffect(() => {
    if (!canHandOff || !loginUrl) return;
    // `replace`, not `assign`: this page is a waypoint, not a destination. With
    // `assign` it stays in history, so Back from the IdP remounts it, re-fires
    // this effect and throws the visitor straight back — Back becomes a loop
    // for exactly the people this route exists to serve.
    window.location.replace(buildHostedLoginUrl(loginUrl, { screenHint: 'sign-up' }));
  }, [canHandOff, loginUrl]);

  // Already signed in. The marketing CTA is in the site header on every page,
  // so a returning customer clicks it too — and sending them to a *sign-up*
  // screen invites a second account. This is the mirror of the defect
  // website#42 describes, and the old CTA (the app root) got it right by
  // landing them on their cases.
  if (isAuthenticated) return <Navigate to="/cases" replace />;

  // Anything settled that is not cloud-with-an-IdP goes to /login, which owns
  // the standalone form, the no-IdP error and the unreachable-config retry
  // card with its Local Network Access diagnosis. Written as one condition
  // rather than three: enumerating the known states left a future
  // `ConfigStatus` member falling through to an indefinite spinner, where
  // this falls to the page that can explain itself.
  if (ready && !canHandOff) return <Navigate to="/login" replace />;

  return (
    <div className="flex items-center justify-center min-h-screen bg-fm-canvas">
      <div className="text-fm-text-secondary">Taking you to sign-up…</div>
    </div>
  );
}
