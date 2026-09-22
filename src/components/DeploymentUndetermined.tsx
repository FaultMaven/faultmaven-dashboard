import { useState } from 'react';
import { useAuth } from '../context/AuthContext';

/**
 * What a **fail-closed** route guard renders while it cannot yet know the
 * deployment.
 *
 * `loading` covers the stored-auth read only. AuthContext starts the
 * `/auth/config` probe alongside it and deliberately does NOT gate `loading` on
 * it, because that would blank every routed page for a network round trip. So
 * `loading === false` with `deployment === null` is a real state on every hard
 * refresh, and for as long as the API is unreachable.
 *
 * `canManageUsers` and `canManageConsole` both answer *false* there — not
 * "unknown" — and their guards redirect with `replace`. So a cloud operator
 * opening an `/admin/users` bookmark was sent to `/cases` with no way back, for
 * a question the app had not yet been able to ask. AuthContext names this exact
 * failure beside `CONFIG_REPROBE_INTERVAL_MS`: "a cloud admin whose session
 * started during an API blip would otherwise keep a null deployment/role
 * (hidden admin nav, redirected admin routes) until a full reload."
 *
 * A redirect is the one irreversible option, so it is the one thing this must
 * not do. Instead:
 *
 * - **'pending'** — the first probe is in flight (bounded by
 *   `CONFIG_FETCH_TIMEOUT_MS`). Render the same quiet "Loading…" the login page
 *   shows for a null deployment. Nothing has gone wrong yet and saying so would
 *   be noise.
 * - **'unreachable'** — at least one probe has failed. ‼ This does NOT mean
 *   detection has stopped: `configStatus` flips to it after the FIRST failure
 *   and only then runs the retry ladder, with a 30s reprobe after that. So a
 *   spinner here would be indefinite and would claim progress it cannot
 *   promise. Say plainly that the deployment could not be determined, and offer
 *   the same single-attempt retry the login page does — the human clicking it
 *   IS the backoff.
 *
 * ⛔ NOT for `AllCasesRoute`. That guard fails OPEN on a null deployment, so it
 * has no irreversible branch to protect and blanking it would cost a cloud
 * operator up to 8s of white screen while the nav item beside it still offered
 * the link. Its docstring explains why it decides immediately; do not
 * "consistency"-apply this there.
 */
export function DeploymentUndetermined() {
  const { configStatus, retryConfigDetection } = useAuth();
  const [retrying, setRetrying] = useState(false);

  if (configStatus === 'pending') {
    return (
      <div className="flex items-center justify-center min-h-screen bg-fm-canvas">
        <div className="text-fm-text-secondary">Loading...</div>
      </div>
    );
  }

  const onRetry = async () => {
    setRetrying(true);
    try {
      await retryConfigDetection();
    } finally {
      // Only on a failed retry: a successful one flips configStatus to 'ok' and
      // unmounts this component, so clearing state afterwards would be a write
      // to an unmounted tree.
      setRetrying(false);
    }
  };

  return (
    <div className="flex items-center justify-center min-h-screen bg-fm-canvas px-6">
      <div className="bg-fm-surface border border-fm-border rounded-fm-card shadow-fm-card p-8 w-full max-w-md">
        <h1 className="text-fm-heading font-bold text-fm-text-primary mb-2">
          Can&apos;t reach FaultMaven
        </h1>
        <p className="text-fm-text-secondary text-sm mb-4">
          This page is only available on some deployments, and we could not reach the API to find
          out which one this is. Nothing is wrong with your account.
        </p>
        <button
          type="button"
          onClick={onRetry}
          disabled={retrying}
          className="px-4 py-2 rounded-fm-btn text-white bg-fm-accent hover:opacity-90 disabled:opacity-60 transition-opacity"
        >
          {retrying ? 'Retrying…' : 'Try again'}
        </button>
      </div>
    </div>
  );
}
