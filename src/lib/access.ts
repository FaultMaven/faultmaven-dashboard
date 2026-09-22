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
 * The ROUTE GUARD imports it. The nav item does NOT — it asks
 * `offersAllCasesNav` below, which answers a different question and answers it
 * differently in standalone. That split is deliberate and is the one place in
 * this file where an offer and a guard are allowed to disagree; they still
 * share this predicate for the ROLE half, so they cannot drift on who counts
 * as an operator.
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

/**
 * Single source of truth for "do we OFFER the All-Cases view in the nav?"
 *
 * Deliberately NOT `canViewAllCases`, and the split is the point. That
 * predicate answers access; this one answers whether the item earns a slot in
 * the nav bar, which standalone answers differently — because there the view it
 * leads to is usually a copy of `Cases`:
 *
 * - The standalone bootstrap creates ONE account, `admin`, and re-grants it the
 *   operator roles on every startup (`ensure_default_admin_exists` →
 *   `assign_operator_roles`). Every OTHER standalone account is an ordinary
 *   user — `scripts/auth/create_user.py` defaults to `["user"]` — so the
 *   operator is one specific account, not "whoever is signed in".
 * - The backend serves standalone the `full` arm of `GET /admin/cases` (titles
 *   included, `metadata_only = settings.is_cloud`), which the page renders with
 *   the same `CaseTable` as `/cases`.
 * - On the single-account deployment — the default, and what `faultmaven.sh up`
 *   gives you — that one account owns every case on the server, so the two
 *   lists are the same rows. Measured on a live stack: `GET /cases` and
 *   `GET /admin/cases` returned the same 21 ids, all owned by the operator. The
 *   item was a second `Cases` with an Owner column of one repeated value and
 *   without the date and search filters the admin endpoint does not accept.
 *
 * Cloud is the opposite case: the operator role is granted out-of-band and
 * never by a login path (ADR-015 D5), so few hold it and the rows they see are
 * other tenants' — a genuinely different view, served as metadata only.
 *
 * ‼ THIS IS A HEURISTIC, and the multi-account standalone deployment is where
 * it is wrong. Add accounts with `faultmaven.sh create-user` and the bootstrap
 * operator's `/admin/cases` does contain rows their own list cannot show
 * (standalone has no teams, so `/cases` is owner-only). The discriminating fact
 * is "does the admin list hold rows I do not own?", which only the backend
 * knows; `deployment` is a proxy for it and the proxy is wrong for that
 * population. It is a deliberate trade, not an oversight: hiding the ITEM
 * leaves `/admin/cases` reachable by URL — the route keeps `canViewAllCases` —
 * so that operator loses a nav slot, not the view. Publishing the real fact as
 * a backend capability, the way `managementConsole` and `teamSharing` already
 * work, is the principled fix and is follow-up.
 *
 * ‼ `!== 'standalone'`, NOT `=== 'cloud'`, and the difference is only visible
 * while the deployment is unconfirmed. `isAdmin` comes from stored auth state
 * synchronously, but `deployment` needs a `/auth/config` round trip that
 * `loading` does not cover (AuthContext starts the probe alongside the auth
 * load and blanks pages on the auth load alone), so the nav really does render
 * with `deployment === null` on every hard refresh — and stays there for as
 * long as that endpoint is unreachable. Requiring a confirmed `'cloud'` would
 * take the item away from the CLOUD operator in both of those windows, which is
 * a change to the deployment this fix is not supposed to touch. So null shows
 * it, exactly as before this predicate existed, and the cost lands where the
 * change already lives: a standalone nav briefly renders the item before
 * detection resolves and then drops it. Cloud behaviour is byte-identical to
 * the old `canViewAllCases(isAdmin)`.
 */
export function offersAllCasesNav(
  deployment: Deployment | null,
  isAdmin: boolean,
): boolean {
  return deployment !== 'standalone' && canViewAllCases(isAdmin);
}
