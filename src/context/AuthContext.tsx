/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useEffect, useState, ReactNode, useCallback } from 'react';
import { authManager, AuthState } from '../lib/api';
import config from '../config';

// Deployment type: derived from the backend auth mode
export type Deployment = 'standalone' | 'cloud';

// Dashboard role: derived from the JWT roles array and deployment
export type DashboardRole = 'individual' | 'standard_user' | 'platform_admin';

/**
 * The backend distinguishes two roles that both used to read as "admin"
 * (ADR-012 D9), and only one of them is what this dashboard means by
 * `platform_admin`:
 *
 * - `platform_admin` — the DEPLOYMENT operator; cross-tenant reach.
 * - `admin`          — ORGANIZATION-scoped; full authority inside one tenant,
 *                      none outside it.
 *
 * This must key on `platform_admin` alone. Keying on `admin` (as it did while
 * the backend had only the one role string) would light up the operator UI for
 * every org admin in cloud, then 403 on every request behind it.
 */
export function deriveRole(deployment: Deployment, roles: string[]): DashboardRole {
  if (deployment === 'standalone') return 'individual';
  if (roles.includes('platform_admin')) return 'platform_admin';
  return 'standard_user';
}

interface AuthContextValue {
  authState: AuthState | null;
  loading: boolean;
  isAuthenticated: boolean;
  isAdmin: boolean;
  deployment: Deployment | null;
  role: DashboardRole | null;
  /**
   * Deployment-config-driven sign-in URL for cloud (OIDC) deployments, resolved
   * from the backend's `/auth/config`. `null` in standalone (passwordless
   * dev-login) or when the backend has not advertised an IdP authorize URL. The
   * dashboard never hardcodes the IdP (WorkOS) — it follows whatever the
   * deployment's auth config advertises.
   */
  loginUrl: string | null;
  setAuthState: (state: AuthState | null) => Promise<void>;
  clearAuthState: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);
AuthContext.displayName = 'AuthContext';

export function AuthProvider({ children }: { children: ReactNode }) {
  const [authState, setAuthStateInternal] = useState<AuthState | null>(null);
  const [loading, setLoading] = useState(true);
  const [deployment, setDeployment] = useState<Deployment | null>(null);
  const [role, setRole] = useState<DashboardRole | null>(null);
  const [loginUrl, setLoginUrl] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      setLoading(true);

      // Load stored auth state
      const state = await authManager.getAuthState();
      setAuthStateInternal(state);

      // Detect deployment from backend auth config (public endpoint, no auth needed)
      let dep: Deployment = 'standalone';
      let resolvedLoginUrl: string | null = null;
      try {
        const res = await fetch(`${config.apiUrl}/api/v1/auth/config`);
        if (res.ok) {
          const authConfig: {
            auth_mode?: string;
            oauth?: { hosted_login_url?: string; authorize_url?: string } | null;
          } = await res.json();
          dep = authConfig.auth_mode === 'oauth' ? 'cloud' : 'standalone';
          // The human Sign In target must be a HOSTED LOGIN URL, taken ONLY from
          // a field explicitly designated for it (`oauth.hosted_login_url`).
          // Deliberately NOT `oauth.authorize_url`: that is the copilot OAuth-PKCE
          // authorize endpoint (needs client_id/redirect_uri/PKCE params) — a
          // machine flow, not a human hosted login; conflating them sends users
          // to a broken redirect. The WorkOS/OIDC backend workstream will
          // populate `hosted_login_url` in /auth/config; until then this stays
          // null and the login page shows an honest "not configured" state. The
          // redirect remains deployment-config-driven — no hardcoded IdP.
          const advertised = authConfig.oauth?.hosted_login_url;
          if (dep === 'cloud' && advertised) {
            resolvedLoginUrl = advertised.startsWith('http')
              ? advertised
              : `${config.apiUrl}${advertised.startsWith('/') ? '' : '/'}${advertised}`;
          }
        }
      } catch {
        // Network error or backend unavailable — default to standalone
      }
      setDeployment(dep);
      setLoginUrl(resolvedLoginUrl);

      // Derive role from JWT roles array and deployment
      if (state) {
        setRole(deriveRole(dep, state.user.roles ?? []));
      }

      setLoading(false);
    };
    load();
  }, []);

  // React to AuthManager-initiated clears (a definitive refresh failure wipes
  // storage from deep inside the API layer). Without this, React state still
  // said "authenticated" and the user was stuck on error banners; now the
  // context drops its state so ProtectedRoute routes back to login.
  useEffect(() => {
    const unsubscribe = authManager.onAuthCleared(() => {
      setAuthStateInternal(null);
      setRole(null);
    });
    return unsubscribe;
  }, []);

  const setAuthState = useCallback(
    async (state: AuthState | null) => {
      if (state) {
        await authManager.saveAuthState(state);
        setAuthStateInternal(state);
        // Re-derive role on login (deployment already resolved)
        if (deployment) {
          setRole(deriveRole(deployment, state.user.roles ?? []));
        }
      } else {
        await authManager.clearAuthState();
        setAuthStateInternal(null);
        setRole(null);
      }
    },
    [deployment]
  );

  const clearAuthState = useCallback(async () => {
    await authManager.clearAuthState();
    setAuthStateInternal(null);
    setRole(null);
  }, []);

  return (
    <AuthContext.Provider
      value={{
        authState,
        loading,
        isAuthenticated: !!authState,
        // Operator flag (ADR-012 D9) — the cross-tenant `platform_admin` role,
        // NOT the org-scoped `admin`. Backs `canViewAllCases`, which gates the
        // All Cases view served by `GET /api/v1/admin/cases`.
        isAdmin: !!authState?.user?.roles?.includes('platform_admin'),
        deployment,
        role,
        loginUrl,
        setAuthState,
        clearAuthState,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return ctx;
}
