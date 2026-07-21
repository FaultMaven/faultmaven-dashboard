import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../../config', () => ({
  default: { apiUrl: 'http://test-api.local' },
}));

vi.mock('../../lib/api', () => ({
  authManager: {
    getAuthState: vi.fn().mockResolvedValue(null),
    saveAuthState: vi.fn().mockResolvedValue(undefined),
    clearAuthState: vi.fn().mockResolvedValue(undefined),
    onAuthCleared: vi.fn().mockReturnValue(() => {}),
  },
}));

import { AuthProvider, useAuth } from '../../context/AuthContext';

function Probe() {
  const { deployment, loginUrl } = useAuth();
  return (
    <div>
      <span data-testid="deployment">{deployment ?? 'null'}</span>
      <span data-testid="loginUrl">{loginUrl ?? 'null'}</span>
    </div>
  );
}

function renderProvider() {
  return render(
    <AuthProvider>
      <Probe />
    </AuthProvider>,
  );
}

describe('AuthProvider — cloud hosted-login URL resolution', () => {
  let fetchSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    fetchSpy = vi.fn();
    globalThis.fetch = fetchSpy as unknown as typeof fetch;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function mockAuthConfig(body: unknown) {
    fetchSpy.mockResolvedValueOnce({ ok: true, json: async () => body });
  }

  it('uses the dedicated hosted-login field, NOT the PKCE authorize_url', async () => {
    // Regression guard: `oauth.authorize_url` is the copilot OAuth-PKCE authorize
    // endpoint (machine flow) — it must never become the human Sign In target.
    mockAuthConfig({
      auth_mode: 'oauth',
      oauth: {
        hosted_login_url: 'https://idp.example/login',
        authorize_url: '/auth/oauth/authorize',
      },
    });

    renderProvider();

    await waitFor(() => expect(screen.getByTestId('deployment')).toHaveTextContent('cloud'));
    const loginUrl = screen.getByTestId('loginUrl').textContent ?? '';
    expect(loginUrl).toBe('https://idp.example/login');
    expect(loginUrl).not.toContain('authorize');
  });

  it('resolves a relative hosted-login URL against the API origin', async () => {
    mockAuthConfig({
      auth_mode: 'oauth',
      oauth: { hosted_login_url: '/sso/login' },
    });

    renderProvider();

    await waitFor(() => expect(screen.getByTestId('deployment')).toHaveTextContent('cloud'));
    expect(screen.getByTestId('loginUrl')).toHaveTextContent('http://test-api.local/sso/login');
  });

  it('leaves loginUrl null when cloud advertises only the PKCE authorize_url', async () => {
    mockAuthConfig({
      auth_mode: 'oauth',
      oauth: { authorize_url: '/auth/oauth/authorize' },
    });

    renderProvider();

    await waitFor(() => expect(screen.getByTestId('deployment')).toHaveTextContent('cloud'));
    expect(screen.getByTestId('loginUrl')).toHaveTextContent('null');
  });

  it('standalone deployment has no login URL', async () => {
    mockAuthConfig({ auth_mode: 'local' });

    renderProvider();

    await waitFor(() => expect(screen.getByTestId('deployment')).toHaveTextContent('standalone'));
    expect(screen.getByTestId('loginUrl')).toHaveTextContent('null');
  });
});
