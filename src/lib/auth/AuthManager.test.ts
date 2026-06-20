// AuthManager tests

import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { AuthState } from './types';

// Mock config so AuthManager.refreshTokens hits a deterministic apiUrl.
vi.mock('../../config', () => ({
  default: { apiUrl: 'http://test-api.local' },
}));

// Create mock browser object
const mockBrowser = {
  storage: {
    local: {
      set: vi.fn().mockResolvedValue(undefined),
      get: vi.fn().mockResolvedValue({}),
      remove: vi.fn().mockResolvedValue(undefined),
    },
  },
};

// Set up window.browser before importing AuthManager
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).window = { browser: mockBrowser };

import { AuthManager, deriveExpiresAt } from './AuthManager';

// Get mocked functions for assertions
const mockSet = mockBrowser.storage.local.set;
const mockGet = mockBrowser.storage.local.get;
const mockRemove = mockBrowser.storage.local.remove;

describe('AuthManager', () => {
  let authManager: AuthManager;
  let mockAuthState: AuthState;

  beforeEach(() => {
    authManager = new AuthManager();
    vi.clearAllMocks();

    // Create mock auth state with future expiry
    mockAuthState = {
      access_token: 'test-token-123',
      token_type: 'bearer',
      expires_at: Date.now() + 3600000, // 1 hour from now
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
  });

  describe('saveAuthState', () => {
    it('should save auth state to browser storage', async () => {
      await authManager.saveAuthState(mockAuthState);

      expect(mockSet).toHaveBeenCalledWith({
        authState: mockAuthState,
      });
      expect(mockSet).toHaveBeenCalledTimes(1);
    });

    it('should handle saving auth state with minimal user data', async () => {
      const minimalAuthState: AuthState = {
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

      await authManager.saveAuthState(minimalAuthState);

      expect(mockSet).toHaveBeenCalledWith({
        authState: minimalAuthState,
      });
    });
  });

  describe('getAuthState', () => {
    it('should return auth state when valid token exists', async () => {
      mockGet.mockResolvedValueOnce({ authState: mockAuthState });

      const result = await authManager.getAuthState();

      expect(result).toEqual(mockAuthState);
      expect(mockGet).toHaveBeenCalledWith(['authState']);
    });

    it('should return null when no auth state exists', async () => {
      mockGet.mockResolvedValueOnce({});

      const result = await authManager.getAuthState();

      expect(result).toBeNull();
    });

    it('should return null and clear state when token is expired', async () => {
      const expiredAuthState = {
        ...mockAuthState,
        expires_at: Date.now() - 1000, // 1 second ago
      };
      mockGet.mockResolvedValueOnce({ authState: expiredAuthState });

      const result = await authManager.getAuthState();

      expect(result).toBeNull();
      expect(mockRemove).toHaveBeenCalledWith(['authState']);
    });

    it('should return null when token expires exactly now', async () => {
      const now = Date.now();
      const expiredAuthState = {
        ...mockAuthState,
        expires_at: now,
      };
      mockGet.mockResolvedValueOnce({ authState: expiredAuthState });

      const result = await authManager.getAuthState();

      expect(result).toBeNull();
      expect(mockRemove).toHaveBeenCalledWith(['authState']);
    });

    it('should handle storage read errors gracefully', async () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      mockGet.mockRejectedValueOnce(new Error('Storage error'));

      const result = await authManager.getAuthState();

      expect(result).toBeNull();
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        '[AuthManager] Failed to get auth state:',
        expect.any(Error)
      );

      consoleErrorSpy.mockRestore();
    });
  });

  describe('clearAuthState', () => {
    it('should remove auth state from browser storage', async () => {
      await authManager.clearAuthState();

      expect(mockRemove).toHaveBeenCalledWith(['authState']);
      expect(mockRemove).toHaveBeenCalledTimes(1);
    });

    it('should not throw when storage is empty', async () => {
      await expect(authManager.clearAuthState()).resolves.not.toThrow();
    });
  });

  describe('getAccessToken', () => {
    it('should return access token when valid auth state exists', async () => {
      mockGet.mockResolvedValueOnce({ authState: mockAuthState });

      const token = await authManager.getAccessToken();

      expect(token).toBe('test-token-123');
    });

    it('should return null when no auth state exists', async () => {
      mockGet.mockResolvedValueOnce({});

      const token = await authManager.getAccessToken();

      expect(token).toBeNull();
    });

    it('should return null when token is expired', async () => {
      const expiredAuthState = {
        ...mockAuthState,
        expires_at: Date.now() - 1000,
      };
      mockGet.mockResolvedValueOnce({ authState: expiredAuthState });

      const token = await authManager.getAccessToken();

      expect(token).toBeNull();
    });

    it('should return null when auth state has no token', async () => {
      const invalidAuthState = {
        ...mockAuthState,
        access_token: '',
      };
      mockGet.mockResolvedValueOnce({ authState: invalidAuthState });

      const token = await authManager.getAccessToken();

      expect(token).toBeNull();
    });
  });

  describe('refreshTokens / silent renewal', () => {
    let fetchSpy: ReturnType<typeof vi.fn>;

    beforeEach(() => {
      fetchSpy = vi.fn();
      globalThis.fetch = fetchSpy as unknown as typeof fetch;
    });

    const withRefresh = (overrides: Partial<AuthState> = {}): AuthState => ({
      ...mockAuthState,
      refresh_token: 'refresh-abc',
      ...overrides,
    });

    it('refreshes an expired token when a refresh token is present', async () => {
      const expired = withRefresh({ expires_at: Date.now() - 1000 });
      mockGet.mockResolvedValue({ authState: expired });
      fetchSpy.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          access_token: 'new-access',
          refresh_token: 'new-refresh',
          expires_in: 3600,
        }),
      });

      const token = await authManager.getAccessToken();

      expect(fetchSpy).toHaveBeenCalledWith(
        'http://test-api.local/api/v1/auth/refresh',
        expect.objectContaining({ method: 'POST' })
      );
      expect(token).toBe('new-access');
      // New tokens + recomputed expiry are persisted.
      const saved = mockSet.mock.calls.at(-1)?.[0].authState as AuthState;
      expect(saved.access_token).toBe('new-access');
      expect(saved.refresh_token).toBe('new-refresh');
      expect(saved.expires_at).toBeGreaterThan(Date.now());
    });

    it('clears auth state when the refresh token is rejected (401)', async () => {
      const expired = withRefresh({ expires_at: Date.now() - 1000 });
      mockGet.mockResolvedValue({ authState: expired });
      fetchSpy.mockResolvedValueOnce({ ok: false, status: 401 });

      const token = await authManager.getAccessToken();

      expect(token).toBeNull();
      expect(mockRemove).toHaveBeenCalledWith(['authState']);
    });

    it('does NOT clear auth state on a network error (session may still be valid)', async () => {
      const expired = withRefresh({ expires_at: Date.now() - 1000 });
      mockGet.mockResolvedValue({ authState: expired });
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      fetchSpy.mockRejectedValueOnce(new TypeError('network down'));

      const token = await authManager.getAccessToken();

      expect(token).toBeNull();
      expect(mockRemove).not.toHaveBeenCalled();
      consoleErrorSpy.mockRestore();
    });

    it('proactively refreshes within the expiry skew window', async () => {
      // Token expires in 10s — inside the 30s skew, so it should refresh now.
      const nearExpiry = withRefresh({ expires_at: Date.now() + 10_000 });
      mockGet.mockResolvedValue({ authState: nearExpiry });
      fetchSpy.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          access_token: 'renewed',
          refresh_token: 'renewed-refresh',
          expires_in: 3600,
        }),
      });

      const token = await authManager.getAccessToken();

      expect(fetchSpy).toHaveBeenCalledTimes(1);
      expect(token).toBe('renewed');
    });

    it('dedupes concurrent refreshes into a single network call', async () => {
      const expired = withRefresh({ expires_at: Date.now() - 1000 });
      mockGet.mockResolvedValue({ authState: expired });
      fetchSpy.mockResolvedValue({
        ok: true,
        json: async () => ({
          access_token: 'shared',
          refresh_token: 'shared-refresh',
          expires_in: 3600,
        }),
      });

      const [a, b, c] = await Promise.all([
        authManager.refreshTokens(),
        authManager.refreshTokens(),
        authManager.refreshTokens(),
      ]);

      expect(a).toBe('shared');
      expect(b).toBe('shared');
      expect(c).toBe('shared');
      expect(fetchSpy).toHaveBeenCalledTimes(1);
    });

    it('clears state (does not loop) when refresh returns a malformed expires_in', async () => {
      const expired = withRefresh({ expires_at: Date.now() - 1000 });
      mockGet.mockResolvedValue({ authState: expired });
      // 200 OK but no usable expires_in — must NOT store a NaN-expiry token
      // and re-enter refresh forever.
      fetchSpy.mockResolvedValue({
        ok: true,
        json: async () => ({ access_token: 'x', refresh_token: 'y' }),
      });

      const token = await authManager.getAccessToken();

      expect(token).toBeNull();
      expect(mockRemove).toHaveBeenCalledWith(['authState']);
      expect(fetchSpy).toHaveBeenCalledTimes(1); // one attempt, no loop
    });
  });

  describe('deriveExpiresAt', () => {
    it('converts a positive expires_in (seconds) to an absolute epoch-ms expiry', () => {
      const before = Date.now();
      const at = deriveExpiresAt(3600);
      expect(at).not.toBeNull();
      expect(at!).toBeGreaterThanOrEqual(before + 3600 * 1000);
      expect(at!).toBeLessThanOrEqual(Date.now() + 3600 * 1000);
    });

    it('returns null for missing / non-numeric / non-positive / non-finite input', () => {
      expect(deriveExpiresAt(undefined)).toBeNull();
      expect(deriveExpiresAt(null)).toBeNull();
      expect(deriveExpiresAt('3600')).toBeNull();
      expect(deriveExpiresAt(0)).toBeNull();
      expect(deriveExpiresAt(-100)).toBeNull();
      expect(deriveExpiresAt(NaN)).toBeNull();
      expect(deriveExpiresAt(Infinity)).toBeNull();
    });
  });

  describe('edge cases', () => {
    it('should handle auth state with admin role', async () => {
      const adminAuthState = {
        ...mockAuthState,
        user: {
          ...mockAuthState.user,
          roles: ['admin', 'user'],
        },
      };
      mockGet.mockResolvedValueOnce({ authState: adminAuthState });

      const result = await authManager.getAuthState();

      expect(result).toEqual(adminAuthState);
      expect(result?.user.roles).toContain('admin');
    });

    it('should handle auth state with empty roles array', async () => {
      const noRolesAuthState = {
        ...mockAuthState,
        user: {
          ...mockAuthState.user,
          roles: [],
        },
      };
      mockGet.mockResolvedValueOnce({ authState: noRolesAuthState });

      const result = await authManager.getAuthState();

      expect(result).toEqual(noRolesAuthState);
      expect(result?.user.roles).toEqual([]);
    });

    it('should handle auth state with inactive user', async () => {
      const inactiveUserAuthState = {
        ...mockAuthState,
        user: {
          ...mockAuthState.user,
          is_active: false,
        },
      };
      mockGet.mockResolvedValueOnce({ authState: inactiveUserAuthState });

      const result = await authManager.getAuthState();

      expect(result).toEqual(inactiveUserAuthState);
      expect(result?.user.is_active).toBe(false);
    });
  });
});
