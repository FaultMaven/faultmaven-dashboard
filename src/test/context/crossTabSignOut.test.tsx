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
const clearAuthState = vi.fn();
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
    // The real one wipes storage and then notifies; the notify half is what the
    // shell's existing listener reacts to, so the stub keeps both.
    clearAuthState: (...args: unknown[]) => {
      clearAuthState(...args);
      fireAuthCleared();
      return Promise.resolve();
    },
    getAccessToken: vi.fn().mockResolvedValue('tok-live'),
    onAuthCleared: (listener: () => void) => {
      fireAuthCleared = listener;
      return () => {
        fireAuthCleared = () => {};
      };
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
import { AUTH_STATE_STORAGE_KEY } from '../../lib/auth/crossTab';

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
  await act(async () => {
    render(<App />);
  });
  await waitFor(() => {
    expect(screen.getByTestId('shared-copilot-ui')).toBeInTheDocument();
  });
}

/** The other tab wiping the session: shared localStorage, hence a storage event. */
async function signOutInAnotherTab() {
  await act(async () => {
    window.dispatchEvent(
      new StorageEvent('storage', { key: AUTH_STATE_STORAGE_KEY, newValue: null }),
    );
  });
}

describe('a sign-out in another tab', () => {
  it('takes the shell down too, not just the panel', async () => {
    await openPanelRoute();

    await signOutInAnotherTab();

    await waitFor(() => {
      expect(screen.queryByTestId('shared-copilot-ui')).not.toBeInTheDocument();
    });
    expect(window.location.pathname).toBe('/login');
  });

  it('goes through the shell’s own sign-out path, so per-user caches are purged', async () => {
    // Not a bare React state drop. `clearAuthState` is what fires
    // `onAuthCleared`, which is what evicts the process-wide caches keyed to the
    // previous identity — otherwise the next person to sign in on this profile
    // inherits their cached KB scopes.
    await openPanelRoute();

    await signOutInAnotherTab();

    await waitFor(() => {
      expect(clearAuthState).toHaveBeenCalled();
    });
  });

  it('ignores a rotation in another tab', async () => {
    // Another tab refreshing its token writes the same key. Treating that as a
    // sign-out would log everyone out roughly every half hour.
    await openPanelRoute();

    await act(async () => {
      window.dispatchEvent(
        new StorageEvent('storage', {
          key: AUTH_STATE_STORAGE_KEY,
          newValue: JSON.stringify({ ...SIGNED_IN, access_token: 'tok-rotated' }),
        }),
      );
    });

    expect(clearAuthState).not.toHaveBeenCalled();
    expect(screen.getByTestId('shared-copilot-ui')).toBeInTheDocument();
  });
});
