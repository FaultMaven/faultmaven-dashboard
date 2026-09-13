import { render, screen, act, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * The session dies WHILE THE USER IS ON A PAGE, and they come back to it.
 *
 * faultmaven-dashboard#133's second bullet. The chain that gets them to
 * `/login` already exists and is tested: a definitive refresh rejection calls
 * `clearAuthStateAndEndIdpSession()` (AuthManager.ts — `doRefresh` when there
 * is no refresh token, `onCredentialRejected` on a 401/403 or a malformed
 * reply), which wipes storage and fires `onAuthCleared`; AuthContext drops its
 * state; `ProtectedRoute` routes out. `crossTabSignOut.test.tsx` pins the
 * routing half.
 *
 * WHAT NOTHING PINNED IS WHERE THEY LAND AFTERWARDS, and the two ways a session
 * can end want opposite answers:
 *
 *   cross-tab sign-out   someone signed OUT in another tab. The URL belongs to
 *                        the account that just left, so saving it would
 *                        deep-link whoever signs in next into the previous
 *                        person's case. `ProtectedRoute` deliberately skips the
 *                        save, keyed on `authManager.isCrossTabSignOut()`.
 *   expiry HERE          the same person is still sitting there, and their
 *                        token merely aged out or was revoked. Dropping them on
 *                        `/kb` after they sign back in loses the case they were
 *                        reading, which is the whole complaint in #133.
 *
 * One flag decides it, nothing asserted the branch, and a mistake in either
 * direction is invisible in every unit test of the parts.
 */

vi.mock('@faultmaven/copilot-ui', () => ({
  setHostStore: vi.fn(),
  setHostEndpoints: vi.fn(),
  setApiTransport: vi.fn(),
  clearPersistedSession: vi.fn().mockResolvedValue(undefined),
  DASHBOARD_PANEL_ATTR: 'data-faultmaven-dashboard-panel',
  DASHBOARD_PANEL_MESSAGE: 'FM_DASHBOARD_PANEL_AVAILABLE',
  dashboardAdvertisesPanel: () => false,
  CopilotPanel: () => <div data-testid="shared-copilot-ui">shared UI</div>,
}));

const getAuthState = vi.fn();
const isCrossTabSignOut = vi.fn();
let fireAuthCleared: () => void = () => {};

vi.mock('../../lib/api', () => ({
  devLogin: vi.fn(),
  logoutAuth: vi.fn(),
  listCases: vi.fn().mockResolvedValue({
    cases: [], total_count: 0, page: 0, page_size: 20, has_more: false,
  }),
  searchCases: vi.fn(),
  listDocuments: vi.fn().mockResolvedValue({
    documents: [], total_count: 0, limit: 0, offset: 0,
  }),
  authManager: {
    getAuthState: (...args: unknown[]) => getAuthState(...args),
    saveAuthState: vi.fn(),
    clearAuthState: vi.fn().mockResolvedValue(undefined),
    getAccessToken: vi.fn().mockResolvedValue('tok-live'),
    isCrossTabSignOut: (...args: unknown[]) => isCrossTabSignOut(...args),
    watchCrossTabAuthChanges: vi.fn().mockReturnValue(() => {}),
    // The ONE channel every kind of session end arrives on — a definitive
    // refresh rejection included. That is what makes this test the
    // refresh-rejection case and not a second cross-tab test.
    onAuthCleared: (listener: () => void) => {
      fireAuthCleared = listener;
      return () => { fireAuthCleared = () => {}; };
    },
  },
  config: { apiUrl: 'http://localhost:8090' },
  SIGNOUT_NOTICE_KEY: 'fm_signout_notice',
  AuthenticationError: class extends Error {},
}));

// ProtectedRoute imports `authManager` from HERE, not from `lib/api`, and it is
// `isCrossTabSignOut` that decides whether the destination is saved. Omitting it
// made the accessor throw inside the effect, which looked exactly like the
// product failing to save — a harness artifact, not a defect.
vi.mock('../../lib/auth/AuthManager', () => ({
  authManager: {
    getAccessToken: vi.fn().mockResolvedValue('tok-live'),
    peekAccessToken: vi.fn().mockResolvedValue('tok-live'),
    refreshTokens: vi.fn(),
    onAuthCleared: vi.fn().mockReturnValue(() => {}),
    isCrossTabSignOut: (...args: unknown[]) => isCrossTabSignOut(...args),
  },
}));

vi.mock('../../lib/auth/functions', () => ({
  getAccountProfile: vi.fn().mockResolvedValue({
    user_id: 'u1', username: 'ada', display_name: 'Ada L',
    email: 'ada@example.com', roles: ['user'], is_dev_user: false,
    created_at: '2026-01-01T00:00:00Z', organization: null,
  }),
}));

import App from '../../App';

const SIGNED_IN = {
  access_token: 'tok-live',
  token_type: 'bearer' as const,
  expires_at: Date.now() + 3_600_000,
  refresh_token: 'refresh',
  user: {
    user_id: 'u1', username: 'ada', email: 'ada@example.com',
    display_name: 'Ada L', is_dev_user: true, is_active: true, roles: ['user'],
  },
};

const SAVED_DESTINATION_KEY = 'oauth_redirect_after_login';
const DEEP_LINK = '/investigate?seed=abc';

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  sessionStorage.clear();
  fireAuthCleared = () => {};
  getAuthState.mockResolvedValue(SIGNED_IN);
  isCrossTabSignOut.mockReturnValue(false);
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ auth_mode: 'local', oauth: null }),
    }),
  );
});

async function openDeepLink() {
  window.history.pushState({}, '', DEEP_LINK);
  await act(async () => {
    render(<App />);
  });
  // Signed in, on the page, before anything expires.
  await waitFor(() => expect(screen.getByTestId('shared-copilot-ui')).toBeInTheDocument());
}

describe('a session that dies while the user is on a page', () => {
  it('routes to sign-in AND remembers the page, query string included', async () => {
    await openDeepLink();

    await act(async () => {
      fireAuthCleared();
    });

    await waitFor(() => expect(window.location.pathname).toBe('/login'));
    // The QUERY STRING too: a saved path that drops it returns the user to a
    // different screen from the one they were on.
    expect(sessionStorage.getItem(SAVED_DESTINATION_KEY)).toBe(DEEP_LINK);
  });

  it('does NOT remember it when another tab signed OUT', async () => {
    // The opposite branch, and the reason the flag exists: that URL belongs to
    // the account that just left. Saving it would deep-link whoever signs in
    // next straight into the previous person's data.
    isCrossTabSignOut.mockReturnValue(true);
    await openDeepLink();

    await act(async () => {
      fireAuthCleared();
    });

    await waitFor(() => expect(window.location.pathname).toBe('/login'));
    expect(sessionStorage.getItem(SAVED_DESTINATION_KEY)).toBeNull();
  });

  it('leaves the page alone while the session is alive', async () => {
    // Fail closed: if the two tests above passed because the app routes to
    // /login regardless, this would fail too.
    await openDeepLink();

    expect(window.location.pathname).toBe('/investigate');
    expect(sessionStorage.getItem(SAVED_DESTINATION_KEY)).toBeNull();
  });
});
