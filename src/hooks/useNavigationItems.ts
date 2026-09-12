import { useAuth } from '../context/AuthContext';
import { useCapabilities } from './useCapabilities';
import { usePrefersExtensionForChat } from './useChatSurface';
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
  /**
   * Is this a thing you DO, rather than a place you go?
   *
   * Every other item in this nav is a destination, so an action sitting among
   * them reads as one — "New Case" beside "Cases" looks like a filtered view of
   * the case list rather than a button that creates something. The fix is
   * weight, not words: the header renders this one as a filled control with a
   * leading `+`, which is why the identical label reads correctly in the
   * extension's sidebar (`+ New Case` there too).
   */
  action?: boolean;
}

/**
 * Returns the navigation items visible to the current user based on their
 * (deployment, role) pair. Items outside the user's access scope are absent —
 * not just hidden — so the nav bar never leaks privileged routes.
 */
export function useNavigationItems(currentPath: string): NavItem[] {
  const { deployment, role, isAdmin } = useAuth();
  const { managementConsole, teamSharing } = useCapabilities();
  const prefersExtension = usePrefersExtensionForChat();

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
     * No ROLE gate — every signed-in account may start a case. The one thing
     * that removes it is the person's own "use the Copilot extension for chat"
     * preference (ADR-018 D3): that surface is a full-page composer, and
     * someone who has moved chat to the extension does not want a nav item
     * leading to a second one. It comes straight back when they turn the
     * preference off, which is why this is safe to hide rather than disable.
     */
    ...(prefersExtension ? [] : [{ label: 'New Case', path: '/investigate', action: true }]),
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
