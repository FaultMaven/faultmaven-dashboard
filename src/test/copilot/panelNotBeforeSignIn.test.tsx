import { render, screen, act, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Before sign-in there is no panel — and no panel CODE PATH (ADR-016 D3).
 *
 * "Two panels or two sign-in boxes visible at once, in any state, is the defect
 * this programme removes. A panel that renders without a session is the worst
 * version of it." (faultmaven-dashboard#120.)
 *
 * A test that only asserted "no panel is on screen" would pass on a build that
 * loaded, evaluated and initialised the whole shared UI behind the login form.
 * So the assertion is on the MODULE: the counter below increments the first
 * time anything imports `@faultmaven/copilot-ui` at runtime, and on the login
 * route it must still be zero.
 *
 * The second test is this one's own failure state. Without it, a mount that had
 * been deleted, renamed or broken would make the first test pass for the wrong
 * reason, forever.
 */

let packageImports = 0;

vi.mock('@faultmaven/copilot-ui', () => {
  packageImports += 1;
  return {
    setHostStore: vi.fn(),
    setHostEndpoints: vi.fn(),
    setApiTransport: vi.fn(),
    CopilotPanel: () => <div data-testid="shared-copilot-ui">shared UI</div>,
  };
});

const getAuthState = vi.fn();

vi.mock('../../lib/api', () => ({
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
  authManager: {
    getAuthState: (...args: unknown[]) => getAuthState(...args),
    saveAuthState: vi.fn(),
    clearAuthState: vi.fn(),
    getAccessToken: vi.fn().mockResolvedValue('tok-live'),
    onAuthCleared: vi.fn().mockReturnValue(() => {}),
  },
  config: { apiUrl: 'http://localhost:8090' },
  SIGNOUT_NOTICE_KEY: 'fm_signout_notice',
  AuthenticationError: class extends Error {},
}));

vi.mock('../../lib/auth/AuthManager', () => ({
  authManager: {
    getAccessToken: vi.fn().mockResolvedValue('tok-live'),
    peekAccessToken: vi.fn().mockResolvedValue('tok-live'),
    refreshTokens: vi.fn(),
    onAuthCleared: vi.fn().mockReturnValue(() => {}),
  },
}));

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

import App from '../../App';

const SIGNED_IN = {
  access_token: 'tok-live',
  token_type: 'bearer' as const,
  expires_at: Date.now() + 60 * 60 * 1000,
  refresh_token: 'refresh',
  user: {
    user_id: 'u1',
    username: 'ada',
    email: 'ada@example.com',
    display_name: 'Ada L',
    is_dev_user: false,
    is_active: true,
    roles: ['user'],
  },
};

beforeEach(() => {
  vi.clearAllMocks();
  packageImports = 0;
  localStorage.clear();
  // Standalone deployment, so LoginPage renders its own single sign-in action.
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

describe('the login route', () => {
  it('renders no panel and never reaches the panel module', async () => {
    getAuthState.mockResolvedValue(null);

    await renderAppAt('/login');

    expect(screen.queryByTestId('shared-copilot-ui')).not.toBeInTheDocument();
    expect(screen.queryByTestId('copilot-panel')).not.toBeInTheDocument();
    expect(screen.queryByTestId('copilot-panel-loading')).not.toBeInTheDocument();
    // The load-bearing line. `@faultmaven/copilot-ui` is imported dynamically
    // from inside the mount, so this is zero only if nothing on this route
    // reached it — not merely "did not render it".
    expect(packageImports).toBe(0);
  });

  it('keeps an unauthenticated visit to the panel route off the panel', async () => {
    getAuthState.mockResolvedValue(null);

    await renderAppAt('/investigate');

    expect(screen.queryByTestId('shared-copilot-ui')).not.toBeInTheDocument();
    expect(packageImports).toBe(0);
  });
});

describe('the counter is not vacuous', () => {
  it('reaches the panel module once a session exists', async () => {
    getAuthState.mockResolvedValue(SIGNED_IN);

    await renderAppAt('/investigate');

    await waitFor(() => {
      expect(screen.getByTestId('shared-copilot-ui')).toBeInTheDocument();
    });
    expect(packageImports).toBe(1);
  });
});
