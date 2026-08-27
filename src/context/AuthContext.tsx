/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useEffect, useState, ReactNode, useCallback } from 'react';
import { authManager, AuthState } from '../lib/api';
import config from '../config';

// Deployment type: derived from the backend auth mode
export type Deployment = 'standalone' | 'cloud';

/**
 * Whether the deployment's `/auth/config` has been confirmed.
 *
 * Kept as a separate axis rather than widening `Deployment`: `deployment` is a
 * CLAIM about which backend this is, and it must only ever hold a value the
 * backend actually confirmed. When the config endpoint cannot be reached, the
 * dashboard does not know which deployment it fronts — and it must say so
 * instead of guessing. The previous behavior defaulted to 'standalone' on any
 * fetch failure, which rendered the standalone dev-login ("LOCAL MODE ACTIVE")
 * to cloud users whose browser blocked the cross-origin config fetch (e.g.
 * Chrome's Local Network Access blocking a public page from reaching an API
 * host that resolves to a private address), and silently demoted a signed-in
 * cloud admin's role to 'individual' on a transient failure.
 */
export type ConfigStatus = 'pending' | 'ok' | 'unreachable';

/**
 * Auto-retry backoff for the auth-config fetch: total attempts = 1 + length.
 * Covers a backend that is a moment away from ready (compose startup, pod
 * restart) without hammering; a genuine block (LNA, network) settles into
 * 'unreachable' after ~4s, where the login page offers a manual Retry.
 */
export const CONFIG_RETRY_DELAYS_MS = [1000, 3000];

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

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
  /** See ConfigStatus. `deployment` is non-null only when this is 'ok'. */
  configStatus: ConfigStatus;
  /** Re-run deployment detection after an 'unreachable' verdict. */
  retryConfigDetection: () => void;
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
  const [configStatus, setConfigStatus] = useState<ConfigStatus>('pending');
  const [role, setRole] = useState<DashboardRole | null>(null);
  const [loginUrl, setLoginUrl] = useState<string | null>(null);

  /**
   * One attempt against `/auth/config`. Returns null when the deployment could
   * not be CONFIRMED — thrown fetch and non-ok response alike. Both must fail
   * closed: a 5xx/429 no more proves "standalone" than a network error does.
   */
  const fetchAuthConfigOnce = useCallback(async (): Promise<{
    dep: Deployment;
    resolvedLoginUrl: string | null;
  } | null> => {
    try {
      const res = await fetch(`${config.apiUrl}/api/v1/auth/config`);
      if (!res.ok) return null;
      const authConfig: {
        auth_mode?: string;
        oauth?: { hosted_login_url?: string; authorize_url?: string } | null;
      } = await res.json();
      const dep: Deployment = authConfig.auth_mode === 'oauth' ? 'cloud' : 'standalone';
      // The human Sign In target must be a HOSTED LOGIN URL, taken ONLY from
      // a field explicitly designated for it (`oauth.hosted_login_url`).
      // Deliberately NOT `oauth.authorize_url`: that is the copilot OAuth-PKCE
      // authorize endpoint (needs client_id/redirect_uri/PKCE params) — a
      // machine flow, not a human hosted login; conflating them sends users
      // to a broken redirect. The redirect remains deployment-config-driven —
      // no hardcoded IdP.
      const advertised = authConfig.oauth?.hosted_login_url;
      let resolvedLoginUrl: string | null = null;
      if (dep === 'cloud' && advertised) {
        resolvedLoginUrl = advertised.startsWith('http')
          ? advertised
          : `${config.apiUrl}${advertised.startsWith('/') ? '' : '/'}${advertised}`;
      }
      return { dep, resolvedLoginUrl };
    } catch {
      return null;
    }
  }, []);

  /**
   * Detect the deployment, retrying briefly, and FAIL CLOSED on exhaustion:
   * `deployment` stays null and `configStatus` becomes 'unreachable'. The
   * login page renders a retriable error for that state — never the
   * standalone dev-login, which previously masqueraded as "LOCAL MODE" in
   * front of cloud users whenever this fetch was blocked (see ConfigStatus).
   * Role derivation re-reads stored auth here so a manual Retry restores a
   * signed-in user's role too, not just the login variant.
   */
  const runConfigDetection = useCallback(async () => {
    setConfigStatus('pending');
    let result = await fetchAuthConfigOnce();
    for (const delay of CONFIG_RETRY_DELAYS_MS) {
      if (result) break;
      await sleep(delay);
      result = await fetchAuthConfigOnce();
    }
    if (!result) {
      setDeployment(null);
      setLoginUrl(null);
      setConfigStatus('unreachable');
      return;
    }
    setDeployment(result.dep);
    setLoginUrl(result.resolvedLoginUrl);
    setConfigStatus('ok');
    const state = await authManager.getAuthState();
    if (state) {
      setRole(deriveRole(result.dep, state.user.roles ?? []));
    }
  }, [fetchAuthConfigOnce]);

  const retryConfigDetection = useCallback(() => {
    void runConfigDetection();
  }, [runConfigDetection]);

  useEffect(() => {
    const load = async () => {
      setLoading(true);

      // Load stored auth state
      const state = await authManager.getAuthState();
      setAuthStateInternal(state);

      // Detect deployment from backend auth config (public endpoint, no auth
      // needed). Role derivation happens inside on success.
      await runConfigDetection();

      setLoading(false);
    };
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
        configStatus,
        retryConfigDetection,
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
