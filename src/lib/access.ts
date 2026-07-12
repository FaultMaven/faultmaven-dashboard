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
 * Single source of truth for "can this user reach the cross-tenant All-Cases
 * admin view?" (ADR-012 D9 — GET /api/v1/admin/cases).
 *
 * Standalone (self-hosted): the single operator, when they hold the `admin`
 * role, can see every user's cases — including Slack-agent-owned cases — in one
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
