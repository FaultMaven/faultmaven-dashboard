import { render, screen, act, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * THE ROUTE HALF of the All-Cases offer/guard split, on App's REAL route table.
 *
 * Hiding the nav item in standalone (`offersAllCasesNav`) is only defensible
 * because `/admin/cases` stays reachable: a multi-account standalone install
 * has one real operator, and their admin list genuinely holds rows their own
 * `/cases` cannot show. The whole trade is "they lose a nav slot, not the
 * view" — and nothing asserted the second half. `grep -rn 'AllCasesRoute'
 * src/test/` returned nothing before this file.
 *
 * ‼ It is mounted through `<App />` and not a hand-built `<MemoryRouter>`,
 * for the reason `panelNotBeforeSignIn.test.tsx` already records: deleting
 * `<ChatSurfaceRoute>` from App left 1200 tests green, because the only test
 * of it rendered the guard component directly and never touched App's routes.
 * A bookmark — the exact thing this route exists to serve — arrives through
 * App's router or not at all.
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
  // A STANDALONE deployment — `auth_mode: 'local'` is what makes
  // `deployment === 'standalone'` (AuthContext), which is the state under test.
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ auth_mode: 'local', oauth: null }),
    }),
  );
});

async function renderAppAt(path: string) {
  window.history.pushState({}, '', path);
  await act(async () => {
    render(<App />);
  });
}

describe('/admin/cases in standalone', () => {
  it('stays reachable for the operator even though the nav item is gone', async () => {
    getAuthState.mockResolvedValue(OPERATOR);

    await renderAppAt('/admin/cases');

    // The page, not a redirect.
    await waitFor(() =>
      expect(screen.getByRole('heading', { name: /^All Cases$/i })).toBeInTheDocument(),
    );
    expect(window.location.pathname).toBe('/admin/cases');
  });

  it('is the WHOLE design in one render: no nav item, and the page anyway', async () => {
    // Asserting these together is the point. Separately, each passes in a build
    // that has quietly lost the other — a route that redirects while the item
    // is hidden leaves the standalone operator with no way in at all, which is
    // the outcome the offer/guard split exists to avoid.
    getAuthState.mockResolvedValue(OPERATOR);

    await renderAppAt('/admin/cases');

    await waitFor(() =>
      expect(screen.getByRole('heading', { name: /^All Cases$/i })).toBeInTheDocument(),
    );
    expect(screen.queryByRole('link', { name: 'All Cases' })).not.toBeInTheDocument();
    // Not vacuous — the nav IS rendered on this page, just without that item.
    expect(screen.getByRole('link', { name: 'Cases' })).toBeInTheDocument();
  });

  it('turns an ordinary standalone account away', async () => {
    // The route is not open to everyone just because the nav gate moved: it
    // still guards on `canViewAllCases`, which the backend enforces too.
    getAuthState.mockResolvedValue(ORDINARY);

    await renderAppAt('/admin/cases');

    await waitFor(() => expect(window.location.pathname).toBe('/cases'));
    expect(screen.queryByRole('heading', { name: /^All Cases$/i })).not.toBeInTheDocument();
  });
});
