import { ReactNode, useEffect } from 'react';
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
  const { isAuthenticated, loading } = useAuth();
  const location = useLocation();

  // Save the intended destination (with query params) for post-login redirect.
  // Done in an effect rather than during render so it does not double-write
  // under StrictMode's double-invoked render.
  useEffect(() => {
    if (!loading && !isAuthenticated) {
      const currentUrl = `${location.pathname}${location.search}`;
      sessionStorage.setItem('oauth_redirect_after_login', currentUrl);
    }
  }, [loading, isAuthenticated, location.pathname, location.search]);

  // Auth state hydrates asynchronously (AuthContext). Render nothing until it
  // resolves so a valid session is not bounced to /login on a hard refresh —
  // matches AdminProtectedRoute / LLMConfigRoute / AllCasesRoute.
  if (loading) return null;

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
}
