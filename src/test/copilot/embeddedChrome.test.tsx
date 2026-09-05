import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * One account row, one navigation — the Dashboard's.
 *
 * The panel's own sidebar carries a case list, an account row and an
 * "Open Dashboard" button. Inside a Dashboard page every one of those is a
 * second copy of something the page already renders, and the last one links to
 * the page it is already on. A real-browser check found all three duplicated,
 * which is the same defect the whole programme exists to remove ("two panels or
 * two sign-in boxes visible at once, in any state") wearing a different hat.
 *
 * THE REAL PACKAGE, deliberately. A mocked panel renders no chrome at all, so
 * every assertion below would pass against a stub while the shipped page
 * duplicated everything — the same blindness that let the missing
 * QueryClientProvider through. The last test here is that guard: it proves the
 * absences are not simply an empty panel.
 */

// NO vi.mock of '@faultmaven/copilot-ui'.
import CopilotPanel, {
  setApiTransport,
  setHostEndpoints,
  setHostStore,
  clearApiTransport,
  clearHostEndpoints,
  clearHostStore,
  type PanelChrome,
  type WiredHost,
} from '@faultmaven/copilot-ui';
import { PageHeader } from '../../components/PageHeader';
import CopilotPanelMount from '../../copilot/CopilotPanelMount';
import { createWebHostCapabilities } from '../../copilot/webHost';

vi.mock('../../lib/auth/functions', () => ({
  getAccountProfile: vi.fn().mockResolvedValue({
    user_id: 'u1',
    username: 'ada',
    display_name: 'Ada L',
    email: 'ada@example.com',
    roles: ['user'],
    is_dev_user: false,
    created_at: '2026-01-01T00:00:00Z',
    organization: null,
  }),
}));

vi.mock('../../lib/auth/AuthManager', () => ({
  authManager: {
    getAccessToken: vi.fn().mockResolvedValue('tok-live'),
    peekAccessToken: vi.fn().mockResolvedValue('tok-live'),
    refreshTokens: vi.fn(),
    onAuthCleared: vi.fn().mockReturnValue(() => {}),
  },
}));

vi.mock('../../hooks/useNavigationItems', () => ({
  useNavigationItems: () => [
    { label: 'Cases', path: '/cases', active: false },
    { label: 'Knowledge Base', path: '/kb', active: false },
  ],
}));

vi.mock('../../context/AuthContext', () => ({
  useAuth: () => ({
    authState: {
      user: {
        user_id: 'u1',
        username: 'ada',
        email: 'ada@example.com',
        display_name: 'Ada L',
        roles: ['user'],
      },
    },
    deployment: 'standalone',
    role: 'individual',
    isAdmin: false,
    clearAuthState: vi.fn(),
    isAuthenticated: true,
  }),
  AuthProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock('../../hooks/useCapabilities', () => ({
  useCapabilities: () => ({ managementConsole: false, loading: false }),
}));

vi.mock('../../lib/api', () => ({
  logoutAuth: vi.fn(),
  getAccountProfile: vi.fn(),
  authManager: { getAccessToken: vi.fn().mockResolvedValue('tok-live') },
  config: { apiUrl: 'http://localhost:8090' },
}));

import { MemoryRouter } from 'react-router-dom';

/**
 * The signed-in person, as an account row displays them.
 *
 * Counting the NAME rather than a class or a component is what makes this an
 * assertion about what the user sees: two account rows is two of these on the
 * page, whatever markup produced them.
 */
const ACCOUNT_NAME = /Ada L/g;

/** The shell's account control. */
const SHELL_ACCOUNT_LABEL = '[aria-label^="Account: "]';

/**
 * The package's own account row, structurally.
 *
 * Its expanded branch is a container titled with the user's email. NOT the
 * `Signed in as` text — that lives only in the COLLAPSED branch, and a first
 * draft of this file used it as the marker and passed against both modes,
 * asserting nothing. The probe that caught it is why both markers below are
 * checked in the failure-state test.
 */
const PANEL_ACCOUNT_ROW = '[title="ada@example.com"]';

/** The package's "go to the Dashboard" button — meaningless on the Dashboard. */
const PANEL_DASHBOARD_LINK = '[title="Open Dashboard"]';

function stubBackend() {
  const json = (body: unknown) =>
    new Response(JSON.stringify(body), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  return vi.fn(async (input: RequestInfo | URL) => {
    const url = typeof input === 'string' ? input : input.toString();
    if (url.includes('/capabilities')) {
      return json({ features: {}, dashboardUrl: 'http://localhost:3333' });
    }
    if (url.includes('/sessions')) return json({ session_id: 'sess-1' });
    if (url.includes('/cases')) return json({ cases: [], total_count: 0 });
    return json({});
  });
}

function stubHost(): WiredHost {
  return {
    ...createWebHostCapabilities(() => {}),
    session: {
      user: {
        id: 'u1',
        username: 'ada',
        displayName: 'Ada L',
        email: 'ada@example.com',
        roles: ['user'],
      },
      accessToken: async () => 'tok-live',
      onUnauthorized: () => {},
      signOut: null,
      subscribeAuthState: () => () => {},
    },
  };
}

/**
 * A Dashboard page, through the app's OWN mount.
 *
 * Not `<CopilotPanel chrome="embedded">` rendered directly — that asserts the
 * PACKAGE honours a prop, which is the package's own repository's business, and
 * leaves "the Dashboard passes it" bound by nothing. A first draft did exactly
 * that, and flipping the mount's chrome to `full` broke no test at all.
 */
async function renderDashboardPage() {
  const result = render(
    <MemoryRouter>
      <div>
        <PageHeader onLogout={() => {}} />
        <CopilotPanelMount initialCase={{ kind: 'new' }} />
      </div>
    </MemoryRouter>,
  );
  await waitFor(() => {
    expect(result.container.textContent).not.toMatch(/connecting to faultmaven/i);
    expect(result.container.textContent).not.toMatch(/starting the copilot/i);
  });
  return result;
}

/**
 * The same page with the panel's FULL chrome — the failure state.
 *
 * Mounted directly, because the Dashboard has no way to ask for this and should
 * not grow one. What it pins is that the markers below fire at all: without it,
 * a marker matching nothing in either mode would leave every assertion above
 * passing while the page duplicated everything.
 */
async function renderWithFullChrome(chrome: PanelChrome = 'full') {
  const host = stubHost();
  setHostStore(host.store);
  setHostEndpoints(host.endpoints);
  setApiTransport({
    baseUrl: () => host.endpoints.apiUrl(),
    accessToken: () => host.session.accessToken(),
    sessionId: async () => null,
    clearSession: async () => {},
    onUnauthorized: () => host.session.onUnauthorized(),
  });
  await host.store.set({ hasCompletedFirstRun: true });

  const result = render(
    <MemoryRouter>
      <div>
        <PageHeader onLogout={() => {}} />
        <CopilotPanel host={host} initialCase={{ kind: 'new' }} chrome={chrome} />
      </div>
    </MemoryRouter>,
  );
  await waitFor(() => {
    expect(result.container.textContent).not.toMatch(/connecting to faultmaven/i);
  });
  return result;
}

beforeEach(() => {
  localStorage.clear();
  vi.stubGlobal('fetch', stubBackend());
  Element.prototype.scrollIntoView ??= () => {};
  vi.stubGlobal(
    'matchMedia',
    vi.fn().mockReturnValue({
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  clearApiTransport();
  clearHostEndpoints();
  clearHostStore();
});

describe('the panel embedded in a Dashboard page', () => {
  it('shows exactly one account row — the shell\u2019s', async () => {
    const { container } = await renderDashboardPage();

    const names = (container.textContent ?? '').match(ACCOUNT_NAME) ?? [];
    expect(names).toHaveLength(1);
    expect(container.querySelectorAll(SHELL_ACCOUNT_LABEL)).toHaveLength(1);
    expect(container.querySelectorAll(PANEL_ACCOUNT_ROW)).toHaveLength(0);
  });

  it('shows exactly one dashboard navigation — the shell\u2019s', async () => {
    const { container } = await renderDashboardPage();

    expect(screen.getAllByRole('navigation')).toHaveLength(1);
    // And no button offering to open the page the user is already looking at.
    expect(container.querySelectorAll(PANEL_DASHBOARD_LINK)).toHaveLength(0);
  });

  it('still renders the conversation — the chrome is gone, the panel is not', async () => {
    // Without this the assertions above would be satisfied by a panel that
    // failed to mount at all, which is the exact shape of the defect this file
    // was written after.
    const { container } = await renderDashboardPage();

    expect(container.querySelector('textarea')).not.toBeNull();
  });
});

describe('the same page with the panel\u2019s full chrome', () => {
  it('duplicates the account row AND the dashboard link — which is why the Dashboard embeds', async () => {
    // The failure state of every assertion above, run against the real package.
    // Without it `chrome` could be ignored entirely, or a marker could match
    // nothing in either mode, and the tests above would still pass. Both
    // markers are asserted separately, not with an `||` — a first draft used
    // one that never rendered and the disjunction hid it.
    const { container } = await renderWithFullChrome('full');

    const names = (container.textContent ?? '').match(ACCOUNT_NAME) ?? [];
    expect(names).toHaveLength(2);
    expect(container.querySelectorAll(PANEL_ACCOUNT_ROW)).toHaveLength(1);
    expect(container.querySelectorAll(PANEL_DASHBOARD_LINK)).toHaveLength(1);
  });
});
