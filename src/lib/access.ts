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
 * admin view?" (ADR-012 D9 — GET /api/v1/admin/cases).
 *
 * The `platform_admin` operator reaches it in BOTH deployments. What differs is
 * not access but *what a row contains* — the D9 metadata/content split:
 *
 * - Standalone: full summaries, titles included. The operator and the data
 *   controller are the same party, so content reads are audited, not gated.
 * - Cloud: ambient metadata only (ids, org, state, timestamps, counts). Titles
 *   and transcripts are content, reachable only through the audited break-glass
 *   grant (faultmaven#815).
 *
 * That split is deliberately NOT decided here. The response is a union
 * discriminated on `view`, so the page renders the columns the backend actually
 * served instead of the columns it expects from its own notion of the
 * deployment — the two therefore cannot drift, and a mode misread cannot
 * surface a title the policy withheld. This predicate answers only "is this the
 * operator?", which is why it no longer takes a `deployment`.
 *
 * Both the nav hook and the route guard import it so they cannot drift either.
 */
export function canViewAllCases(isAdmin: boolean): boolean {
  return isAdmin;
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
