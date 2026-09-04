import { render, screen, waitFor, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../../config', () => ({
  default: { apiUrl: 'http://test-api.local' },
}));

vi.mock('../../lib/api', async () => {
  const { makeAuthManagerMock } = await import('../support/authFixtures');
  return { authManager: makeAuthManagerMock() };
});

import {
  AuthProvider,
  useAuth,
  CONFIG_RETRY_DELAYS_MS,
  CONFIG_REPROBE_INTERVAL_MS,
} from '../../context/AuthContext';

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

  /** Flush the mount attempt, then walk the real backoff schedule. */
  async function exhaustLadder() {
    for (const ms of [0, ...CONFIG_RETRY_DELAYS_MS.map((d) => d + 100)]) {
      await act(async () => {
        await vi.advanceTimersByTimeAsync(ms);
      });
    }
  }

  it('network failure settles unreachable after the FIRST attempt and NEVER claims standalone', async () => {
    // The regression this pins: a blocked fetch (Chrome Local Network Access,
    // API down, DNS failure) used to default deployment to 'standalone',
    // rendering the "LOCAL MODE ACTIVE" dev-login to cloud users.
    fetchSpy.mockRejectedValue(new TypeError('Failed to fetch'));

    renderProvider();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    // Honest verdict immediately — not after the full ladder.
    expect(screen.getByTestId('configStatus')).toHaveTextContent('unreachable');
    expect(screen.getByTestId('deployment')).toHaveTextContent('null');

    // The background ladder still runs its bounded retries.
    await exhaustLadder();
    expect(fetchSpy).toHaveBeenCalledTimes(1 + CONFIG_RETRY_DELAYS_MS.length);
    expect(screen.getByTestId('configStatus')).toHaveTextContent('unreachable');
  });

  it('non-ok response fails closed too — a 500 does not prove standalone', async () => {
    fetchSpy.mockResolvedValue({ ok: false, status: 500, json: async () => ({}) });

    renderProvider();
    await exhaustLadder();

    expect(screen.getByTestId('configStatus')).toHaveTextContent('unreachable');
    expect(screen.getByTestId('deployment')).toHaveTextContent('null');
  });

  it('a 200 without a recognized auth_mode is NOT a confirmed standalone', async () => {
    // Captive portal / misrouted proxy / future auth_mode: 2xx JSON that says
    // nothing this build understands must not put a login form on screen.
    fetchSpy.mockResolvedValue({ ok: true, json: async () => ({}) });

    renderProvider();
    await exhaustLadder();

    expect(screen.getByTestId('configStatus')).toHaveTextContent('unreachable');
    expect(screen.getByTestId('deployment')).toHaveTextContent('null');
  });

  it('the background ladder upgrades unreachable → ok in place (startup race)', async () => {
    fetchSpy
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValueOnce({ ok: true, json: async () => ({ auth_mode: 'local' }) });

    renderProvider();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(screen.getByTestId('configStatus')).toHaveTextContent('unreachable');

    await act(async () => {
      await vi.advanceTimersByTimeAsync(CONFIG_RETRY_DELAYS_MS[0] + 100);
    });
    expect(screen.getByTestId('configStatus')).toHaveTextContent('ok');
    expect(screen.getByTestId('deployment')).toHaveTextContent('standalone');
  });

  it('manual retry is a single attempt and recovers to cloud', async () => {
    fetchSpy.mockRejectedValue(new TypeError('Failed to fetch'));

    renderProvider();
    await exhaustLadder();
    expect(screen.getByTestId('configStatus')).toHaveTextContent('unreachable');
    const attemptsBefore = fetchSpy.mock.calls.length;

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

    expect(fetchSpy).toHaveBeenCalledTimes(attemptsBefore + 1);
    expect(screen.getByTestId('configStatus')).toHaveTextContent('ok');
    expect(screen.getByTestId('deployment')).toHaveTextContent('cloud');
    expect(screen.getByTestId('loginUrl')).toHaveTextContent('https://idp.example/login');
  });

  it('while unreachable, the background re-probe self-heals without any user action', async () => {
    // A signed-in user never sees LoginPage's Retry button; the interval is
    // their only path back to a confirmed deployment (and thus a role).
    fetchSpy.mockRejectedValue(new TypeError('Failed to fetch'));

    renderProvider();
    await exhaustLadder();
    expect(screen.getByTestId('configStatus')).toHaveTextContent('unreachable');

    fetchSpy.mockResolvedValue({ ok: true, json: async () => ({ auth_mode: 'oauth', oauth: {} }) });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(CONFIG_REPROBE_INTERVAL_MS + 100);
    });

    expect(screen.getByTestId('configStatus')).toHaveTextContent('ok');
    expect(screen.getByTestId('deployment')).toHaveTextContent('cloud');
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
