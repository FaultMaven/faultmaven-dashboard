import { render, screen, act, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

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

import {
  makeAuthManagerMock,
  TEST_AUTH_STATE,
  TEST_PROFILE,
  STANDALONE_AUTH_CONFIG,
  CLOUD_AUTH_CONFIG,
  stubAuthConfig,
} from '../support/authFixtures';

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

const openAdminCaseContent = vi.fn();
vi.mock('../../lib/breakGlass/api', () => ({
  openAdminCaseContent: (...a: unknown[]) => openAdminCaseContent(...a),
  openAdminCaseTranscript: vi.fn().mockResolvedValue({ messages: [], has_more: false }),
  requestBreakGlassGrant: vi.fn(),
  revokeBreakGlassGrant: vi.fn(),
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
  openAdminCaseContent.mockResolvedValue({
    access: 'break_glass',
    case: {
      case_id: 'case_abc123',
      title: 'A case',
      description: 'd',
      state: 'INVESTIGATING',
      enterprise_id: 'ent_1',
    },
    grant: { grant_id: 'g1', reason: 'triage', expires_at: new Date(Date.now() + 6e5).toISOString() },
  });
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
  stubAuthConfig(STANDALONE_AUTH_CONFIG);
});

// `clearAllMocks` clears history but leaves the stub installed, so the
// never-settling fetch in the detection-window test would otherwise survive into
// teardown as an AbortError.
afterEach(() => {
  vi.unstubAllGlobals();
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
    stubAuthConfig(CLOUD_AUTH_CONFIG);
    // Cloud serves the metadata arm (ADR-012 D9) — no titles.
    openAdminCaseContent.mockResolvedValue({
    access: 'break_glass',
    case: {
      case_id: 'case_abc123',
      title: 'A case',
      description: 'd',
      state: 'INVESTIGATING',
      enterprise_id: 'ent_1',
    },
    grant: { grant_id: 'g1', reason: 'triage', expires_at: new Date(Date.now() + 6e5).toISOString() },
  });
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
     * ‼ WHY THE GUARD DOES NOT WAIT. An earlier revision blanked the route while
     * `configStatus === 'pending'`. That was wrong twice: `'unreachable'` is set
     * after the FIRST failed attempt and only THEN does the retry ladder run, so
     * no `configStatus` check means "settled"; and waiting blanks the route for
     * up to the 8s fetch timeout while the nav item — which has no wait — still
     * offers the link.
     *
     * So an unconfirmed deployment ALLOWS, and the operator arriving on a
     * bookmark mid-detection gets the page rather than a white screen or a
     * redirect. Held with a fetch that does not resolve until after the
     * assertion; a zero-latency mock cannot observe this window at all.
     */
    let release!: (v: unknown) => void;
    const pending = new Promise((resolve) => {
      release = resolve;
    });
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(() => pending.then(() => ({ ok: true, json: async () => CLOUD_AUTH_CONFIG }))),
    );
    getAuthState.mockResolvedValue(OPERATOR);

    await renderAppAt('/admin/cases');

    // Detection is still in flight and the page is already up — no redirect, no
    // blank. A fail-closed guard breaks the first assertion; a re-added wait
    // breaks the second.
    expect(window.location.pathname).toBe('/admin/cases');
    await waitFor(() =>
      expect(screen.getByRole('heading', { name: /^All Cases$/i })).toBeInTheDocument(),
    );

    await act(async () => {
      release(undefined);
      await pending;
    });

    // …and confirming CLOUD keeps it, rather than yanking the operator away.
    expect(window.location.pathname).toBe('/admin/cases');
    expect(screen.getByRole('heading', { name: /^All Cases$/i })).toBeInTheDocument();
  });
});

describe('/admin/cases/:caseId — the page that writes the audit row', () => {
  /**
   * ‼ THE STATED REASON FOR THE CHANGE, and it had no test on the real route
   * table. `AllCasesRoute` wraps this route too, and the whole rationale for
   * denying standalone names it: opening a case here writes an operator-access
   * audit row for reading your OWN case. Unwrapping just this route — or
   * reverting it to a bare `ProtectedRoute` — would leave the rest of the suite
   * green while that kept happening. Same blind spot this file's docstring
   * records for `ChatSurfaceRoute`.
   */
  it('turns a standalone operator away, so no audit row is written', async () => {
    getAuthState.mockResolvedValue(OPERATOR);

    await renderAppAt('/admin/cases/case_abc123');

    await waitFor(() => expect(window.location.pathname).toBe('/cases'));
    // The load-bearing assertion: not merely "no page", but the privileged read
    // was never attempted.
    expect(openAdminCaseContent).not.toHaveBeenCalled();
  });

  it('still opens for the cloud operator', async () => {
    // Non-vacuity: the route is denied by DEPLOYMENT, not broken outright.
    stubAuthConfig(CLOUD_AUTH_CONFIG);
    getAuthState.mockResolvedValue(OPERATOR);

    await renderAppAt('/admin/cases/case_abc123');

    await waitFor(() => expect(openAdminCaseContent).toHaveBeenCalledWith('case_abc123'));
    expect(window.location.pathname).toBe('/admin/cases/case_abc123');
  });
});

describe('the nav item and the route agree, in one real render', () => {
  /**
   * Both surfaces read the same predicate with no extra clause, and this is the
   * only test that observes them TOGETHER through the real `AuthContext` —
   * `useNavigationItems.test.ts` mocks `useAuth` wholesale, so it cannot see the
   * wiring `PageHeader` → `useNavigationItems` → context. An offered link that
   * redirects is the exact drift deleting `offersAllCasesNav` was meant to end.
   */
  it('cloud: the item is offered and the route it points at renders', async () => {
    stubAuthConfig(CLOUD_AUTH_CONFIG);
    getAuthState.mockResolvedValue(OPERATOR);

    await renderAppAt('/admin/cases');

    await waitFor(() =>
      expect(screen.getByRole('heading', { name: /^All Cases$/i })).toBeInTheDocument(),
    );
    expect(screen.getByRole('link', { name: 'All Cases' })).toBeInTheDocument();
  });

  it('standalone: no item is offered, and the route it would point at refuses', async () => {
    getAuthState.mockResolvedValue(OPERATOR);

    await renderAppAt('/cases');

    // On a page the operator CAN reach, so the nav is genuinely rendered…
    await waitFor(() => expect(screen.getByRole('link', { name: 'Cases' })).toBeInTheDocument());
    expect(screen.queryByRole('link', { name: 'All Cases' })).not.toBeInTheDocument();
  });
});
