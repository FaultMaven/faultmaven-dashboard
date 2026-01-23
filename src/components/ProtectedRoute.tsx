import { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

interface ProtectedRouteProps {
  children: ReactNode;
}

/**
 * ProtectedRoute Component
 *
 * Protects routes that require authentication. If the user is not authenticated,
 * saves the current URL (including query params) to sessionStorage and redirects
 * to the login page.
 *
 * This is critical for the OAuth flow:
 * 1. Extension opens /auth/authorize?client_id=...&code_challenge=...
 * 2. User not authenticated → ProtectedRoute saves full URL
 * 3. User redirected to /login
 * 4. User logs in successfully
 * 5. LoginPage checks sessionStorage.oauth_redirect_after_login
 * 6. User redirected back to /auth/authorize with all original params
 * 7. User sees OAuth consent page
 */
export function ProtectedRoute({ children }: ProtectedRouteProps) {
  const { isAuthenticated } = useAuth();
  const location = useLocation();

  if (!isAuthenticated) {
    // Save current URL with query params for post-login redirect
    const currentUrl = `${location.pathname}${location.search}`;
    sessionStorage.setItem('oauth_redirect_after_login', currentUrl);

    // Redirect to login
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
}
