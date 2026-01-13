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
  },
  AuthenticationError: class AuthenticationError extends Error {
    constructor(message: string) {
      super(message);
      this.name = 'AuthenticationError';
    }
  },
}));

import { makeAuthenticatedRequest, buildQueryParams } from './client';
import { authManager } from '../auth';

// Get mocked functions
const mockGetAccessToken = authManager.getAccessToken as ReturnType<typeof vi.fn>;
const mockGetAuthState = authManager.getAuthState as ReturnType<typeof vi.fn>;

describe('makeAuthenticatedRequest', () => {
  let fetchSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    fetchSpy = vi.fn();
    global.fetch = fetchSpy;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should make authenticated request with token and user headers', async () => {
    const mockAuthState: AuthState = {
      access_token: 'test-token-123',
      token_type: 'Bearer',
      expires_at: Date.now() + 3600000,
      user: {
        user_id: 'user-123',
        email: 'test@example.com',
        roles: ['user'],
        is_active: true,
      },
    };

    mockGetAccessToken.mockResolvedValueOnce('test-token-123');
    mockGetAuthState.mockResolvedValueOnce(mockAuthState);
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
    expect(headers.get('X-User-ID')).toBe('user-123');
    expect(headers.get('X-User-Roles')).toBe('user');
  });

  it('should handle multiple roles in X-User-Roles header', async () => {
    const mockAuthState: AuthState = {
      access_token: 'token',
      token_type: 'Bearer',
      expires_at: Date.now() + 3600000,
      user: {
        user_id: 'user-123',
        email: 'admin@example.com',
        roles: ['admin', 'user', 'moderator'],
        is_active: true,
      },
    };

    mockGetAccessToken.mockResolvedValueOnce('token');
    mockGetAuthState.mockResolvedValueOnce(mockAuthState);
    fetchSpy.mockResolvedValueOnce({ ok: true });

    await makeAuthenticatedRequest('/api/test');

    const callArgs = fetchSpy.mock.calls[0];
    const headers = callArgs[1].headers as Headers;

    expect(headers.get('X-User-Roles')).toBe('admin,user,moderator');
  });

  it('should not set X-User-Roles when roles is undefined', async () => {
    const mockAuthState: AuthState = {
      access_token: 'token',
      token_type: 'Bearer',
      expires_at: Date.now() + 3600000,
      user: {
        user_id: 'user-123',
        email: 'test@example.com',
        roles: undefined as unknown as string[],
        is_active: true,
      },
    };

    mockGetAccessToken.mockResolvedValueOnce('token');
    mockGetAuthState.mockResolvedValueOnce(mockAuthState);
    fetchSpy.mockResolvedValueOnce({ ok: true });

    await makeAuthenticatedRequest('/api/test');

    const callArgs = fetchSpy.mock.calls[0];
    const headers = callArgs[1].headers as Headers;

    expect(headers.get('X-User-Roles')).toBeNull();
  });

  it('should handle empty roles array', async () => {
    const mockAuthState: AuthState = {
      access_token: 'token',
      token_type: 'Bearer',
      expires_at: Date.now() + 3600000,
      user: {
        user_id: 'user-123',
        email: 'test@example.com',
        roles: [],
        is_active: true,
      },
    };

    mockGetAccessToken.mockResolvedValueOnce('token');
    mockGetAuthState.mockResolvedValueOnce(mockAuthState);
    fetchSpy.mockResolvedValueOnce({ ok: true });

    await makeAuthenticatedRequest('/api/test');

    const callArgs = fetchSpy.mock.calls[0];
    const headers = callArgs[1].headers as Headers;

    expect(headers.get('X-User-Roles')).toBe('');
  });

  it('should throw AuthenticationError when no token', async () => {
    mockGetAccessToken.mockResolvedValueOnce(null);

    await expect(makeAuthenticatedRequest('/api/test')).rejects.toThrow('Not authenticated');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('should throw AuthenticationError when no auth state', async () => {
    mockGetAccessToken.mockResolvedValueOnce('token');
    mockGetAuthState.mockResolvedValueOnce(null);

    await expect(makeAuthenticatedRequest('/api/test')).rejects.toThrow('Not authenticated');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('should handle absolute URLs', async () => {
    const mockAuthState: AuthState = {
      access_token: 'token',
      token_type: 'Bearer',
      expires_at: Date.now() + 3600000,
      user: {
        user_id: 'user-123',
        email: 'test@example.com',
        roles: [],
        is_active: true,
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
      token_type: 'Bearer',
      expires_at: Date.now() + 3600000,
      user: {
        user_id: 'user-123',
        email: 'test@example.com',
        roles: [],
        is_active: true,
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
      token_type: 'Bearer',
      expires_at: Date.now() + 3600000,
      user: {
        user_id: 'user-123',
        email: 'test@example.com',
        roles: ['user'],
        is_active: true,
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
    expect(headers.get('X-User-ID')).toBe('user-123');
    expect(headers.get('Content-Type')).toBe('application/json');
    expect(headers.get('X-Custom-Header')).toBe('custom-value');
  });

  it('should return fetch response', async () => {
    const mockAuthState: AuthState = {
      access_token: 'token',
      token_type: 'Bearer',
      expires_at: Date.now() + 3600000,
      user: {
        user_id: 'user-123',
        email: 'test@example.com',
        roles: [],
        is_active: true,
      },
    };

    const mockResponse = { ok: true, status: 200 };

    mockGetAccessToken.mockResolvedValueOnce('token');
    mockGetAuthState.mockResolvedValueOnce(mockAuthState);
    fetchSpy.mockResolvedValueOnce(mockResponse);

    const result = await makeAuthenticatedRequest('/api/test');

    expect(result).toBe(mockResponse);
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
