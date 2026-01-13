/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useEffect, useState, ReactNode, useCallback } from 'react';
import { authManager, AuthState } from '../lib/api';

interface AuthContextValue {
  authState: AuthState | null;
  loading: boolean;
  isAuthenticated: boolean;
  isAdmin: boolean;
  setAuthState: (state: AuthState | null) => Promise<void>;
  clearAuthState: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);
AuthContext.displayName = 'AuthContext';

export function AuthProvider({ children }: { children: ReactNode }) {
  const [authState, setAuthStateInternal] = useState<AuthState | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      const state = await authManager.getAuthState();
      setAuthStateInternal(state);
      setLoading(false);
    };
    load();
  }, []);

  const setAuthState = useCallback(async (state: AuthState | null) => {
    if (state) {
      await authManager.saveAuthState(state);
      setAuthStateInternal(state);
    } else {
      await authManager.clearAuthState();
      setAuthStateInternal(null);
    }
  }, []);

  const clearAuthState = useCallback(async () => {
    await authManager.clearAuthState();
    setAuthStateInternal(null);
  }, []);

  return (
    <AuthContext.Provider
      value={{
        authState,
        loading,
        isAuthenticated: !!authState,
    isAdmin: !!authState?.user?.roles?.includes('admin') || !!authState?.user?.is_admin,
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










