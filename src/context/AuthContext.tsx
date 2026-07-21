/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useEffect, useState, ReactNode, useCallback } from 'react';
import { authManager, AuthState } from '../lib/api';
import config from '../config';

// Deployment type: derived from the backend auth mode
export type Deployment = 'standalone' | 'cloud';

// Dashboard role: derived from the JWT roles array and deployment
export type DashboardRole = 'individual' | 'standard_user' | 'platform_admin';

function deriveRole(deployment: Deployment, roles: string[]): DashboardRole {
  if (deployment === 'standalone') return 'individual';
  if (roles.includes('admin')) return 'platform_admin';
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
            oauth?: { authorize_url?: string } | null;
          } = await res.json();
          dep = authConfig.auth_mode === 'oauth' ? 'cloud' : 'standalone';
          // Cloud sign-in target comes from the deployment's advertised IdP
          // authorize URL — never a hardcoded provider. Relative URLs resolve
          // against the API origin.
          const advertised = authConfig.oauth?.authorize_url;
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
        isAdmin: !!authState?.user?.roles?.includes('admin') || !!authState?.user?.is_admin,
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
