import { render, screen, act, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * Route guards that read `deployment` must not decide before detection lands.
 *
 * `loading` covers the stored-auth read only — AuthContext starts the
 * `/auth/config` probe alongside it and deliberately does NOT gate `loading` on
 * it, because that would blank every routed page for a network round trip. So
 * there is a real window, on every hard refresh, where `loading` is false and
 * `deployment` is still null.
 *
 * `canManageUsers` and `canManageConsole` both fail CLOSED there, and both
 * guards redirect with `replace` — so a cloud operator opening their own
 * bookmark is sent to `/cases` with no way back, for a question the app simply
 * could not answer yet. AuthContext names this exact failure at
 * CONFIG_REPROBE_INTERVAL_MS: "a cloud admin whose session started during an API
 * blip would otherwise keep a null deployment/role (hidden admin nav, redirected
 * admin routes) until a full reload."
 */

import {
  makeAuthManagerMock,
  TEST_AUTH_STATE,
  TEST_PROFILE,
  CLOUD_AUTH_CONFIG,
  STANDALONE_AUTH_CONFIG,
  stubAuthConfig,
} from '../support/authFixtures';

const getAuthState = vi.fn();

vi.mock('../../lib/api', async () => ({
  devLogin: vi.fn(),
  logoutAuth: vi.fn(),
  listCases: vi.fn().mockResolvedValue({
    cases: [], total_count: 0, page: 0, page_size: 20, has_more: false,
  }),
  searchCases: vi.fn(),
  listDocuments: vi.fn().mockResolvedValue({ documents: [], total_count: 0, limit: 0, offset: 0 }),
  getAdminCases: vi.fn(),
  authManager: (await import('../support/authFixtures')).makeAuthManagerMock({
    getAuthState: (...args: unknown[]) => getAuthState(...args),
  }),
  config: { apiUrl: 'http://localhost:8090' },
  SIGNOUT_NOTICE_KEY: 'fm_signout_notice',
  AuthenticationError: class extends Error {},
}));

vi.mock('../../lib/auth/AuthManager', () => ({
  authManager: makeAuthManagerMock({ getAuthState: (...a: unknown[]) => getAuthState(...a) }),
}));

vi.mock('../../lib/auth/functions', () => ({
  getAccountProfile: vi.fn().mockResolvedValue(TEST_PROFILE),
}));

vi.mock('../../lib/users/api', () => ({
  listUsers: vi.fn().mockResolvedValue({ users: [], total_count: 0, limit: 20, offset: 0 }),
}));

vi.mock('../../lib/organization/api', () => ({
  getOrganization: vi.fn().mockResolvedValue(null),
}));

// The WHOLE tuple. `GatedRoute` reads `error` and `refetch` too, and a double
// that omits them is not neutral — it decides differently from the real hook.
vi.mock('../../hooks/useCapabilities', () => ({
  useCapabilities: () => ({
    managementConsole: true,
    teamSharing: false,
    loading: false,
    error: null,
    refetch: vi.fn().mockResolvedValue(undefined),
  }),
}));

import App from '../../App';

const OPERATOR = {
  ...TEST_AUTH_STATE,
  user: { ...TEST_AUTH_STATE.user, roles: ['user', 'admin', 'platform_admin'] },
};

/** A `/auth/config` that has not answered yet, and a way to let it. */
function deferredConfig() {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  vi.stubGlobal(
    'fetch',
    vi.fn().mockImplementation(() =>
      gate.then(() => ({ ok: true, json: async () => CLOUD_AUTH_CONFIG })),
    ),
  );
  return { release, gate };
}

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  getAuthState.mockResolvedValue(OPERATOR);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

async function renderAppAt(path: string) {
  window.history.pushState({}, '', path);
  await act(async () => {
    render(<App />);
  });
}

describe.each([
  ['/admin/users', /User Management|Users/i],
  ['/admin/organization', /Organization/i],
])('%s while deployment detection is still in flight', (path, heading) => {
  it('does not redirect the cloud operator away', async () => {
    const { release, gate } = deferredConfig();

    await renderAppAt(path);

    // The load-bearing assertion. `replace` means a redirect here is
    // irrecoverable — the operator cannot go back to the link they followed.
    expect(window.location.pathname).toBe(path);

    await act(async () => {
      release();
      await gate;
    });

      // `getAllBy`: the organization page carries the word in more than one
    // heading, and which ones is not what this test is about.
    await waitFor(() =>
      expect(screen.getAllByRole('heading', { name: heading }).length).toBeGreaterThan(0),
    );
    expect(window.location.pathname).toBe(path);
  });
});

describe('the guards still refuse once detection HAS landed', () => {
  /**
   * The non-vacuity of everything above. Waiting for detection must not become
   * "allow anyone who waits" — these routes are cloud-only, and a standalone
   * operator carries the `admin` role, which is the drift `canManageUsers` was
   * written to close.
   */
  it.each(['/admin/users', '/admin/organization'])(
    'sends a standalone operator away from %s',
    async (path) => {
      stubAuthConfig(STANDALONE_AUTH_CONFIG);

      await renderAppAt(path);

      await waitFor(() => expect(window.location.pathname).toBe('/cases'));
    },
  );
});

describe('when detection never lands', () => {
  /**
   * ‼ `'unreachable'` is set after the FIRST failed probe and only then does the
   * retry ladder run, with a 30s reprobe after that — so it does not mean
   * "stopped trying", and a spinner here would be indefinite while claiming
   * progress. Say so, and offer the same single-attempt retry the login page
   * does. Still no redirect: that is the one irreversible option.
   */
  it('offers a retry instead of redirecting or spinning', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')));

    await renderAppAt('/admin/users');

    await waitFor(() =>
      expect(screen.getByRole('button', { name: /try again/i })).toBeInTheDocument(),
    );
    expect(window.location.pathname).toBe('/admin/users');
    expect(screen.queryByText('Loading...')).not.toBeInTheDocument();
  });
});

describe('a signed-out visitor', () => {
  /**
   * `!authState` sits ABOVE every fetch in `GatedRoute`, because authentication
   * is knowable without the network and no request's answer can change where an
   * unauthenticated visitor is going.
   *
   * Measured before the fix: with `/meta/capabilities` hanging, a signed-out
   * visitor on `/admin/organization` was held on a blank page indefinitely and
   * never reached `/login` — while the same visitor on `/admin/users`, whose
   * guard read no capability, got there immediately. The principle was stated in
   * one guard's comment and applied to one guard.
   */
  it.each(['/admin/users', '/admin/organization', '/teams', '/admin/cases'])(
    'reaches /login from %s without waiting on any fetch',
    async (path) => {
      getAuthState.mockResolvedValue(null);
      // Detection deliberately never settles: it must not matter.
      deferredConfig();

      await renderAppAt(path);

      await waitFor(() => expect(window.location.pathname).toBe('/login'));
    },
  );
});
