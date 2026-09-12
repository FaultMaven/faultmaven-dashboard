// Knowledge client tests

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import type { AuthState } from '../auth/types';


// Mock config
vi.mock('../../config', () => ({
  default: {
    apiUrl: 'http://test-api.local',
  },
}));

// Mock authManager
vi.mock('../auth', () => ({
  authManager: {
    getAccessToken: vi.fn(),
    getAuthState: vi.fn(),
    refreshTokens: vi.fn(),
  },
  AuthenticationError: class AuthenticationError extends Error {
    constructor(message: string) {
      super(message);
      this.name = 'AuthenticationError';
    }
  },
}));

import { makeAuthenticatedRequest, buildQueryParams } from './client';
import { NetworkError } from './errors';
import { authManager } from '../auth';

// Get mocked functions
const mockGetAccessToken = authManager.getAccessToken as ReturnType<typeof vi.fn>;
const mockGetAuthState = authManager.getAuthState as ReturnType<typeof vi.fn>;
const mockRefreshTokens = authManager.refreshTokens as ReturnType<typeof vi.fn>;

describe('makeAuthenticatedRequest', () => {
  let fetchSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    fetchSpy = vi.fn();
    globalThis.fetch = fetchSpy as unknown as typeof fetch;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('sends only the bearer token — no client-asserted identity headers', async () => {
    // The backend derives identity/roles from the verified JWT. The dashboard
    // must NOT assert its own X-User-ID / X-User-Roles (zero backend consumers;
    // client-asserted roles are a security smell).
    mockGetAccessToken.mockResolvedValueOnce('test-token-123');
    fetchSpy.mockResolvedValueOnce({ ok: true });

    await makeAuthenticatedRequest('/api/test');

    expect(fetchSpy).toHaveBeenCalledWith(
      'http://test-api.local/api/test',
      expect.objectContaining({
        headers: expect.any(Headers),
      })
    );

    const callArgs = fetchSpy.mock.calls[0];
    const headers = callArgs[1].headers as Headers;

    expect(headers.get('Authorization')).toBe('Bearer test-token-123');
    expect(headers.get('X-User-ID')).toBeNull();
    expect(headers.get('X-User-Roles')).toBeNull();
  });

  it('does not read auth state (no duplicate storage round-trip)', async () => {
    // The former second getAuthState() read existed only to build the removed
    // identity headers; the request now proceeds on the token alone.
    mockGetAccessToken.mockResolvedValueOnce('token');
    fetchSpy.mockResolvedValueOnce({ ok: true });

    await makeAuthenticatedRequest('/api/test');

    expect(mockGetAuthState).not.toHaveBeenCalled();
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('should throw AuthenticationError when no token', async () => {
    mockGetAccessToken.mockResolvedValueOnce(null);

    await expect(makeAuthenticatedRequest('/api/test')).rejects.toThrow('Not authenticated');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('should handle absolute URLs', async () => {
    const mockAuthState: AuthState = {
      access_token: 'token',
      token_type: 'bearer',
      expires_at: Date.now() + 3600000,
      user: {
        user_id: 'user-123',
        username: 'testuser',
        email: 'test@example.com',
        display_name: 'Test User',
        is_dev_user: false,
        is_active: true,
        roles: [],
      },
    };

    mockGetAccessToken.mockResolvedValueOnce('token');
    mockGetAuthState.mockResolvedValueOnce(mockAuthState);
    fetchSpy.mockResolvedValueOnce({ ok: true });

    await makeAuthenticatedRequest('https://external-api.com/data');

    expect(fetchSpy).toHaveBeenCalledWith(
      'https://external-api.com/data',
      expect.any(Object)
    );
  });

  it('should pass through request options', async () => {
    const mockAuthState: AuthState = {
      access_token: 'token',
      token_type: 'bearer',
      expires_at: Date.now() + 3600000,
      user: {
        user_id: 'user-123',
        username: 'testuser',
        email: 'test@example.com',
        display_name: 'Test User',
        is_dev_user: false,
        is_active: true,
        roles: [],
      },
    };

    mockGetAccessToken.mockResolvedValueOnce('token');
    mockGetAuthState.mockResolvedValueOnce(mockAuthState);
    fetchSpy.mockResolvedValueOnce({ ok: true });

    const requestOptions: RequestInit = {
      method: 'POST',
      body: JSON.stringify({ data: 'test' }),
    };

    await makeAuthenticatedRequest('/api/test', requestOptions);

    const callArgs = fetchSpy.mock.calls[0];
    expect(callArgs[1].method).toBe('POST');
    expect(callArgs[1].body).toBe('{"data":"test"}');
  });

  it('should merge custom headers with auth headers', async () => {
    const mockAuthState: AuthState = {
      access_token: 'token',
      token_type: 'bearer',
      expires_at: Date.now() + 3600000,
      user: {
        user_id: 'user-123',
        username: 'testuser',
        email: 'test@example.com',
        display_name: 'Test User',
        is_dev_user: false,
        is_active: true,
        roles: ['user'],
      },
    };

    mockGetAccessToken.mockResolvedValueOnce('token');
    mockGetAuthState.mockResolvedValueOnce(mockAuthState);
    fetchSpy.mockResolvedValueOnce({ ok: true });

    await makeAuthenticatedRequest('/api/test', {
      headers: {
        'Content-Type': 'application/json',
        'X-Custom-Header': 'custom-value',
      },
    });

    const callArgs = fetchSpy.mock.calls[0];
    const headers = callArgs[1].headers as Headers;

    expect(headers.get('Authorization')).toBe('Bearer token');
    expect(headers.get('Content-Type')).toBe('application/json');
    expect(headers.get('X-Custom-Header')).toBe('custom-value');
  });

  it('should return fetch response', async () => {
    const mockAuthState: AuthState = {
      access_token: 'token',
      token_type: 'bearer',
      expires_at: Date.now() + 3600000,
      user: {
        user_id: 'user-123',
        username: 'testuser',
        email: 'test@example.com',
        display_name: 'Test User',
        is_dev_user: false,
        is_active: true,
        roles: [],
      },
    };

    const mockResponse = { ok: true, status: 200 };

    mockGetAccessToken.mockResolvedValueOnce('token');
    mockGetAuthState.mockResolvedValueOnce(mockAuthState);
    fetchSpy.mockResolvedValueOnce(mockResponse);

    const result = await makeAuthenticatedRequest('/api/test');

    expect(result).toBe(mockResponse);
  });

  it('refreshes and retries once on a 401, returning the retried response', async () => {
    const mockAuthState: AuthState = {
      access_token: 'stale-token',
      token_type: 'bearer',
      expires_at: Date.now() + 3600000,
      user: {
        user_id: 'user-123',
        username: 'testuser',
        email: 'test@example.com',
        display_name: 'Test User',
        is_dev_user: false,
        is_active: true,
        roles: [],
      },
    };

    mockGetAccessToken.mockResolvedValueOnce('stale-token');
    mockGetAuthState.mockResolvedValueOnce(mockAuthState);
    const unauthorized = { ok: false, status: 401 };
    const retried = { ok: true, status: 200 };
    fetchSpy.mockResolvedValueOnce(unauthorized).mockResolvedValueOnce(retried);
    mockRefreshTokens.mockResolvedValueOnce('fresh-token');

    const result = await makeAuthenticatedRequest('/api/test');

    expect(mockRefreshTokens).toHaveBeenCalledTimes(1);
    // The rejected token must be named. Without it the refresh path judges
    // staleness by the expiry clock, finds this not-yet-expired token
    // acceptable, and hands the very token the server just refused back for
    // the retry — no rotation, no recovery (#48 round-2 review).
    expect(mockRefreshTokens).toHaveBeenCalledWith('stale-token');
    expect(fetchSpy).toHaveBeenCalledTimes(2);
    // Retry carries the refreshed bearer token.
    const retryHeaders = fetchSpy.mock.calls[1][1].headers as Headers;
    expect(retryHeaders.get('Authorization')).toBe('Bearer fresh-token');
    expect(result).toBe(retried);
  });

  it('returns the original 401 when refresh is not possible', async () => {
    const mockAuthState: AuthState = {
      access_token: 'stale-token',
      token_type: 'bearer',
      expires_at: Date.now() + 3600000,
      user: {
        user_id: 'user-123',
        username: 'testuser',
        email: 'test@example.com',
        display_name: 'Test User',
        is_dev_user: false,
        is_active: true,
        roles: [],
      },
    };

    mockGetAccessToken.mockResolvedValueOnce('stale-token');
    mockGetAuthState.mockResolvedValueOnce(mockAuthState);
    const unauthorized = { ok: false, status: 401 };
    fetchSpy.mockResolvedValueOnce(unauthorized);
    mockRefreshTokens.mockResolvedValueOnce(null);

    const result = await makeAuthenticatedRequest('/api/test');

    expect(mockRefreshTokens).toHaveBeenCalledTimes(1);
    expect(fetchSpy).toHaveBeenCalledTimes(1); // no retry
    expect(result).toBe(unauthorized);
  });
});

describe('buildQueryParams', () => {
  it('should build query string from object', () => {
    const params = {
      page: 1,
      limit: 10,
      search: 'test',
    };

    const result = buildQueryParams(params);

    expect(result).toBe('page=1&limit=10&search=test');
  });

  it('should handle empty object', () => {
    const result = buildQueryParams({});

    expect(result).toBe('');
  });

  it('should skip undefined values', () => {
    const params = {
      page: 1,
      limit: undefined,
      search: 'test',
    };

    const result = buildQueryParams(params);

    expect(result).toBe('page=1&search=test');
  });

  it('should convert numbers to strings', () => {
    const params = {
      page: 1,
      limit: 100,
      offset: 0,
    };

    const result = buildQueryParams(params);

    expect(result).toBe('page=1&limit=100&offset=0');
  });

  it('should handle string values', () => {
    const params = {
      search: 'hello world',
      filter: 'active',
    };

    const result = buildQueryParams(params);

    expect(result).toBe('search=hello+world&filter=active');
  });

  it('should URL encode special characters', () => {
    const params = {
      search: 'test@example.com',
      filter: 'name=value',
    };

    const result = buildQueryParams(params);

    expect(result).toBe('search=test%40example.com&filter=name%3Dvalue');
  });

  it('should handle mixed types', () => {
    const params = {
      page: 1,
      search: 'test',
      sort: undefined,
      limit: 50,
    };

    const result = buildQueryParams(params);

    expect(result).toBe('page=1&search=test&limit=50');
  });

  it('should handle zero values', () => {
    const params = {
      page: 0,
      offset: 0,
    };

    const result = buildQueryParams(params);

    expect(result).toBe('page=0&offset=0');
  });

  it('should handle empty strings', () => {
    const params = {
      search: '',
      filter: 'active',
    };

    const result = buildQueryParams(params);

    expect(result).toBe('search=&filter=active');
  });
});

/**
 * A transport failure is not "Failed to fetch" (faultmaven-dashboard#133).
 *
 * `fetch` REJECTS when it cannot reach the server at all — no status, no body,
 * nothing `handleAPIResponse` can classify — and the browser's message is the
 * same six words for a backend that is down, a DNS failure, an offline laptop,
 * a TLS error and a refused CORS preflight. `NetworkError` was declared and
 * exported for exactly this case and never thrown by anything.
 */
describe('a request that cannot reach the server', () => {
  it('throws NetworkError naming the endpoint, not the browser default', async () => {
    vi.mocked(authManager.getAccessToken).mockResolvedValue('tok');
    vi.mocked(global.fetch as unknown as ReturnType<typeof vi.fn>).mockRejectedValue(
      new TypeError('Failed to fetch'),
    );

    const error = await makeAuthenticatedRequest('/api/test').catch((e: unknown) => e);

    expect(error).toBeInstanceOf(NetworkError);
    expect((error as NetworkError).message).not.toBe('Failed to fetch');
    expect((error as NetworkError).message).toContain('Could not reach');
  });

  it('keeps the original as `cause`, so the real reason is still reachable', async () => {
    // The friendly message is for the user; the TypeError is what a developer
    // needs in the console. Replacing it outright would lose the only signal
    // that distinguishes CORS from DNS from a dead port.
    const original = new TypeError('Failed to fetch');
    vi.mocked(authManager.getAccessToken).mockResolvedValue('tok');
    vi.mocked(global.fetch as unknown as ReturnType<typeof vi.fn>).mockRejectedValue(original);

    const error = (await makeAuthenticatedRequest('/api/test').catch((e: unknown) => e)) as NetworkError;

    expect(error.cause).toBe(original);
  });

  it('lets an ABORT through unchanged', async () => {
    // A cancelled request is the caller's own doing, not a network failure —
    // rewriting it would break every `AbortController` caller that checks for it.
    const abort = new DOMException('The operation was aborted.', 'AbortError');
    vi.mocked(authManager.getAccessToken).mockResolvedValue('tok');
    vi.mocked(global.fetch as unknown as ReturnType<typeof vi.fn>).mockRejectedValue(abort);

    const error = await makeAuthenticatedRequest('/api/test').catch((e: unknown) => e);

    expect(error).toBe(abort);
    expect(error).not.toBeInstanceOf(NetworkError);
  });

  it('does NOT wrap an HTTP error response — that keeps its status and body', async () => {
    // A 500 resolves normally and stays `handleAPIResponse`'s business, which
    // has the detail the backend went to the trouble of sending.
    vi.mocked(authManager.getAccessToken).mockResolvedValue('tok');
    vi.mocked(global.fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(
      new Response('{"detail":"boom"}', { status: 500 }),
    );

    const response = await makeAuthenticatedRequest('/api/test');

    expect(response.status).toBe(500);
  });
});
