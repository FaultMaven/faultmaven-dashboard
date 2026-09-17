import { useEffect } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

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
 * Returning users are untouched: `/login` does not pass a hint, so its request
 * is byte-identical to before.
 */
export default function SignUpPage() {
  const { deployment, configStatus, loginUrl } = useAuth();

  useEffect(() => {
    if (deployment !== 'cloud' || !loginUrl) return;
    // Same handoff LoginPage performs, plus the hint. `loginUrl` is the
    // backend-advertised hosted-login endpoint, which may already carry a
    // query, so the separator is computed rather than assumed.
    const sep = loginUrl.includes('?') ? '&' : '?';
    window.location.assign(`${loginUrl}${sep}screen_hint=sign-up`);
  }, [deployment, loginUrl]);

  // Standalone has no hosted login and no sign-up: it is single-user, and its
  // sign-in is a passwordless username form. Send them to the page that can
  // actually let them in rather than stranding them on a spinner.
  if (configStatus === 'ok' && deployment === 'standalone') {
    return <Navigate to="/login" replace />;
  }

  // Cloud, config resolved, but the deployment advertises no IdP — the same
  // honest failure LoginPage gives, reached through the page that owns it.
  if (configStatus === 'ok' && deployment === 'cloud' && !loginUrl) {
    return <Navigate to="/login" replace />;
  }

  // Unreachable config is LoginPage's problem, and it owns the retry card and
  // the Local Network Access diagnosis. Handing off keeps one explanation of
  // that failure rather than a second, thinner copy here.
  if (configStatus === 'unreachable') {
    return <Navigate to="/login" replace />;
  }

  return (
    <div className="flex items-center justify-center min-h-screen bg-fm-canvas">
      <div className="text-fm-text-secondary">Taking you to sign-up…</div>
    </div>
  );
}
