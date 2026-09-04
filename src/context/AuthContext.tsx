/* eslint-disable react-refresh/only-export-components */
import {
  createContext,
  useContext,
  useEffect,
  useState,
  useRef,
  useMemo,
  ReactNode,
  useCallback,
} from 'react';
import { authManager, AuthState } from '../lib/api';
import { subscribeCrossTabAuthState } from '../lib/auth/crossTab';
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

/**
 * While 'unreachable', a low-frequency background probe keeps trying — the
 * self-heal for signed-in sessions, which have no login page and therefore no
 * Retry button: a cloud admin whose session started during an API blip would
 * otherwise keep a null deployment/role (hidden admin nav, redirected admin
 * routes) until a full reload.
 */
export const CONFIG_REPROBE_INTERVAL_MS = 30_000;

/**
 * Per-attempt bound. Without it a blackholed host (firewall DROP, unanswered
 * Chrome local-network prompt) hangs the fetch for the browser's TCP timeout
 * and the fail-closed 'unreachable' state — the whole point — is never
 * reached; the user sees an indefinite bare "Loading…" instead of the
 * retriable card.
 */
const CONFIG_FETCH_TIMEOUT_MS = 8_000;

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
  /**
   * Re-run deployment detection once (no backoff ladder — the human clicking
   * Retry is the backoff). Resolves when the attempt has settled either way;
   * callers can await it to drive a busy state.
   */
  retryConfigDetection: () => Promise<void>;
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

type DetectedConfig = { dep: Deployment; resolvedLoginUrl: string | null };

/**
 * One attempt against `/auth/config`. Returns null when the deployment could
 * not be CONFIRMED — thrown fetch, timeout, and non-ok response alike, and
 * ALSO a 2xx whose `auth_mode` is not a value this build knows. All of these
 * must fail closed: a 5xx/429 no more proves "standalone" than a network
 * error does, and a 200 from a captive portal or misrouted proxy (`{}`), or a
 * future auth_mode this build predates, proves nothing either — guessing
 * 'standalone' from any of them is exactly the "LOCAL MODE ACTIVE" deception
 * this module exists to prevent. That deliberately includes 404: an API old
 * enough to lack /auth/config is not a supported pairing, and treating 404 as
 * standalone would re-open the deception through any proxy that strips the
 * path.
 */
async function fetchAuthConfigOnce(): Promise<DetectedConfig | null> {
  try {
    const res = await fetch(`${config.apiUrl}/api/v1/auth/config`, {
      signal: AbortSignal.timeout(CONFIG_FETCH_TIMEOUT_MS),
    });
    if (!res.ok) return null;
    const authConfig: {
      auth_mode?: string;
      oauth?: { hosted_login_url?: string; authorize_url?: string } | null;
    } = await res.json();
    if (authConfig.auth_mode !== 'local' && authConfig.auth_mode !== 'oauth') return null;
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
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);
AuthContext.displayName = 'AuthContext';

export function AuthProvider({ children }: { children: ReactNode }) {
  const [authState, setAuthStateInternal] = useState<AuthState | null>(null);
  const [loading, setLoading] = useState(true);
  const [deployment, setDeployment] = useState<Deployment | null>(null);
  const [configStatus, setConfigStatus] = useState<ConfigStatus>('pending');
  const [loginUrl, setLoginUrl] = useState<string | null>(null);

  /**
   * Generation counter for detection runs. Every run captures the counter at
   * start and refuses to write state once superseded (a newer run started, or
   * the provider unmounted — StrictMode's dev double-mount included). Without
   * it, a stale ladder that finishes last clobbers a newer successful
   * detection back to 'unreachable'.
   */
  const detectionGenRef = useRef(0);

  /**
   * Detect the deployment and FAIL CLOSED: on an unconfirmed first attempt,
   * `deployment` stays null and `configStatus` becomes 'unreachable'
   * immediately — the honest, retriable answer — while `withLadder` runs keep
   * probing briefly in the background (CONFIG_RETRY_DELAYS_MS) and upgrade in
   * place on success. There is no flip back through 'pending': the login
   * page's error card (and its guidance) stays mounted while retries run.
   * The login page renders that card for 'unreachable' — never the standalone
   * dev-login, which previously masqueraded as "LOCAL MODE" in front of cloud
   * users whenever this fetch was blocked (see ConfigStatus).
   */
  const runConfigDetection = useCallback(async (withLadder: boolean): Promise<void> => {
    const gen = ++detectionGenRef.current;
    const apply = (result: DetectedConfig): void => {
      setDeployment(result.dep);
      setLoginUrl(result.resolvedLoginUrl);
      setConfigStatus('ok');
    };

    let result = await fetchAuthConfigOnce();
    if (gen !== detectionGenRef.current) return;
    if (result) {
      apply(result);
      return;
    }
    setConfigStatus('unreachable');
    if (!withLadder) return;

    for (const delay of CONFIG_RETRY_DELAYS_MS) {
      await sleep(delay);
      if (gen !== detectionGenRef.current) return;
      result = await fetchAuthConfigOnce();
      if (gen !== detectionGenRef.current) return;
      if (result) {
        apply(result);
        return;
      }
    }
  }, []);

  const invalidateDetection = useCallback(() => {
    detectionGenRef.current++;
  }, []);

  /** Single-attempt re-detection: the human clicking Retry IS the backoff. */
  const retryConfigDetection = useCallback(
    (): Promise<void> => runConfigDetection(false),
    [runConfigDetection]
  );

  useEffect(() => {
    const load = async () => {
      setLoading(true);

      // Stored-auth load and deployment detection are independent — start
      // both, and gate `loading` (which blanks every routed page) on the
      // auth load alone. Detection outcomes land via configStatus/deployment,
      // which LoginPage and the role gates already wait on.
      const statePromise = authManager.getAuthState();
      void runConfigDetection(true);
      const state = await statePromise;
      setAuthStateInternal(state);

      setLoading(false);
    };
    load();
    // Invalidate any in-flight detection so orphaned ladders cannot setState
    // after unmount (or across StrictMode's dev remount). The counter is a
    // plain generation token, not a DOM ref — the stable callback keeps the
    // ref access out of the cleanup closure the lint rule inspects.
    return invalidateDetection;
  }, [runConfigDetection, invalidateDetection]);

  // Self-heal: while unreachable, probe quietly at a low frequency (see
  // CONFIG_REPROBE_INTERVAL_MS). A success flips configStatus to 'ok', which
  // also tears this interval down. This is what recovers signed-in sessions,
  // which never see LoginPage's Retry button.
  useEffect(() => {
    if (configStatus !== 'unreachable') return;
    const id = setInterval(() => {
      void runConfigDetection(false);
    }, CONFIG_REPROBE_INTERVAL_MS);
    return () => clearInterval(id);
  }, [configStatus, runConfigDetection]);

  // React to AuthManager-initiated clears (a definitive refresh failure wipes
  // storage from deep inside the API layer). Without this, React state still
  // said "authenticated" and the user was stuck on error banners; now the
  // context drops its state so ProtectedRoute routes back to login.
  useEffect(() => {
    const unsubscribe = authManager.onAuthCleared(() => {
      setAuthStateInternal(null);
    });
    return unsubscribe;
  }, []);

  /**
   * React to a sign-out that happened in ANOTHER TAB.
   *
   * The listener above fires only in the tab that did the clearing — the
   * `storage` event is deliberately not delivered to the writer — so a second
   * tab left open kept rendering as signed in after the user signed out
   * elsewhere. That did not matter while every page was a read-only view that
   * would 401 on its next request. It matters now: the built-in Copilot panel
   * holds a live session, and a real-browser check found the panel correctly
   * noticing the sign-out and tearing its own state down while the shell around
   * it carried on showing an account menu and a working page. Half a session is
   * worse than either whole one.
   *
   * `clearAuthState()` rather than a bare state drop, and deliberately so:
   * storage is already empty (the other tab emptied it, and the call is
   * idempotent), but it is also what fires `onAuthCleared`, which is what
   * purges the process-wide per-user caches. Dropping only React state would
   * leave the previous identity's cached KB scopes for whoever signs in next.
   *
   * Sign-out only. Another tab signing IN is not this tab's business to adopt —
   * the same rule the panel's own `subscribeAuthState` follows, so the shell
   * and the panel cannot disagree about what a cross-tab change means.
   */
  useEffect(() => {
    return subscribeCrossTabAuthState((state) => {
      if (state !== null) return;
      void authManager.clearAuthState();
    });
  }, []);

  /**
   * Role is DERIVED, never synced: a pure function of the confirmed
   * deployment and the React-visible auth state, so it cannot diverge from
   * either (imperative setRole sites could bind a role to a different
   * principal than `authState` displayed, or resurrect one after an auth
   * wipe). Unconfirmed deployment ⇒ null role ⇒ every role gate
   * (canManageUsers, canViewAllCases, admin routes) fails closed.
   */
  const role = useMemo<DashboardRole | null>(
    () =>
      authState && deployment ? deriveRole(deployment, authState.user.roles ?? []) : null,
    [authState, deployment]
  );

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
