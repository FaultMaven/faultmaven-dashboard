import { render, screen, act, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * THE OPERATOR ROUTE, on App's REAL route table.
 *
 * `canViewAllCases` reads the deployment, so standalone is turned AWAY here —
 * not merely left without a nav link. Standalone is single-user by design, so
 * this page could only show that one account its own cases, and its content arm
 * would write an operator-access audit row for reading them. #177 kept the
 * route open for the multi-account standalone operator; that configuration is
 * not supported, so the offer/guard split it needed is gone.
 *
 * ‼ Mounted through `<App />`, not a hand-built `<MemoryRouter>`, for the
 * reason `panelNotBeforeSignIn.test.tsx` records: deleting `<ChatSurfaceRoute>`
 * from App left 1200 tests green, because the only test of it rendered the
 * guard component directly and never touched App's routes. A bookmark — the
 * thing a route guard exists for — arrives through App's router or not at all.
 */

import { makeAuthManagerMock, TEST_AUTH_STATE, TEST_PROFILE } from '../support/authFixtures';

const getAuthState = vi.fn();
const getAdminCases = vi.fn();

vi.mock('../../lib/api', async () => ({
  devLogin: vi.fn(),
  logoutAuth: vi.fn(),
  listCases: vi.fn().mockResolvedValue({
    cases: [],
    total_count: 0,
    page: 0,
    page_size: 20,
    has_more: false,
  }),
  searchCases: vi.fn(),
  listDocuments: vi.fn().mockResolvedValue({ documents: [], total_count: 0, limit: 0, offset: 0 }),
  getAdminCases: (...args: unknown[]) => getAdminCases(...args),
  authManager: (await import('../support/authFixtures')).makeAuthManagerMock({
    getAuthState: (...args: unknown[]) => getAuthState(...args),
  }),
  config: { apiUrl: 'http://localhost:8090' },
  SIGNOUT_NOTICE_KEY: 'fm_signout_notice',
  AuthenticationError: class extends Error {},
}));

vi.mock('../../lib/auth/AuthManager', () => ({
  authManager: makeAuthManagerMock({ getAuthState: (...args: unknown[]) => getAuthState(...args) }),
}));

vi.mock('../../lib/auth/functions', () => ({
  getAccountProfile: vi.fn().mockResolvedValue(TEST_PROFILE),
}));

vi.mock('../../hooks/useCapabilities', () => ({
  useCapabilities: () => ({ managementConsole: false, teamSharing: false, loading: false }),
}));

import App from '../../App';

/** The standalone bootstrap account: the one holding the operator roles. */
const OPERATOR = {
  ...TEST_AUTH_STATE,
  user: { ...TEST_AUTH_STATE.user, roles: ['user', 'admin', 'platform_admin'] },
};

/** Any other standalone account, as `create_user.py` makes it. */
const ORDINARY = {
  ...TEST_AUTH_STATE,
  user: { ...TEST_AUTH_STATE.user, roles: ['user'] },
};

const STANDALONE_CONFIG = { auth_mode: 'local', oauth: null };
const CLOUD_CONFIG = {
  auth_mode: 'oauth',
  oauth: { hosted_login_url: '/api/v1/auth/sso/login', supports_screen_hint: true },
};

function stubConfig(body: unknown) {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => body }));
}

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  getAdminCases.mockResolvedValue({
    view: 'full',
    cases: [],
    total_count: 0,
    limit: 20,
    offset: 0,
    has_more: false,
  });
  // A STANDALONE deployment by default — `auth_mode: 'local'` is what makes
  // `deployment === 'standalone'` (AuthContext). The cloud block overrides it.
  stubConfig(STANDALONE_CONFIG);
});

async function renderAppAt(path: string) {
  window.history.pushState({}, '', path);
  await act(async () => {
    render(<App />);
  });
}

describe('/admin/cases in standalone', () => {
  it('turns the operator away — single-user, so there is nothing to show', async () => {
    getAuthState.mockResolvedValue(OPERATOR);

    await renderAppAt('/admin/cases');

    await waitFor(() => expect(window.location.pathname).toBe('/cases'));
    expect(screen.queryByRole('heading', { name: /^All Cases$/i })).not.toBeInTheDocument();
  });

  it('turns an ordinary standalone account away too', async () => {
    getAuthState.mockResolvedValue(ORDINARY);

    await renderAppAt('/admin/cases');

    await waitFor(() => expect(window.location.pathname).toBe('/cases'));
    expect(screen.queryByRole('heading', { name: /^All Cases$/i })).not.toBeInTheDocument();
  });
});

describe('/admin/cases in cloud', () => {
  beforeEach(() => {
    stubConfig(CLOUD_CONFIG);
    // Cloud serves the metadata arm (ADR-012 D9) — no titles.
    getAdminCases.mockResolvedValue({
      view: 'metadata',
      cases: [],
      total_count: 0,
      limit: 20,
      offset: 0,
      has_more: false,
    });
  });

  it('is where the view still lives', async () => {
    // The non-vacuity of the standalone cases above: the route is denied by
    // DEPLOYMENT, not broken outright.
    getAuthState.mockResolvedValue(OPERATOR);

    await renderAppAt('/admin/cases');

    await waitFor(() =>
      expect(screen.getByRole('heading', { name: /^All Cases$/i })).toBeInTheDocument(),
    );
    expect(window.location.pathname).toBe('/admin/cases');
  });

  it('does not bounce an operator who arrives before detection lands', async () => {
    /**
     * ‼ THE REASON THE GUARD WAITS. `configStatus` starts 'pending' and is not
     * covered by `loading`, so a guard that decided immediately would read
     * `deployment: null`, and any future tightening to `=== 'cloud'` would
     * redirect a cloud operator off their own bookmark before the app had any
     * idea which deployment it was. Held here with a fetch that does not
     * resolve until the assertion has been made — a zero-latency mock cannot
     * observe this window at all.
     */
    let release!: (v: unknown) => void;
    const pending = new Promise((resolve) => {
      release = resolve;
    });
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(() => pending.then(() => ({ ok: true, json: async () => CLOUD_CONFIG }))),
    );
    getAuthState.mockResolvedValue(OPERATOR);

    await renderAppAt('/admin/cases');

    // Detection is still in flight, so the guard has decided NOTHING: it has
    // neither navigated away nor rendered the page. Both halves are needed —
    // the pathname catches a fail-closed guard, and the absent heading catches
    // a guard that dropped the wait and acted on `deployment: null` (which this
    // predicate happens to allow, so it would render and the pathname alone
    // would not notice).
    expect(window.location.pathname).toBe('/admin/cases');
    expect(screen.queryByRole('heading', { name: /^All Cases$/i })).not.toBeInTheDocument();

    await act(async () => {
      release(undefined);
      await pending;
    });

    await waitFor(() =>
      expect(screen.getByRole('heading', { name: /^All Cases$/i })).toBeInTheDocument(),
    );
  });
});
