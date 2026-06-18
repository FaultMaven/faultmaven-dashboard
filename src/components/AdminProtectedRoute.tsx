import { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { canManageUsers } from '../lib/access';

interface AdminProtectedRouteProps {
  children: ReactNode;
}

/**
 * AdminProtectedRoute Component
 *
 * Guards the user-management route (/admin/users). User management
 * (invite / roles / members) is a cloud-only collaboration feature: per
 * ADR-006 the standalone Community Edition is single-operator, so this route
 * must be unreachable there even by typing the URL — not merely hidden from the
 * nav. Both this guard and the navigation hook delegate to `canManageUsers`, so
 * they can never drift (the drift that previously let a standalone admin reach
 * /admin/users directly, since the standalone operator carries the `admin` role).
 */
export function AdminProtectedRoute({ children }: AdminProtectedRouteProps) {
  const { authState, loading, deployment, role } = useAuth();

  if (loading) return null;

  if (!authState) {
    return <Navigate to="/login" replace />;
  }

  if (!canManageUsers(deployment, role)) {
    return <Navigate to="/cases" replace />;
  }

  return <>{children}</>;
}
