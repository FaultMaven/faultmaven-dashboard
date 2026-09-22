import type { ReactElement } from 'react';
import { vi } from 'vitest';
import type { AuthState } from '../../lib/auth/types';
import type { AccountProfile } from '../../lib/auth/functions';

/**
 * One signed-in identity, and one set of auth doubles, for every suite.
 *
 * There were eight hand-written copies of these across `src/test/`, and they
 * had already drifted: some set `is_dev_user: true` and some `false`, some gave
 * `authManager` a `peekAccessToken` and some did not — so a test could pass
 * against a manager shaped unlike the real one. A stale double is worse than no
 * double, because it keeps a suite green while the thing it stands for changes
 * underneath it. `makeAuthManagerMock` in particular is the guard against that:
 * a method added to `AuthManager` is added here once.
 */

/** The signed-in user, as the stored session carries them. */
export const TEST_USER: AuthState['user'] = {
  user_id: 'u1',
  username: 'ada',
  email: 'ada@example.com',
  display_name: 'Ada L',
  is_dev_user: true,
  roles: ['user'],
};

/** A live session for that user. */
export const TEST_AUTH_STATE: AuthState = {
  access_token: 'tok-live',
  token_type: 'bearer',
  expires_at: Date.now() + 3_600_000,
  refresh_token: 'refresh',
  user: TEST_USER,
};

/** A DIFFERENT account, for cross-tab account-switch cases. */
export const OTHER_AUTH_STATE: AuthState = {
  ...TEST_AUTH_STATE,
  access_token: 'tok-other',
  user: { ...TEST_USER, user_id: 'u2', username: 'grace', email: 'grace@example.com' },
};

/** The same person as `/auth/me` returns them. */
export const TEST_PROFILE: AccountProfile = {
  user_id: 'u1',
  username: 'ada',
  display_name: 'Ada L',
  email: 'ada@example.com',
  roles: ['user'],
  is_dev_user: true,
  created_at: '2026-01-01T00:00:00Z',
  organization: null,
} as AccountProfile;

/**
 * A stand-in for the `AuthManager` singleton.
 *
 * Every method the app calls on it, so a suite cannot pass against a manager
 * missing the one its subject uses. Override what a test is actually about.
 */
export function makeAuthManagerMock(overrides: Record<string, unknown> = {}) {
  return {
    getAuthState: vi.fn().mockResolvedValue(null),
    saveAuthState: vi.fn().mockResolvedValue(undefined),
    clearAuthState: vi.fn().mockResolvedValue(undefined),
    getAccessToken: vi.fn().mockResolvedValue('tok-live'),
    peekAccessToken: vi.fn().mockResolvedValue('tok-live'),
    peekIdpLogoutUrl: vi.fn().mockResolvedValue(null),
    peekSessionId: vi.fn().mockResolvedValue(null),
    refreshTokens: vi.fn().mockResolvedValue('tok-live'),
    onAuthCleared: vi.fn().mockReturnValue(() => {}),
    watchCrossTabAuthChanges: vi.fn().mockReturnValue(() => {}),
    isSigningOut: vi.fn().mockReturnValue(false),
    beginSignOut: vi.fn(),
    writeBridgeAuthState: vi.fn(),
    hasBridgeAuthState: vi.fn().mockReturnValue(false),
    ...overrides,
  };
}

/**
 * The two `/auth/config` bodies every suite needs, and one way to install them.
 *
 * `auth_mode` is what AuthContext turns into `deployment` ('oauth' → cloud,
 * anything else → standalone), so almost every route or nav test has to stub
 * this fetch. Six suites had grown their own spelling of the same object; when
 * the payload gained `supports_screen_hint` and `self_service_signup_enabled`,
 * that meant six places to find. New suites should use these.
 */
export const STANDALONE_AUTH_CONFIG = { auth_mode: 'local', oauth: null };

export const CLOUD_AUTH_CONFIG = {
  auth_mode: 'oauth',
  oauth: {
    hosted_login_url: '/api/v1/auth/sso/login',
    supports_screen_hint: true,
    self_service_signup_enabled: true,
  },
};

/**
 * Point the global `fetch` at one of the bodies above.
 *
 * ‼ Pair it with `afterEach(() => vi.unstubAllGlobals())`. `vi.clearAllMocks()`
 * clears call history but leaves the stub installed, so a fetch that never
 * settles outlives its test into `cleanup()` and teardown — which surfaces as an
 * AbortError from `AsyncTaskManager.abortAll` rather than as a failing test.
 */
export function stubAuthConfig(body: unknown = STANDALONE_AUTH_CONFIG) {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => body }));
}

/** A stand-in for the shared Copilot UI package. */
export function makeCopilotUiMock(
  Panel: (props: { initialCase?: unknown; chrome?: unknown }) => ReactElement,
) {
  return {
    setHostStore: vi.fn(),
    setHostEndpoints: vi.fn(),
    setApiTransport: vi.fn(),
    clearHostStore: vi.fn(),
    clearHostEndpoints: vi.fn(),
    clearApiTransport: vi.fn(),
    clearPersistedSession: vi.fn().mockResolvedValue(undefined),
    DASHBOARD_PANEL_ATTR: 'data-faultmaven-dashboard-panel',
    DASHBOARD_PANEL_MESSAGE: 'FM_DASHBOARD_PANEL_AVAILABLE',
    dashboardAdvertisesPanel: (doc: Document = document) => {
      const v = doc.documentElement.getAttribute('data-faultmaven-dashboard-panel');
      return v !== null && v !== '' && v !== 'false' && v !== '0';
    },

    CopilotPanel: Panel,
  };
}
