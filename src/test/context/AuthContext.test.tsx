import { render, screen, waitFor, act } from '@testing-library/react';
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
  const { deployment, loginUrl, configStatus, retryConfigDetection } = useAuth();
  return (
    <div>
      <span data-testid="deployment">{deployment ?? 'null'}</span>
      <span data-testid="loginUrl">{loginUrl ?? 'null'}</span>
      <span data-testid="configStatus">{configStatus}</span>
      <button data-testid="retry" onClick={retryConfigDetection}>
        retry
      </button>
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

describe('AuthProvider — deployment detection fails CLOSED', () => {
  let fetchSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    fetchSpy = vi.fn();
    globalThis.fetch = fetchSpy as unknown as typeof fetch;
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  /** Drive the mount fetch plus the full retry ladder (1s + 3s backoff). */
  async function exhaustRetries() {
    // Initial attempt settles on microtasks; each retry waits on a timer.
    for (const ms of [0, 1100, 3100]) {
      await act(async () => {
        await vi.advanceTimersByTimeAsync(ms);
      });
    }
  }

  it('network failure on every attempt → unreachable, and NEVER claims standalone', async () => {
    // The regression this pins: a blocked fetch (Chrome Local Network Access,
    // API down, DNS failure) used to default deployment to 'standalone',
    // rendering the "LOCAL MODE ACTIVE" dev-login to cloud users.
    fetchSpy.mockRejectedValue(new TypeError('Failed to fetch'));

    renderProvider();
    await exhaustRetries();

    expect(screen.getByTestId('configStatus')).toHaveTextContent('unreachable');
    expect(screen.getByTestId('deployment')).toHaveTextContent('null');
    expect(fetchSpy).toHaveBeenCalledTimes(3);
  });

  it('non-ok response fails closed too — a 500 does not prove standalone', async () => {
    fetchSpy.mockResolvedValue({ ok: false, status: 500, json: async () => ({}) });

    renderProvider();
    await exhaustRetries();

    expect(screen.getByTestId('configStatus')).toHaveTextContent('unreachable');
    expect(screen.getByTestId('deployment')).toHaveTextContent('null');
  });

  it('a mid-ladder recovery resolves normally (transient startup race)', async () => {
    fetchSpy
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValueOnce({ ok: true, json: async () => ({ auth_mode: 'local' }) });

    renderProvider();
    await exhaustRetries();

    expect(screen.getByTestId('configStatus')).toHaveTextContent('ok');
    expect(screen.getByTestId('deployment')).toHaveTextContent('standalone');
  });

  it('manual retry after unreachable re-detects and recovers to cloud', async () => {
    fetchSpy.mockRejectedValue(new TypeError('Failed to fetch'));

    renderProvider();
    await exhaustRetries();
    expect(screen.getByTestId('configStatus')).toHaveTextContent('unreachable');

    fetchSpy.mockResolvedValue({
      ok: true,
      json: async () => ({
        auth_mode: 'oauth',
        oauth: { hosted_login_url: 'https://idp.example/login' },
      }),
    });
    await act(async () => {
      screen.getByTestId('retry').click();
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(screen.getByTestId('configStatus')).toHaveTextContent('ok');
    expect(screen.getByTestId('deployment')).toHaveTextContent('cloud');
    expect(screen.getByTestId('loginUrl')).toHaveTextContent('https://idp.example/login');
  });

  it('the standalone login variant requires a CONFIRMED local auth_mode', async () => {
    fetchSpy.mockResolvedValue({ ok: true, json: async () => ({ auth_mode: 'local' }) });

    renderProvider();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(screen.getByTestId('configStatus')).toHaveTextContent('ok');
    expect(screen.getByTestId('deployment')).toHaveTextContent('standalone');
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });
});
