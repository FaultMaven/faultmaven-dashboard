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
 * Single source of truth for "can this user reach the org/team management
 * console?" (ADR-013; ADR-010 D7 — the composed Cloud admin module).
 *
 * The console lets an org admin manage the organization, its members + roles,
 * and its teams. It gates on TWO signals so both the nav hook and the route
 * guard stay in lockstep (anti-drift, same as the other predicates here):
 *
 * - `managementConsole`: the backend capability flag (`/v1/meta/capabilities`),
 *   true ONLY when a live TeamService is wired (Cloud multi-tenancy, ADR-010
 *   P2). This is the deployment-level gate — deliberately NOT `deployment ===
 *   'cloud'`, which would light the console up in Cloud before multi-tenancy is
 *   ready (the reason the flag exists; see faultmaven#749).
 * - `platform_admin`: the frontend's best-available admin proxy. The backend is
 *   the real authority — every admin route enforces the caller's ORG role and
 *   403s non-admins — so this only decides who is OFFERED the console. (The
 *   JWT-role vs org-role reconciliation is a known separate concern, #706.)
 */
export function canManageConsole(
  managementConsole: boolean,
  role: DashboardRole | null,
): boolean {
  return managementConsole && role === 'platform_admin';
}

/**
 * Single source of truth for "can this user reach the cross-tenant All-Cases
 * admin view?" (ADR-012 D9 — GET /api/v1/admin/cases).
 *
 * Standalone (self-hosted): the single operator, when they hold the
 * `platform_admin` role, can see every user's cases — including Slack-agent-owned cases — in one
 * place. This is where the backend serves the endpoint.
 *
 * Cloud: cross-tenant reads require an audited break-glass override
 * (ADR-012 D7/D8) that is not built yet, and the backend returns 403 there, so
 * the view is intentionally deferred for cloud `platform_admin` for now. Both
 * the nav hook and the route guard import this predicate so they cannot drift.
 */
export function canViewAllCases(
  deployment: Deployment | null,
  isAdmin: boolean,
): boolean {
  return deployment === 'standalone' && isAdmin;
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
