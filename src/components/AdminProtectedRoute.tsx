import { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { canManageUsers } from '../lib/access';
import { DeploymentUndetermined } from './DeploymentUndetermined';

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
 * ‼ It waits for deployment detection before refusing. `canManageUsers` requires
 * a confirmed 'cloud', so it answers *false* — not "unknown" — while
 * `/auth/config` is still in flight, and this guard redirects with `replace`:
 * a cloud operator on a hard refresh was sent to `/cases` with no way back. See
 * `DeploymentUndetermined` for why that window is real and why the answer is to
 * render rather than redirect.
 */
export function AdminProtectedRoute({ children }: AdminProtectedRouteProps) {
  const { authState, loading, deployment, role, configStatus } = useAuth();

  if (loading) return null;

  // Above the deployment check: authentication is knowable without it.
  if (!authState) {
    return <Navigate to="/login" replace />;
  }

  // `deployment` is non-null only on 'ok', and a refusal here is irreversible.
  if (configStatus !== 'ok') {
    return <DeploymentUndetermined />;
  }

  if (!canManageUsers(deployment, role)) {
    return <Navigate to="/cases" replace />;
  }

  return <>{children}</>;
}
