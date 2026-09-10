import { useAuth } from '../context/AuthContext';
import { useCapabilities } from './useCapabilities';
import {
  canManageConsole,
  canManageLlmConfig,
  canManageUsers,
  canUseTeams,
  canViewAllCases,
} from '../lib/access';

export interface NavItem {
  label: string;
  path: string;
  active: boolean;
}

/**
 * Returns the navigation items visible to the current user based on their
 * (deployment, role) pair. Items outside the user's access scope are absent —
 * not just hidden — so the nav bar never leaks privileged routes.
 */
export function useNavigationItems(currentPath: string): NavItem[] {
  const { deployment, role, isAdmin } = useAuth();
  const { managementConsole, teamSharing } = useCapabilities();

  const items: Omit<NavItem, 'active'>[] = [
    { label: 'Cases', path: '/cases' },
    { label: 'Knowledge Base', path: '/kb' },
  ];

  // Teams (ADR-017 D4): every signed-in account, wherever the deployment has
  // teams at all — see canUseTeams. Not an admin surface, which is the whole
  // point: a team forms by consent among its own members.
  if (canUseTeams(teamSharing)) {
    items.push({ label: 'Teams', path: '/teams' });
  }

  // All Cases (cross-tenant admin view): operator-only in both deployments —
  // see canViewAllCases. Cloud serves ambient metadata; titles need break-glass
  // (ADR-012 D9).
  if (canViewAllCases(isAdmin)) {
    items.push({ label: 'All Cases', path: '/admin/cases' });
  }

  // LLM Settings: operator-only in both deployments — see canManageLlmConfig.
  if (canManageLlmConfig(isAdmin)) {
    items.push({ label: 'LLM Settings', path: '/settings/llm' });
  }

  // Users (platform user management): cloud-only — see canManageUsers (ADR-006).
  if (canManageUsers(deployment, role)) {
    items.push({ label: 'Users', path: '/admin/users' });
  }

  // Billing organization console (ADR-017 D5): gated on the managementConsole
  // capability + platform_admin — see canManageConsole. Absent in standalone
  // and wherever the cloud composition is not wired.
  if (canManageConsole(managementConsole, role)) {
    items.push({ label: 'Organization', path: '/admin/organization' });
  }

  return items.map((item) => ({
    ...item,
    active: currentPath === item.path || currentPath.startsWith(`${item.path}/`),
  }));
}
