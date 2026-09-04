import { render, screen, act, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * A sign-out in another tab signs THIS tab out — shell included.
 *
 * The panel already noticed: its host session subscribes to the same
 * cross-tab channel and tears its state down. The shell did not, because
 * `subscribeCrossTabAuthState` had exactly one consumer and it was
 * `src/copilot/webSession.ts`. A real-browser check found the result: on
 * `/investigate`, the panel logged the sign-out and cleared while the page
 * around it carried on rendering an account menu and a working route.
 *
 * Half a session is worse than either whole one. The user believes they are
 * signed out, the tab believes they are signed in, and the next thing they
 * click is a 401 they did not ask for.
 */

vi.mock('@faultmaven/copilot-ui', () => ({
  setHostStore: vi.fn(),
  setHostEndpoints: vi.fn(),
  setApiTransport: vi.fn(),
  clearPersistedSession: vi.fn().mockResolvedValue(undefined),
  CopilotPanel: () => <div data-testid="shared-copilot-ui">shared UI</div>,
}));

const getAuthState = vi.fn();
const watchCrossTabAuthChanges = vi.fn().mockReturnValue(() => {});
let fireAuthCleared: () => void = () => {};

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
    clearAuthState: vi.fn().mockResolvedValue(undefined),
    getAccessToken: vi.fn().mockResolvedValue('tok-live'),
    isCrossTabSignOut: vi.fn().mockReturnValue(true),
    watchCrossTabAuthChanges: (...args: unknown[]) => watchCrossTabAuthChanges(...args),
    // The one channel every kind of session end arrives on.
    onAuthCleared: (listener: () => void) => {
      fireAuthCleared = listener;
      return () => { fireAuthCleared = () => {}; };
    },
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
  expires_at: Date.now() + 3_600_000,
  refresh_token: 'refresh',
  user: {
    user_id: 'u1',
    username: 'ada',
    email: 'ada@example.com',
    display_name: 'Ada L',
    is_dev_user: true,
    is_active: true,
    roles: ['user'],
  },
};

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  sessionStorage.clear();
  fireAuthCleared = () => {};
  watchCrossTabAuthChanges.mockReturnValue(() => {});
  getAuthState.mockResolvedValue(SIGNED_IN);
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ auth_mode: 'local', oauth: null }),
    }),
  );
});

async function openPanelRoute() {
  window.history.pushState({}, '', '/investigate');
  let result!: ReturnType<typeof render>;
  await act(async () => {
    result = render(<App />);
  });
  await waitFor(() => {
    expect(screen.getByTestId('shared-copilot-ui')).toBeInTheDocument();
  });
  return result;
}

describe('the shell and a cross-tab sign-out', () => {
  it('starts the ONE watch, and does not roll its own', async () => {
    // The decision lives in AuthManager, which owns the credential and knows
    // which identity this tab holds. The shell only turns it on — so the shell
    // and the panel cannot disagree about what a cross-tab write means, or hear
    // it a different number of times.
    await openPanelRoute();

    expect(watchCrossTabAuthChanges).toHaveBeenCalledTimes(1);
  });

  it('takes the shell down when that watch reports the session ended', async () => {
    await openPanelRoute();

    await act(async () => {
      fireAuthCleared();
    });

    await waitFor(() => {
      expect(screen.queryByTestId('shared-copilot-ui')).not.toBeInTheDocument();
    });
    expect(window.location.pathname).toBe('/login');
  });

  it('stops watching when the provider unmounts', async () => {
    const stop = vi.fn();
    watchCrossTabAuthChanges.mockReturnValue(stop);

    const { unmount } = await openPanelRoute();
    unmount();

    expect(stop).toHaveBeenCalled();
  });
});
