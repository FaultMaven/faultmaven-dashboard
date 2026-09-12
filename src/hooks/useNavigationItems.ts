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
    /*
     * New Case (ADR-018 D2 point 3): the full-page surface, FIRST because it is
     * this nav's primary call to action. `@faultmaven/copilot-ui` puts its own
     * `+ New Case` at the top of its navigation, and for the population with no
     * side panel — Firefox, managed browsers, self-hosted — this page is where
     * the whole workflow starts. Behind `Cases` it reads as a detail of the
     * record surfaces rather than the way in, which is how it has been reachable
     * so far: only by redirect from sign-in and from an empty case list, i.e.
     * never again once the account has one case.
     *
     * The label is `New Case`, never "New Investigation" (D5). ADR-005 makes an
     * investigation a PHASE a case enters past INQUIRY, so no control can create
     * one; the path stays `/investigate` because routes are not copy (D5) and
     * renaming it would break `resolvePostSignInLanding()` and the case list's
     * empty state, which both already link here.
     *
     * Ungated on purpose: every signed-in account may start a case. ADR-018
     * row 6 makes the item conditional on the "use the Copilot extension for
     * chat" preference (D3), which does not exist yet — standing in a
     * capability flag for it would gate the item on something no backend serves
     * and hide the on-ramp from everyone the moment the flag defaulted off.
     */
    { label: 'New Case', path: '/investigate' },
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
