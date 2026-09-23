import { ReactNode } from 'react';
import { canManageUsers } from '../lib/access';
import { GatedRoute } from './GatedRoute';

interface AdminProtectedRouteProps {
  children: ReactNode;
}

/**
 * AdminProtectedRoute Component
 *
 * Guards the user-management route (/admin/users). User management
 * (invite / roles / members) is a cloud-only collaboration feature: the
 * standalone (self-hosted) deployment is single-operator, so this route
 * must be unreachable there even by typing the URL — not merely hidden from the
 * nav. Both this guard and the navigation hook delegate to `canManageUsers`, so
 * they can never drift (the drift that previously let a standalone admin reach
 * /admin/users directly, since the standalone operator carries the `admin` role).
 *
 * `requires: { deployment: true }` because `canManageUsers` needs a confirmed
 * `'cloud'` and therefore answers *false* — not "unknown" — while `/auth/config`
 * is in flight. `GatedRoute` owns what happens in that window and why.
 */
export function AdminProtectedRoute({ children }: AdminProtectedRouteProps) {
  return (
    <GatedRoute
      requires={{ deployment: true }}
      allow={({ deployment, role }) => canManageUsers(deployment, role)}
    >
      {children}
    </GatedRoute>
  );
}
