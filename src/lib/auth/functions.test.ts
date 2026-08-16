// Auth functions tests

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';


// Mock config - must be hoisted before imports
vi.mock('../../config', () => ({
  default: {
    apiUrl: 'http://test-api.local',
  },
}));

// Mock AuthManager's singleton but keep the real (pure) deriveExpiresAt helper.
vi.mock('./AuthManager', async () => {
  const actual = await vi.importActual<typeof import('./AuthManager')>('./AuthManager');
  return {
    ...actual,
    authManager: {
      saveAuthState: vi.fn().mockResolvedValue(undefined),
      getAccessToken: vi.fn().mockResolvedValue('test-token'),
      peekAccessToken: vi.fn().mockResolvedValue('test-token'),
      peekIdpLogoutUrl: vi.fn().mockResolvedValue(null),
      peekSessionId: vi.fn().mockResolvedValue(null),
      clearAuthState: vi.fn().mockResolvedValue(undefined),
    },
  };
});

import { devLogin, logoutAuth, ssoExchange, SIGNOUT_NOTICE_KEY } from './functions';
import { AuthenticationError } from './types';
import { authManager } from './AuthManager';

/** A realistic `POST /auth/logout` reply. The reach of the sign-out is read off
 *  this body (`all_sessions_ended`), so a bare `{ ok: true }` mocks a backend
 *  that does not exist and hides the branch under test. */
function logoutResponse(allSessionsEnded = true) {
  return {
    ok: true,
    json: async () => ({
      message: 'Logged out successfully',
      revoked_tokens: 1,
      all_sessions_ended: allSessionsEnded,
    }),
  };
}

// Get mocked functions for assertions
const mockSaveAuthState = authManager.saveAuthState as ReturnType<typeof vi.fn>;
const mockGetAccessToken = authManager.getAccessToken as ReturnType<typeof vi.fn>;
const mockPeekAccessToken = authManager.peekAccessToken as ReturnType<typeof vi.fn>;
const mockClearAuthState = authManager.clearAuthState as ReturnType<typeof vi.fn>;

describe('devLogin', () => {
  let fetchSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    fetchSpy = vi.fn();
    globalThis.fetch = fetchSpy as unknown as typeof fetch;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should successfully login and derive expires_at + keep refresh_token', async () => {
    // The backend returns expires_in (seconds) and a refresh_token — NOT an
    // absolute expires_at. devLogin must derive expires_at so the AuthManager
    // expiry guard works and silent refresh is possible.
    const backendResponse = {
      access_token: 'test-token-123',
      token_type: 'bearer',
      expires_in: 3600,
      refresh_token: 'refresh-xyz',
      session_id: 'sess-1',
      user: {
        user_id: 'user-123',
        username: 'testuser',
        email: 'test@example.com',
        display_name: 'Test User',
        is_dev_user: true,
        is_active: true,
        roles: ['user'],
      },
    };

    fetchSpy.mockResolvedValueOnce({
      ok: true,
      json: async () => backendResponse,
    });

    const before = Date.now();
    const result = await devLogin('testuser');

    expect(fetchSpy).toHaveBeenCalledWith('http://test-api.local/api/v1/auth/dev-login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ username: 'testuser' }),
    });

    // Derived absolute expiry ~1h out; refresh token preserved.
    expect(result.access_token).toBe('test-token-123');
    expect(result.refresh_token).toBe('refresh-xyz');
    expect(result.expires_at).toBeGreaterThanOrEqual(before + 3600 * 1000);
    expect(result.expires_at).toBeLessThanOrEqual(Date.now() + 3600 * 1000);
    // The persisted state is exactly what was returned.
    expect(mockSaveAuthState).toHaveBeenCalledWith(result);
  });

  it('should throw when a 2xx login omits a usable token/expiry', async () => {
    // Contract violation: 200 OK but no access_token / expires_in. Must fail
    // loudly rather than persist an instantly-stale session.
    fetchSpy.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ user: { user_id: 'u1' } }),
    });

    await expect(devLogin('testuser')).rejects.toThrow(AuthenticationError);
    expect(mockSaveAuthState).not.toHaveBeenCalled();
  });

  it('should throw AuthenticationError on login failure', async () => {
    fetchSpy.mockResolvedValue({
      ok: false,
      status: 401,
    });

    await expect(devLogin('invalid-user')).rejects.toThrow(AuthenticationError);
    expect(mockSaveAuthState).not.toHaveBeenCalled();
  });

  it('should handle network errors', async () => {
    fetchSpy.mockRejectedValueOnce(new Error('Network error'));

    await expect(devLogin('testuser')).rejects.toThrow('Network error');
    expect(mockSaveAuthState).not.toHaveBeenCalled();
  });

  it('should handle 500 server errors', async () => {
    fetchSpy.mockResolvedValueOnce({
      ok: false,
      status: 500,
    });

    await expect(devLogin('testuser')).rejects.toThrow(AuthenticationError);
    expect(mockSaveAuthState).not.toHaveBeenCalled();
  });

  it('should handle malformed JSON response', async () => {
    fetchSpy.mockResolvedValueOnce({
      ok: true,
      json: async () => {
        throw new Error('Invalid JSON');
      },
    });

    await expect(devLogin('testuser')).rejects.toThrow('Invalid JSON');
    expect(mockSaveAuthState).not.toHaveBeenCalled();
  });

  it('should handle empty username', async () => {
    const backendResponse = {
      access_token: 'token',
      token_type: 'bearer',
      expires_in: 3600,
      refresh_token: 'refresh-empty',
      user: {
        user_id: 'user-123',
        username: 'testuser',
        email: 'test@example.com',
        display_name: 'Test User',
        is_dev_user: true,
        is_active: true,
        roles: [],
      },
    };

    fetchSpy.mockResolvedValueOnce({
      ok: true,
      json: async () => backendResponse,
    });

    const result = await devLogin('');

    expect(fetchSpy).toHaveBeenCalledWith('http://test-api.local/api/v1/auth/dev-login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ username: '' }),
    });

    expect(result.access_token).toBe('token');
    expect(result.expires_at).toBeGreaterThan(Date.now());
  });

  it('should handle username with special characters', async () => {
    const backendResponse = {
      access_token: 'token',
      token_type: 'bearer',
      expires_in: 3600,
      refresh_token: 'refresh-special',
      user: {
        user_id: 'user-123',
        username: 'user+test',
        email: 'test@example.com',
        display_name: 'Test User',
        is_dev_user: true,
        is_active: true,
        roles: [],
      },
    };

    fetchSpy.mockResolvedValueOnce({
      ok: true,
      json: async () => backendResponse,
    });

    await devLogin('user+test@example.com');

    expect(fetchSpy).toHaveBeenCalledWith('http://test-api.local/api/v1/auth/dev-login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ username: 'user+test@example.com' }),
    });
  });
});

describe('logoutAuth', () => {
  let fetchSpy: ReturnType<typeof vi.fn>;
  let consoleErrorSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    fetchSpy = vi.fn();
    globalThis.fetch = fetchSpy as unknown as typeof fetch;
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
    vi.restoreAllMocks();
  });

  it('should successfully logout with valid token', async () => {
    mockPeekAccessToken.mockResolvedValueOnce('test-token-123');
    fetchSpy.mockResolvedValueOnce(logoutResponse());

    await logoutAuth();

    expect(mockPeekAccessToken).toHaveBeenCalled();
    expect(fetchSpy).toHaveBeenCalledWith('http://test-api.local/api/v1/auth/logout', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer test-token-123',
      },
    });
    expect(mockClearAuthState).toHaveBeenCalled();
  });

  it('reads the raw stored token and never triggers a refresh', async () => {
    // Regression: logout used to call getAccessToken (the refresh path), which
    // could mint a rotated refresh token only to discard it, orphaning a live
    // token server-side. It must read the RAW token (peekAccessToken) instead.
    mockPeekAccessToken.mockResolvedValueOnce('raw-stored-token');
    fetchSpy.mockResolvedValueOnce(logoutResponse());

    await logoutAuth();

    expect(mockPeekAccessToken).toHaveBeenCalled();
    expect(mockGetAccessToken).not.toHaveBeenCalled();
    const headers = (fetchSpy.mock.calls[0][1] as RequestInit).headers as Record<string, string>;
    expect(headers.Authorization).toBe('Bearer raw-stored-token');
  });

  it('logs out best-effort with an expired token (no refresh)', async () => {
    // Even when the stored access token is already expired, logout sends it
    // best-effort rather than refreshing first.
    mockPeekAccessToken.mockResolvedValueOnce('expired-but-sent');
    fetchSpy.mockResolvedValueOnce({ ok: false, status: 401 });

    await logoutAuth();

    expect(mockGetAccessToken).not.toHaveBeenCalled();
    expect(fetchSpy).toHaveBeenCalled();
    expect(mockClearAuthState).toHaveBeenCalled();
  });

  it('should clear auth state even when no token exists', async () => {
    mockPeekAccessToken.mockResolvedValueOnce(null);

    await logoutAuth();

    expect(mockPeekAccessToken).toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(mockClearAuthState).toHaveBeenCalled();
  });

  it('should clear auth state even when logout API fails', async () => {
    mockPeekAccessToken.mockResolvedValueOnce('test-token-123');
    fetchSpy.mockResolvedValueOnce({
      ok: false,
      status: 500,
    });

    await logoutAuth();

    expect(fetchSpy).toHaveBeenCalled();
    expect(mockClearAuthState).toHaveBeenCalled();
  });

  it('should clear auth state even when network error occurs', async () => {
    mockPeekAccessToken.mockResolvedValueOnce('test-token-123');
    fetchSpy.mockRejectedValueOnce(new Error('Network error'));

    await logoutAuth();

    expect(fetchSpy).toHaveBeenCalled();
    expect(consoleErrorSpy).toHaveBeenCalledWith('Logout error:', expect.any(Error));
    expect(mockClearAuthState).toHaveBeenCalled();
  });

  it('should handle empty token string', async () => {
    mockPeekAccessToken.mockResolvedValueOnce('');

    await logoutAuth();

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(mockClearAuthState).toHaveBeenCalled();
  });

  it('should handle clearAuthState errors gracefully', async () => {
    mockPeekAccessToken.mockResolvedValueOnce(null);
    mockClearAuthState.mockRejectedValueOnce(new Error('Storage error'));

    await expect(logoutAuth()).rejects.toThrow('Storage error');

    expect(mockClearAuthState).toHaveBeenCalled();
  });
});

describe('ssoExchange', () => {
  let fetchSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    fetchSpy = vi.fn();
    globalThis.fetch = fetchSpy as unknown as typeof fetch;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const backendResponse = {
    access_token: 'sso-access-token',
    token_type: 'bearer',
    expires_in: 1800,
    refresh_token: 'sso-refresh-token',
    session_id: 'sess-sso-1',
    user: {
      user_id: 'user-sso',
      username: 'jane.doe',
      email: 'jane@example.com',
      display_name: 'Jane Doe',
      is_dev_user: false,
      is_active: true,
      roles: ['user'],
    },
  };

  it('POSTs the completion code and persists a state with derived expires_at', async () => {
    fetchSpy.mockResolvedValueOnce({
      ok: true,
      json: async () => backendResponse,
    });

    const before = Date.now();
    const result = await ssoExchange('completion-code-abc');

    expect(fetchSpy).toHaveBeenCalledWith('http://test-api.local/api/v1/auth/sso/exchange', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ code: 'completion-code-abc' }),
    });

    // expires_in (seconds) → absolute expires_at (epoch ms), same contract
    // handling as devLogin, so AuthManager's expiry guard + silent refresh work.
    expect(result.access_token).toBe('sso-access-token');
    expect(result.refresh_token).toBe('sso-refresh-token');
    expect(result.expires_at).toBeGreaterThanOrEqual(before + 1800 * 1000);
    expect(result.expires_at).toBeLessThanOrEqual(Date.now() + 1800 * 1000);
    expect(mockSaveAuthState).toHaveBeenCalledWith(result);
  });

  it('throws AuthenticationError on the uniform 401 (expired/replayed code)', async () => {
    fetchSpy.mockResolvedValueOnce({
      ok: false,
      status: 401,
    });

    await expect(ssoExchange('stale-code')).rejects.toThrow(AuthenticationError);
    expect(mockSaveAuthState).not.toHaveBeenCalled();
  });

  it('throws when a 2xx exchange omits a usable token/expiry', async () => {
    // Contract violation: 200 OK without access_token/expires_in must fail
    // loudly rather than persist an instantly-stale session.
    fetchSpy.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ user: { user_id: 'u1' } }),
    });

    await expect(ssoExchange('code-xyz-123456789')).rejects.toThrow(AuthenticationError);
    expect(mockSaveAuthState).not.toHaveBeenCalled();
  });

  it('propagates network errors without persisting state', async () => {
    fetchSpy.mockRejectedValueOnce(new Error('Network error'));

    await expect(ssoExchange('code-net-fail')).rejects.toThrow('Network error');
    expect(mockSaveAuthState).not.toHaveBeenCalled();
  });
});

describe('logoutAuth — ending the identity provider session', () => {
  // Clearing our state does not end the IdP's: it holds its own cookie on its
  // own domain. Without navigating to the logout URL the next sign-in is
  // answered silently, the account cannot be switched, and a shared browser is
  // one click from being signed back in.
  const mockPeekIdpLogoutUrl = authManager.peekIdpLogoutUrl as ReturnType<typeof vi.fn>;
  let assignSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    globalThis.fetch = vi.fn().mockResolvedValue(logoutResponse()) as unknown as typeof fetch;
    mockPeekAccessToken.mockResolvedValue('test-token');
    assignSpy = vi.fn();
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { assign: assignSpy, href: 'https://app.test/' },
    });
  });

  it('navigates to the IdP logout URL after clearing local state', async () => {
    mockPeekIdpLogoutUrl.mockResolvedValue('https://authkit.test/logout?session=abc');

    await logoutAuth();

    expect(assignSpy).toHaveBeenCalledWith('https://authkit.test/logout?session=abc');
    // Order matters: navigating first would abandon the teardown mid-flight.
    expect(mockClearAuthState).toHaveBeenCalled();
    expect(mockClearAuthState.mock.invocationCallOrder[0]).toBeLessThan(
      assignSpy.mock.invocationCallOrder[0],
    );
  });

  it('reads the URL without triggering a refresh', async () => {
    // getAuthState would silently refresh a near-expired session — and on one
    // with no refresh token it CLEARS the state, destroying the URL being read.
    mockPeekIdpLogoutUrl.mockResolvedValue('https://authkit.test/logout?session=abc');

    await logoutAuth();

    expect(mockPeekIdpLogoutUrl).toHaveBeenCalled();
    expect(mockGetAccessToken).not.toHaveBeenCalled();
  });

  it('logs out normally when there is no IdP session', async () => {
    // Dev/password logins, and sessions stored before the backend sent it.
    mockPeekIdpLogoutUrl.mockResolvedValue(null);

    await logoutAuth();

    expect(mockClearAuthState).toHaveBeenCalled();
    expect(assignSpy).not.toHaveBeenCalled();
  });

  it('still clears local state when the URL cannot be read', async () => {
    mockPeekIdpLogoutUrl.mockRejectedValue(new Error('storage unavailable'));

    await expect(logoutAuth()).resolves.toEqual({ allSessionsEnded: true });

    expect(mockClearAuthState).toHaveBeenCalled();
    expect(assignSpy).not.toHaveBeenCalled();
  });
});

describe('logoutAuth — the reach of a sign-out', () => {
  // A deliberate sign-out is account-scoped: the Dashboard and the Copilot hold
  // independent token chains, so ending only the presented one leaves the other
  // signed in as the previous user. The backend reports whether the
  // account-wide revocation took; discarding that answer is how a degraded
  // revocation store becomes a UI that reports a sign-out that did not happen.
  let fetchSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    fetchSpy = vi.fn();
    globalThis.fetch = fetchSpy as unknown as typeof fetch;
    mockPeekAccessToken.mockResolvedValue('test-token');
    vi.spyOn(console, 'error').mockImplementation(() => {});
    sessionStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('reports a confirmed account-wide sign-out and leaves no notice', async () => {
    fetchSpy.mockResolvedValueOnce(logoutResponse(true));

    const outcome = await logoutAuth();

    expect(outcome.allSessionsEnded).toBe(true);
    expect(sessionStorage.getItem(SIGNOUT_NOTICE_KEY)).toBeNull();
  });

  it('records a notice when the server says the revocation did not take', async () => {
    // 200 with all_sessions_ended:false — exactly the case a discarded body hid.
    fetchSpy.mockResolvedValueOnce(logoutResponse(false));

    const outcome = await logoutAuth();

    expect(outcome.allSessionsEnded).toBe(false);
    expect(sessionStorage.getItem(SIGNOUT_NOTICE_KEY)).not.toBeNull();
  });

  it('treats a backend without the field as unconfirmed, not as success', async () => {
    fetchSpy.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ message: 'Logged out successfully', revoked_tokens: 1 }),
    });

    expect((await logoutAuth()).allSessionsEnded).toBe(false);
    expect(sessionStorage.getItem(SIGNOUT_NOTICE_KEY)).not.toBeNull();
  });

  it('treats a refused request as unconfirmed', async () => {
    fetchSpy.mockResolvedValueOnce({ ok: false, status: 500 });

    expect((await logoutAuth()).allSessionsEnded).toBe(false);
    expect(sessionStorage.getItem(SIGNOUT_NOTICE_KEY)).not.toBeNull();
  });

  it('treats a network failure as unconfirmed, and still clears local state', async () => {
    fetchSpy.mockRejectedValueOnce(new TypeError('Failed to fetch'));

    expect((await logoutAuth()).allSessionsEnded).toBe(false);
    expect(sessionStorage.getItem(SIGNOUT_NOTICE_KEY)).not.toBeNull();
    // The reach of the sign-out is a separate question from whether THIS
    // browser is signed out — the local session goes either way.
    expect(mockClearAuthState).toHaveBeenCalled();
  });

  it('clears a stale notice on the next, confirmed sign-out', async () => {
    sessionStorage.setItem(SIGNOUT_NOTICE_KEY, 'other_sessions_unconfirmed');
    fetchSpy.mockResolvedValueOnce(logoutResponse(true));

    await logoutAuth();

    expect(sessionStorage.getItem(SIGNOUT_NOTICE_KEY)).toBeNull();
  });
});

describe('logoutAuth — the logout URL is not a trust boundary', () => {
  // The value is read back out of localStorage, which anything with same-origin
  // write access can replace. location.assign would then run the logout click
  // as an arbitrary navigation.
  const mockPeekIdpLogoutUrl = authManager.peekIdpLogoutUrl as ReturnType<typeof vi.fn>;
  let assignSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    globalThis.fetch = vi.fn().mockResolvedValue(logoutResponse()) as unknown as typeof fetch;
    mockPeekAccessToken.mockResolvedValue('test-token');
    vi.spyOn(console, 'error').mockImplementation(() => {});
    assignSpy = vi.fn();
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { assign: assignSpy, href: 'https://app.test/' },
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it.each([
    ['javascript:alert(1)', 'script execution'],
    ['http://authkit.test/logout', 'downgraded scheme'],
    ['data:text/html,<h1>hi', 'inline payload'],
    ['/relative/path', 'not absolute — would parse as same-origin'],
    ['not a url at all', 'unparseable'],
  ])('refuses %s (%s) and still signs out locally', async (url) => {
    mockPeekIdpLogoutUrl.mockResolvedValue(url);

    await logoutAuth();

    expect(assignSpy).not.toHaveBeenCalled();
    // The local half must still have happened — refusing the destination is not
    // a reason to leave the user signed in.
    expect(mockClearAuthState).toHaveBeenCalled();
  });

  it('accepts a genuine https logout URL', async () => {
    mockPeekIdpLogoutUrl.mockResolvedValue('https://api.workos.com/user_management/sessions/logout?session_id=abc');

    await logoutAuth();

    expect(assignSpy).toHaveBeenCalledWith(
      'https://api.workos.com/user_management/sessions/logout?session_id=abc',
    );
  });
});

describe('logoutAuth — server-side IdP teardown', () => {
  const mockPeekSessionId = authManager.peekSessionId as ReturnType<typeof vi.fn>;
  let fetchSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    fetchSpy = vi.fn().mockResolvedValue(logoutResponse());
    globalThis.fetch = fetchSpy as unknown as typeof fetch;
    mockPeekAccessToken.mockResolvedValue('test-token');
    vi.spyOn(console, 'error').mockImplementation(() => {});
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { assign: vi.fn(), href: 'https://app.test/' },
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('sends X-Session-Id so the server can end the IdP session itself', async () => {
    // Without this the IdP session ends only if the browser completes the
    // redirect — a closed tab would leave it alive with nothing able to reach it.
    mockPeekSessionId.mockResolvedValue('sess-abc');

    await logoutAuth();

    expect(fetchSpy).toHaveBeenCalledWith(
      'http://test-api.local/api/v1/auth/logout',
      expect.objectContaining({
        headers: expect.objectContaining({ 'X-Session-Id': 'sess-abc' }),
      }),
    );
  });

  it('omits the header entirely when there is no session id', async () => {
    mockPeekSessionId.mockResolvedValue(null);

    await logoutAuth();

    const headers = fetchSpy.mock.calls[0][1].headers as Record<string, string>;
    expect(headers).not.toHaveProperty('X-Session-Id');
    expect(headers).toHaveProperty('Authorization');
  });
});
