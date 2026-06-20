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
