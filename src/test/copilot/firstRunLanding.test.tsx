import { render, screen, act, waitFor, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Sign-in lands a zero-case user ON the panel, with a new investigation.
 *
 * ADR-016 D6, asserted END TO END through the routes rather than at the one
 * component that implements the rule. `CaseListPage` was already tested for
 * "empty and unfiltered ⇒ /investigate", and it passed — while a real browser
 * showed a freshly signed-in user landing on an empty knowledge base, because
 * both sign-in paths navigated straight to `/kb` and never reached the gate.
 *
 * A rule and a route that never meets it is the shape this file exists to keep
 * out, so the assertions start at the sign-in form and follow whatever the app
 * actually does next.
 */

let packageImports = 0;
let lastInitialCase: unknown;

vi.mock('@faultmaven/copilot-ui', () => {
  packageImports += 1;
  return {
    setHostStore: vi.fn(),
    setHostEndpoints: vi.fn(),
    setApiTransport: vi.fn(),
    clearPersistedSession: vi.fn().mockResolvedValue(undefined),
    CopilotPanel: ({ initialCase }: { initialCase?: unknown }) => {
      lastInitialCase = initialCase;
      return <div data-testid="shared-copilot-ui">shared UI</div>;
    },
  };
});

const devLogin = vi.fn();
const getAuthState = vi.fn();
const listCases = vi.fn();

vi.mock('../../lib/api', () => ({
  devLogin: (...args: unknown[]) => devLogin(...args),
  logoutAuth: vi.fn(),
  listCases: (...args: unknown[]) => listCases(...args),
  searchCases: vi.fn(),
  listDocuments: vi.fn().mockResolvedValue({ documents: [], total_count: 0, limit: 0, offset: 0 }),
  ssoExchange: vi.fn(),
  authManager: {
    getAuthState: (...args: unknown[]) => getAuthState(...args),
    saveAuthState: vi.fn(),
    clearAuthState: vi.fn(),
    getAccessToken: vi.fn().mockResolvedValue('tok-live'),
    onAuthCleared: vi.fn().mockReturnValue(() => {}),
    writeBridgeAuthState: vi.fn(),
    hasBridgeAuthState: vi.fn().mockReturnValue(false),
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
import { POST_SIGN_IN_LANDING } from '../../lib/auth/landing';

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

const NO_CASES = { cases: [], total_count: 0, page: 0, page_size: 20, has_more: false };

beforeEach(() => {
  vi.clearAllMocks();
  packageImports = 0;
  lastInitialCase = undefined;
  localStorage.clear();
  sessionStorage.clear();
  // Standalone deployment: LoginPage renders its passwordless form.
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ auth_mode: 'local', oauth: null }),
    }),
  );
  getAuthState.mockResolvedValue(null);
  devLogin.mockResolvedValue(SIGNED_IN);
  listCases.mockResolvedValue(NO_CASES);
});

async function signIn() {
  window.history.pushState({}, '', '/login');
  await act(async () => {
    render(<App />);
  });

  const username = await screen.findByLabelText(/username/i);
  fireEvent.change(username, { target: { value: 'ada' } });

  // From here on the app reads a stored session, exactly as it would after the
  // login response was persisted.
  getAuthState.mockResolvedValue(SIGNED_IN);
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: /sign in|log ?in/i }));
  });
}

describe('the destination a sign-in hands over to', () => {
  it('is the case list, which owns the zero-case rule — not the knowledge base', () => {
    // Named once, so the two sign-in paths cannot drift. `/kb` bypassed the
    // rule entirely; any value that is not the route holding it would.
    expect(POST_SIGN_IN_LANDING).toBe('/cases');
  });
});

describe('a signed-in user with no cases', () => {
  it('lands on the panel, on a new investigation', async () => {
    await signIn();

    await waitFor(() => {
      expect(screen.getByTestId('shared-copilot-ui')).toBeInTheDocument();
    });
    expect(window.location.pathname).toBe('/investigate');
    expect(lastInitialCase).toEqual({ kind: 'new' });
  });

  it('never shows the knowledge base on the way', async () => {
    await signIn();

    await waitFor(() => {
      expect(screen.getByTestId('shared-copilot-ui')).toBeInTheDocument();
    });
    expect(window.location.pathname).not.toBe('/kb');
  });
});

describe('a signed-in user who HAS cases', () => {
  it('lands on their case list, not on the panel', async () => {
    // The redirect is for an empty account. Someone with work in progress must
    // land on it — sending every sign-in to a new investigation would be the
    // same bug pointing the other way.
    listCases.mockResolvedValue({
      ...NO_CASES,
      total_count: 1,
      cases: [
        {
          case_id: 'case-1',
          title: 'Database Outage',
          description: '',
          state: 'investigating',
          created_at: '2026-01-01T00:00:00Z',
          updated_at: '2026-01-01T00:00:00Z',
          last_activity_at: '2026-01-02T00:00:00Z',
          resolved_at: null,
          closed_at: null,
          closure_reason: null,
          user_id: 'u1',
          organization_id: 'org1',
          current_turn: 1,
          source: 'copilot',
          stage: 'diagnosis',
          turns_without_progress: 0,
          is_terminal: false,
          shared_team_ids: [],
        },
      ],
    });

    await signIn();

    await waitFor(() => {
      expect(screen.getByText('Database Outage')).toBeInTheDocument();
    });
    expect(window.location.pathname).toBe('/cases');
    expect(screen.queryByTestId('shared-copilot-ui')).not.toBeInTheDocument();
    expect(packageImports).toBe(0);
  });
});
