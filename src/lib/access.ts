import type { Deployment, DashboardRole } from '../context/AuthContext';

/**
 * Single source of truth for "can this user reach the user-management UI?"
 *
 * User management (invite / roles / members) is a cloud collaboration feature.
 * The standalone (self-hosted) deployment is single-tenant and
 * single-operator, so org/team management has no place there — it is absent
 * from the nav AND unreachable by direct URL. Both the navigation hook and the
 * route guard import this predicate so they can never drift apart (the drift
 * that previously let a standalone admin reach /admin/users by typing the URL).
 */
export function canManageUsers(
  deployment: Deployment | null,
  role: DashboardRole | null,
): boolean {
  return deployment === 'cloud' && role === 'platform_admin';
}

/**
 * Single source of truth for "can this user reach the BILLING organization
 * console?" (ADR-017 D5).
 *
 * The console shows the organization that pays for a set of accounts, its
 * members and their management roles. It gates on TWO signals so both the nav
 * hook and the route guard stay in lockstep (anti-drift, same as the other
 * predicates here):
 *
 * - `managementConsole`: the backend capability flag
 *   (`/api/v1/meta/capabilities`), true ONLY when the cloud composition is
 *   wired. This is the deployment-level gate — deliberately NOT `deployment ===
 *   'cloud'`, which would light the console up before it can answer (the reason
 *   the flag exists; see faultmaven#749).
 * - `platform_admin`: the frontend's best-available admin proxy. The backend is
 *   the real authority — the cloud module enforces the caller's ORGANIZATION
 *   management role per request and 403s everyone else — so this only decides
 *   who is OFFERED the console. (The JWT-role vs organization-role
 *   reconciliation is a known separate concern, #706.)
 *
 * It does NOT gate teams. Teams moved to `canUseTeams` below when the org-admin
 * team console was deleted (cloud contract 2.0.0): a billing admin has no
 * standing over a team (ADR-017 D2), and a team forms by consent among its own
 * members (D4).
 */
export function canManageConsole(
  managementConsole: boolean,
  role: DashboardRole | null,
): boolean {
  return managementConsole && role === 'platform_admin';
}

/**
 * Single source of truth for "can this user reach the Teams page?"
 * (ADR-017 D4).
 *
 * ONE signal, and deliberately no role: **any account may create a team and is
 * its team admin**. Gating this on `platform_admin` — as the old combined
 * console did — would put the product's entire sharing model behind an operator
 * role almost nobody holds, and would contradict the decision it implements.
 *
 * `teamSharing` is the backend's own flag for "this deployment has teams at
 * all". Standalone has one enterprise, one default team and one account, so its
 * `/teams` and `/invitations` routes answer 403
 * `single_tenant_has_no_teams` / `single_tenant_has_no_invitations`; the
 * capability is what lets a client hide the page rather than discover the
 * refusal.
 *
 * Authority within a team stays the backend's: whether the caller may invite is
 * their `team_role` on that team's roster, read per team, never a role carried
 * here.
 */
export function canUseTeams(teamSharing: boolean): boolean {
  return teamSharing;
}

/**
 * Single source of truth for "can this user reach the cross-tenant All-Cases
 * view?" (ADR-012 D9 — `GET /api/v1/admin/cases`).
 *
 * TWO signals, and the deployment is the load-bearing one:
 *
 * - **Cloud**: the `platform_admin` operator, whose rows are other tenants' and
 *   arrive as ambient metadata — ids, org, state, timestamps, counts. Titles
 *   and transcripts are content, reachable only through the audited break-glass
 *   grant (faultmaven#815). A genuinely different view from `Cases`.
 * - **Standalone**: nobody, because there is nothing for it to show.
 *   ‼ **Standalone is single-user by design** — a personal assistant running
 *   locally, which is what makes its passwordless username login acceptable in
 *   the first place. So "every case on the server" and "my cases" are the same
 *   list, and this view can only ever be a weaker copy of `Cases`: the same
 *   rows and the same table, an Owner column of one repeated value, and none of
 *   the date or search filters the admin endpoint accepts. Opening one through
 *   `AdminCaseContentPage` would also write an operator-access audit row for
 *   reading your own case, which is a trail of nothing.
 *
 * It CAN technically hold more accounts (`faultmaven.sh create-user` makes
 * ordinary `["user"]` ones; only the bootstrap account is the operator), and
 * that is the single shape where this view would show the operator something
 * `Cases` cannot. Multi-user standalone is **not a supported configuration**
 * and earns no route, no nav slot and no branch — carrying a non-use-case as
 * "a limitation to fix later" is how UI and configuration accrete around it.
 * A deployment that genuinely has several people is `AUTH_MODE=oauth`, which
 * this app reads as cloud and which brings real identity, teams and RBAC with
 * it. That is the axis multi-user lives on, not a flag on standalone.
 *
 * ‼ `null` deployment ALLOWS, and the route waits rather than guessing.
 * `isAdmin` resolves synchronously from stored auth state but `deployment`
 * needs a `/auth/config` round trip that `loading` does not cover, so an
 * unconfirmed deployment is a real state on every hard refresh and for as long
 * as that endpoint is unreachable. A gate that failed CLOSED here would bounce
 * a cloud operator off their own bookmark — destructive, and for a client-side
 * check whose authority is the backend anyway. `AllCasesRoute` therefore blanks
 * while `configStatus` is `'pending'` and decides once it settles; if detection
 * never lands, this allows, and the server still refuses anyone who should not
 * be here.
 *
 * ONE predicate for the nav item AND the route, which is the point. #177 split
 * them — a deployment-blind guard plus an `offersAllCasesNav` offer — purely to
 * keep the route open for the multi-account standalone operator. With that
 * configuration unsupported there is nothing on the other side of the split, so
 * it is gone and the two cannot drift again.
 */
export function canViewAllCases(
  deployment: Deployment | null,
  isAdmin: boolean,
): boolean {
  return deployment !== 'standalone' && isAdmin;
}

/**
 * Single source of truth for "can this user reach LLM configuration?"
 * (`GET/PUT /api/v1/admin/llm/config`, `GET /api/v1/admin/config/status`).
 *
 * Those endpoints are operator-only in both deployments (ADR-012 D9). This
 * predicate takes `isAdmin` rather than `role` because `deriveRole` collapses
 * every standalone account to `individual`, so `role === 'platform_admin'` is
 * unreachable in standalone and a role-based check would have to fall back to
 * "any standalone user" — which no longer matches the backend and would show
 * the page to accounts that then 403 on every request behind it.
 */
export function canManageLlmConfig(isAdmin: boolean): boolean {
  return isAdmin;
}

