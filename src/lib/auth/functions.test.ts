// Auth functions tests

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import type { AuthState } from './types';


// Mock config - must be hoisted before imports
vi.mock('../../config', () => ({
  default: {
    apiUrl: 'http://test-api.local',
  },
}));

// Mock AuthManager - must be hoisted before imports
vi.mock('./AuthManager', () => ({
  authManager: {
    saveAuthState: vi.fn().mockResolvedValue(undefined),
    getAccessToken: vi.fn().mockResolvedValue('test-token'),
    clearAuthState: vi.fn().mockResolvedValue(undefined),
  },
}));

import { devLogin, logoutAuth } from './functions';
import { AuthenticationError } from './types';
import { authManager } from './AuthManager';

// Get mocked functions for assertions
const mockSaveAuthState = authManager.saveAuthState as ReturnType<typeof vi.fn>;
const mockGetAccessToken = authManager.getAccessToken as ReturnType<typeof vi.fn>;
const mockClearAuthState = authManager.clearAuthState as ReturnType<typeof vi.fn>;

describe('devLogin', () => {
  let fetchSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    fetchSpy = vi.fn();
    globalThis.fetch = fetchSpy as any;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should successfully login with valid username', async () => {
    const mockAuthState: AuthState = {
      access_token: 'test-token-123',
      token_type: 'bearer',
      expires_at: Date.now() + 3600000,
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
      json: async () => mockAuthState,
    });

    const result = await devLogin('testuser');

    expect(fetchSpy).toHaveBeenCalledWith('http://test-api.local/api/v1/auth/dev-login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ username: 'testuser' }),
    });

    expect(mockSaveAuthState).toHaveBeenCalledWith(mockAuthState);
    expect(result).toEqual(mockAuthState);
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
    const mockAuthState: AuthState = {
      access_token: 'token',
      token_type: 'bearer',
      expires_at: Date.now() + 3600000,
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
      json: async () => mockAuthState,
    });

    const result = await devLogin('');

    expect(fetchSpy).toHaveBeenCalledWith('http://test-api.local/api/v1/auth/dev-login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ username: '' }),
    });

    expect(result).toEqual(mockAuthState);
  });

  it('should handle username with special characters', async () => {
    const mockAuthState: AuthState = {
      access_token: 'token',
      token_type: 'bearer',
      expires_at: Date.now() + 3600000,
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
      json: async () => mockAuthState,
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
    globalThis.fetch = fetchSpy as any;
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
    vi.restoreAllMocks();
  });

  it('should successfully logout with valid token', async () => {
    mockGetAccessToken.mockResolvedValueOnce('test-token-123');
    fetchSpy.mockResolvedValueOnce({
      ok: true,
    });

    await logoutAuth();

    expect(mockGetAccessToken).toHaveBeenCalled();
    expect(fetchSpy).toHaveBeenCalledWith('http://test-api.local/v1/auth/logout', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer test-token-123',
      },
    });
    expect(mockClearAuthState).toHaveBeenCalled();
  });

  it('should clear auth state even when no token exists', async () => {
    mockGetAccessToken.mockResolvedValueOnce(null);

    await logoutAuth();

    expect(mockGetAccessToken).toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(mockClearAuthState).toHaveBeenCalled();
  });

  it('should clear auth state even when logout API fails', async () => {
    mockGetAccessToken.mockResolvedValueOnce('test-token-123');
    fetchSpy.mockResolvedValueOnce({
      ok: false,
      status: 500,
    });

    await logoutAuth();

    expect(fetchSpy).toHaveBeenCalled();
    expect(mockClearAuthState).toHaveBeenCalled();
  });

  it('should clear auth state even when network error occurs', async () => {
    mockGetAccessToken.mockResolvedValueOnce('test-token-123');
    fetchSpy.mockRejectedValueOnce(new Error('Network error'));

    await logoutAuth();

    expect(fetchSpy).toHaveBeenCalled();
    expect(consoleErrorSpy).toHaveBeenCalledWith('Logout error:', expect.any(Error));
    expect(mockClearAuthState).toHaveBeenCalled();
  });

  it('should handle empty token string', async () => {
    mockGetAccessToken.mockResolvedValueOnce('');

    await logoutAuth();

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(mockClearAuthState).toHaveBeenCalled();
  });

  it('should handle clearAuthState errors gracefully', async () => {
    mockGetAccessToken.mockResolvedValueOnce(null);
    mockClearAuthState.mockRejectedValueOnce(new Error('Storage error'));

    await expect(logoutAuth()).rejects.toThrow('Storage error');

    expect(mockClearAuthState).toHaveBeenCalled();
  });

  it('should handle 401 unauthorized on logout', async () => {
    mockGetAccessToken.mockResolvedValueOnce('expired-token');
    fetchSpy.mockResolvedValueOnce({
      ok: false,
      status: 401,
    });

    await logoutAuth();

    expect(fetchSpy).toHaveBeenCalled();
    expect(mockClearAuthState).toHaveBeenCalled();
  });
});
