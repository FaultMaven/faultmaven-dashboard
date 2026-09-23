import { useEffect, useState } from 'react';
import { localNetworkAccessLikelyBlocked } from '../lib/auth/lnaDiagnosis';

interface EligibilityUndeterminedProps {
  /** Is the answer still on its way, as opposed to having failed at least once? */
  pending: boolean;
  /** Re-ask the question this route could not answer. */
  onRetry: () => Promise<void>;
}

/**
 * What a **fail-closed** route guard renders while it cannot yet know whether
 * this page exists for this user.
 *
 * Two different fetches can leave a guard unable to answer — `/auth/config`
 * (the deployment) and `/meta/capabilities` (the feature flags) — and the
 * predicates collapse both unknowns into `false`. Since the guards redirect with
 * `replace`, that sent a cloud operator to `/cases` with no way back, for a
 * question the app had not yet been able to ask. AuthContext already named the
 * failure beside `CONFIG_REPROBE_INTERVAL_MS`: "a cloud admin whose session
 * started during an API blip would otherwise keep a null deployment/role (hidden
 * admin nav, redirected admin routes) until a full reload." The reprobe heals the
 * nav; it cannot un-redirect a route.
 *
 * A redirect is the only irreversible branch, so it is the one thing a guard must
 * not do while the answer is unknown. `GatedRoute` owns that ordering; this is
 * only what it shows.
 *
 * `pending` is the caller's, not read from context, because the two causes have
 * different in-flight signals (`configStatus === 'pending'` vs a capabilities
 * `loading`) and different retries — and a card offering the wrong retry is worse
 * than none.
 *
 * ‼ `pending: false` does NOT mean "stopped trying". For the deployment,
 * `configStatus` flips to 'unreachable' after the FIRST failed probe and only
 * then runs the retry ladder, with a 30s reprobe after that; capabilities refetch
 * on window focus. So this must not render an indefinite spinner that claims
 * progress — it says plainly what is not known and offers one explicit attempt,
 * the way the login page's card does.
 */
export function EligibilityUndetermined({ pending, onRetry }: EligibilityUndeterminedProps) {
  const [retrying, setRetrying] = useState(false);
  const [attempts, setAttempts] = useState(0);
  // ASYNC, so it is resolved in an effect and not called in the render body —
  // the probe returns a Promise, and a Promise is truthy, so a bare call would
  // show the local-network diagnosis unconditionally. Same shape LoginPage uses.
  const [lnaLikely, setLnaLikely] = useState(false);

  useEffect(() => {
    let live = true;
    void localNetworkAccessLikelyBlocked().then((blocked) => {
      if (live) setLnaLikely(blocked);
    });
    return () => {
      live = false;
    };
  }, []);

  if (pending) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-fm-canvas">
        <div className="text-fm-text-secondary" role="status">
          Loading...
        </div>
      </div>
    );
  }

  const handleRetry = async () => {
    setRetrying(true);
    try {
      await onRetry();
    } finally {
      // Unconditional, and that is correct: a SUCCESSFUL retry unmounts this
      // component (the parent's gate opens), so this setter never lands; a failed
      // one must re-enable the button. React no-ops a set on an unmounted tree,
      // so there is nothing to guard against.
      setRetrying(false);
      // A failed retry is otherwise INVISIBLE: `configStatus` is set to the same
      // 'unreachable' value, so React bails out of the re-render and the card is
      // byte-identical before and after the click. Counting attempts gives the
      // live region something to announce.
      setAttempts((n) => n + 1);
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
          out whether it is available here. Nothing is wrong with your account.
        </p>

        {/* The same diagnosis the SIGNED-OUT visitor gets on this exact failure
            (`LoginPage`'s UnreachableCard). Withholding it here meant an operator
            whose session happened to be stored got strictly less help than one
            whose was not. */}
        {lnaLikely ? (
          <p className="text-fm-text-secondary text-sm mb-4">
            This browser may be blocking access to a private-network address. Open the site settings
            for this page and set <strong>Local network access</strong> to Allow, then try again.
          </p>
        ) : (
          <p className="text-fm-text-secondary text-sm mb-4">
            Check that the API is running and reachable from this browser.
          </p>
        )}

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={handleRetry}
            disabled={retrying}
            className="px-4 py-2 rounded-fm-btn text-white bg-fm-accent hover:opacity-90 disabled:opacity-60 transition-opacity"
          >
            {retrying ? 'Retrying…' : 'Try again'}
          </button>
          {/* NOT a dead end. An operator who arrived by clicking a nav item has
              no header here to leave by, and "press Back" is not an affordance. */}
          <a href="/cases" className="text-sm text-fm-accent hover:underline">
            Back to cases
          </a>
        </div>

        {/* Always rendered, filled only after an attempt: a live region inserted
            with content already in it is the case assistive tech handles least
            consistently. */}
        <p role="status" aria-live="polite" className="text-sm text-fm-text-tertiary mt-3">
          {attempts > 0 && !retrying
            ? `Still can’t reach the API (${attempts} ${attempts === 1 ? 'attempt' : 'attempts'}).`
            : ''}
        </p>
      </div>
    </div>
  );
}
