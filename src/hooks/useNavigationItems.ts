import { useAuth } from '../context/AuthContext';
import { canManageUsers } from '../lib/access';

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
  const { deployment, role } = useAuth();

  const items: Omit<NavItem, 'active'>[] = [
    { label: 'Cases', path: '/cases' },
    { label: 'Knowledge Base', path: '/kb' },
  ];

  // LLM Settings: visible to all local users and cloud Platform Admins
  if (deployment === 'local' || role === 'platform_admin') {
    items.push({ label: 'LLM Settings', path: '/settings/llm' });
  }

  // Users (org/team management): cloud-only — see canManageUsers (ADR-006).
  if (canManageUsers(deployment, role)) {
    items.push({ label: 'Users', path: '/admin/users' });
  }

  return items.map((item) => ({
    ...item,
    active: currentPath === item.path || currentPath.startsWith(`${item.path}/`),
  }));
}
