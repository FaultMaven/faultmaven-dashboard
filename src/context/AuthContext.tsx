/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useEffect, useState, ReactNode, useCallback } from 'react';
import { authManager, AuthState } from '../lib/api';
import config from '../config';

// Deployment type: derived from the backend auth mode
export type Deployment = 'local' | 'cloud';

// Dashboard role: derived from the JWT roles array and deployment
export type DashboardRole = 'individual' | 'standard_user' | 'platform_admin';

function deriveRole(deployment: Deployment, roles: string[]): DashboardRole {
  if (deployment === 'local') return 'individual';
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

  useEffect(() => {
    const load = async () => {
      setLoading(true);

      // Load stored auth state
      const state = await authManager.getAuthState();
      setAuthStateInternal(state);

      // Detect deployment from backend auth config (public endpoint, no auth needed)
      let dep: Deployment = 'local';
      try {
        const res = await fetch(`${config.apiUrl}/api/v1/auth/config`);
        if (res.ok) {
          const authConfig: { auth_mode?: string } = await res.json();
          dep = authConfig.auth_mode === 'oauth' ? 'cloud' : 'local';
        }
      } catch {
        // Network error or backend unavailable — default to local
      }
      setDeployment(dep);

      // Derive role from JWT roles array and deployment
      if (state) {
        setRole(deriveRole(dep, state.user.roles ?? []));
      }

      setLoading(false);
    };
    load();
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
