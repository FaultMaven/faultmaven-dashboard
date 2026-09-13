import { render, screen, act, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Where a signed-out tab sends the user back to, across the THREE ways a
 * session can end. One flag decides it and it was wrong for the most common
 * one.
 *
 *   expiry HERE           the token aged out or was revoked and the same person
 *                         is still sitting there. Record the page: returning
 *                         them to it is the point of faultmaven-dashboard#133.
 *   cross-tab sign-out    someone signed OUT in another tab. Record nothing —
 *                         that URL belongs to the account that just left.
 *   sign-out HERE         the button every user actually presses. Record
 *                         nothing, for exactly the same reason, and this is the
 *                         one that did not.
 *
 * `ProtectedRoute` consults `authManager.isSigningOut()`, which until now was
 * `isCrossTabSignOut` and set only by `signOutFromAnotherTab`. `logoutAuth`
 * never set it, so signing out on `/cases/case-123?tab=report` left that URL in
 * `oauth_redirect_after_login`; `LoginPage` reads it on the next successful
 * sign-in and navigates there, and the cloud path forwards it to the IdP as
 * `return_to`, where it outlives a cleared sessionStorage. The next person to
 * sign in on that tab landed in the previous person's case.
 *
 * SCOPE, honestly. `ProtectedRoute.test.tsx` already covers the save/suppress
 * branches against a mocked `useAuth`, including that the query string
 * survives. What is only observable here is the WIRING — a real `AuthProvider`
 * subscribed to a real `onAuthCleared`, driven by the same fan-out production
 * uses — and the third case, which nothing covered at all.
 */

vi.mock('@faultmaven/copilot-ui', () => ({
  setHostStore: vi.fn(),
  setHostEndpoints: vi.fn(),
  setApiTransport: vi.fn(),
  clearPersistedSession: vi.fn().mockResolvedValue(undefined),
  DASHBOARD_PANEL_ATTR: 'data-faultmaven-dashboard-panel',
  DASHBOARD_PANEL_MESSAGE: 'FM_DASHBOARD_PANEL_AVAILABLE',
  dashboardAdvertisesPanel: (doc: Document = document) => {
    const v = doc.documentElement.getAttribute('data-faultmaven-dashboard-panel');
    return v !== null && v !== '' && v !== 'false' && v !== '0';
  },
  CopilotPanel: () => <div data-testid="shared-copilot-ui">shared UI</div>,
}));

/**
 * ONE authManager, referenced by both module mocks.
 *
 * In production this is a single instance, and `onAuthCleared` fans out to
 * AuthContext, the scopes cache and the Copilot host session. Two independent
 * mock objects split that singleton in half: whichever subscriber resolved
 * through the other module silently never fired, so a regression in the fan-out
 * was structurally invisible while the file's own docblock called this "the ONE
 * channel every kind of session end arrives on".
 *
 * Listeners are collected in a Set and all of them fire, rather than a
 * last-writer-wins variable that works only by accident of registration order.
 */
const h = vi.hoisted(() => {
  const authClearedListeners = new Set<() => void>();
  const isSigningOut = vi.fn();
  const getAuthState = vi.fn();
  const beginSignOut = vi.fn();
  const authManager = {
    getAuthState: (...a: unknown[]) => getAuthState(...a),
    saveAuthState: vi.fn(),
    clearAuthState: vi.fn().mockResolvedValue(undefined),
    getAccessToken: vi.fn().mockResolvedValue('tok-live'),
    peekAccessToken: vi.fn().mockResolvedValue('tok-live'),
    peekIdpLogoutUrl: vi.fn().mockResolvedValue(null),
    peekSessionId: vi.fn().mockResolvedValue(null),
    refreshTokens: vi.fn(),
    isSigningOut: (...a: unknown[]) => isSigningOut(...a),
    beginSignOut: (...a: unknown[]) => beginSignOut(...(a as [])),
    watchCrossTabAuthChanges: vi.fn().mockReturnValue(() => {}),
    onAuthCleared: (listener: () => void) => {
      authClearedListeners.add(listener);
      return () => authClearedListeners.delete(listener);
    },
  };
  return { authClearedListeners, isSigningOut, getAuthState, beginSignOut, authManager };
});

/** Every subscriber, the way the real singleton does it. */
function endSession() {
  for (const listener of h.authClearedListeners) listener();
}

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
  authManager: h.authManager,
  config: { apiUrl: 'http://localhost:8090' },
  SIGNOUT_NOTICE_KEY: 'fm_signout_notice',
  AuthenticationError: class extends Error {},
}));

// ProtectedRoute imports `authManager` from HERE, not from `lib/api` as
// AuthContext does. Pointing both at one object is what keeps the singleton
// shape; an earlier version stubbed them separately and left
// `isSigningOut` undefined, so the accessor threw inside the effect and the
// destination was not saved — which looked exactly like the product bug this
// file was written to find. It was the mock.
vi.mock('../../lib/auth/AuthManager', () => ({ authManager: h.authManager }));

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

const KEY = 'oauth_redirect_after_login';
const DEEP_LINK = '/investigate?case=ada-private';

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  sessionStorage.clear();
  h.authClearedListeners.clear();
  h.getAuthState.mockResolvedValue(SIGNED_IN);
  h.isSigningOut.mockReturnValue(false);
  h.beginSignOut.mockImplementation(() => {
    h.isSigningOut.mockReturnValue(true);
    try { sessionStorage.removeItem(KEY); } catch { /* non-fatal */ }
  });
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ auth_mode: 'local', oauth: null }),
    }),
  );
});

async function openSignedIn() {
  window.history.pushState({}, '', DEEP_LINK);
  await act(async () => {
    render(<App />);
  });
  await waitFor(() => expect(screen.getByTestId('shared-copilot-ui')).toBeInTheDocument());
}

describe('the return destination, across the three ways a session ends', () => {
  it('records the page when the session EXPIRED under the user', async () => {
    await openSignedIn();

    await act(async () => { endSession(); });

    await waitFor(() => expect(window.location.pathname).toBe('/login'));
    // The protected tree is actually GONE, not merely routed past. A build that
    // reaches /login while still rendering the signed-in surface is the
    // half-a-session failure `crossTabSignOut.test.tsx` exists for, and a URL
    // assertion alone cannot see it.
    expect(screen.queryByTestId('shared-copilot-ui')).not.toBeInTheDocument();
    expect(sessionStorage.getItem(KEY)).toBe(DEEP_LINK);
  });

  it('records NOTHING when another tab signed out', async () => {
    h.isSigningOut.mockReturnValue(true);
    await openSignedIn();

    await act(async () => { endSession(); });

    await waitFor(() => expect(window.location.pathname).toBe('/login'));
    expect(screen.queryByTestId('shared-copilot-ui')).not.toBeInTheDocument();
    expect(sessionStorage.getItem(KEY)).toBeNull();
  });

  it('records NOTHING when the user signed out HERE', async () => {
    // The case that was broken, and the one with a cross-account consequence:
    // `LoginPage` navigates the NEXT person who signs in on this tab to
    // whatever this key holds.
    await openSignedIn();

    await act(async () => {
      h.authManager.beginSignOut();
      endSession();
    });

    await waitFor(() => expect(window.location.pathname).toBe('/login'));
    expect(sessionStorage.getItem(KEY)).toBeNull();
  });

  it('drops a destination captured BEFORE the sign-out, not just the next one', async () => {
    // Suppressing the next capture is half the fix. A URL recorded earlier in
    // the session — an expiry, then a sign-in, then a deliberate sign-out —
    // would otherwise still be sitting there for the next account.
    sessionStorage.setItem(KEY, '/cases/ada-private?tab=report');

    h.authManager.beginSignOut();

    expect(sessionStorage.getItem(KEY)).toBeNull();
  });

  it('leaves the page alone while the session is alive', async () => {
    // Fail closed: without this the three cases above could pass on a build
    // that routes to /login regardless of what happened.
    await openSignedIn();

    expect(window.location.pathname).toBe('/investigate');
    expect(sessionStorage.getItem(KEY)).toBeNull();
    expect(screen.getByTestId('shared-copilot-ui')).toBeInTheDocument();
  });
});
