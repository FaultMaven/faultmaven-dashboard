import { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth, type DashboardRole, type Deployment } from '../context/AuthContext';
import { useCapabilities } from '../hooks/useCapabilities';
import { EligibilityUndetermined } from './EligibilityUndetermined';

/** Everything a route predicate may read, once it is known to BE known. */
export interface GateFacts {
  deployment: Deployment | null;
  role: DashboardRole | null;
  isAdmin: boolean;
  managementConsole: boolean;
  teamSharing: boolean;
}

interface GatedRouteProps {
  children: ReactNode;
  /**
   * Which asynchronously-fetched facts `allow` reads. Anything named here must
   * have LANDED before `allow` is consulted.
   *
   * It is not a convenience: every predicate in `lib/access.ts` answers `false`
   * for an unknown signal, because that is right for rendering a feature
   * (ADR-019: absent reads as NO). A ROUTE is different — it redirects, and
   * "we could not ask" is not "no". Naming the dependency is what stops a
   * guard turning a pending fetch into an irreversible redirect.
   */
  requires?: { deployment?: boolean; capabilities?: boolean };
  /** Evaluated only once every required fact is in hand. */
  allow: (facts: GateFacts) => boolean;
}

/**
 * The one ordering every authenticated route shares.
 *
 * It exists because the ordering is subtle and was got wrong twice in two
 * commits — once per guard, each with its own paragraph of comment explaining
 * the same rule. The fix is not a third copy: the order lives here, and a guard
 * supplies only its predicate, so a new deployment-gated route cannot re-open
 * the bug by omission. (Same reasoning as `dateColumn` being REQUIRED rather
 * than defaulted — a silent default re-opened #155 for the next caller.)
 *
 * The sequence, and why it is this one:
 *
 * 1. **`loading`** — the stored-auth read. Nothing is knowable before it.
 * 2. **`!authState` → `/login`** — ABOVE every fetch, because authentication is
 *    knowable without the network. A signed-out visitor following a stale
 *    bookmark was otherwise held on a blank page for a request whose answer
 *    could not change where they were going. (Measured: with capabilities
 *    hanging, `/admin/organization` never reached `/login` at all.)
 * 3. **required facts** — render `EligibilityUndetermined` rather than refusing.
 *    `pending` distinguishes "still coming" from "failed at least once", and the
 *    retry handed over is the one for the fetch that actually failed.
 * 4. **`allow`** — now, and only now, a `false` means "no" rather than
 *    "don't know".
 *
 * ⛔ A route whose predicate fails OPEN on an unknown signal should NOT list it
 * in `requires`. `AllCasesRoute` is the example: `canViewAllCases` allows on a
 * null deployment deliberately, so it has no irreversible branch to protect, and
 * waiting would cost a cloud operator up to 8s of blank screen while the nav
 * item beside it still offered the link.
 */
export function GatedRoute({ children, requires, allow }: GatedRouteProps) {
  const { authState, loading, deployment, role, isAdmin, configStatus, retryConfigDetection } =
    useAuth();
  const {
    managementConsole,
    teamSharing,
    loading: capLoading,
    error: capError,
    refetch: refetchCapabilities,
  } = useCapabilities();

  if (loading) return null;

  if (!authState) {
    return <Navigate to="/login" replace />;
  }

  if (requires?.deployment && configStatus !== 'ok') {
    return (
      <EligibilityUndetermined
        pending={configStatus === 'pending'}
        onRetry={retryConfigDetection}
      />
    );
  }

  // `capError` counts, not just `capLoading`: a failed capabilities fetch leaves
  // the hook returning its defaults (every flag `false`), which a predicate reads
  // as "the feature is off" and a guard turns into a redirect. Correct for
  // rendering a feature, wrong for deciding whether a page exists.
  // Truthiness, not `!== null`: the hook types this `string | null`, so there is
  // no meaningful empty-string error, and a test double that omits the key would
  // otherwise read `undefined` as a failure and hide every page behind this card.
  if (requires?.capabilities && (capLoading || Boolean(capError))) {
    return <EligibilityUndetermined pending={capLoading} onRetry={refetchCapabilities} />;
  }

  if (!allow({ deployment, role, isAdmin, managementConsole, teamSharing })) {
    return <Navigate to="/cases" replace />;
  }

  return <>{children}</>;
}
