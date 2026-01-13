// AuthManager tests

import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { AuthState } from './types';

// Mock browser storage - must be hoisted before imports
vi.mock('./storage', () => ({
  browser: {
    storage: {
      local: {
        set: vi.fn().mockResolvedValue(undefined),
        get: vi.fn().mockResolvedValue({}),
        remove: vi.fn().mockResolvedValue(undefined),
      },
    },
  },
}));

import { AuthManager } from './AuthManager';
import { browser } from './storage';

// Get mocked functions for assertions
const mockSet = browser?.storage?.local.set as ReturnType<typeof vi.fn>;
const mockGet = browser?.storage?.local.get as ReturnType<typeof vi.fn>;
const mockRemove = browser?.storage?.local.remove as ReturnType<typeof vi.fn>;

describe('AuthManager', () => {
  let authManager: AuthManager;
  let mockAuthState: AuthState;

  beforeEach(() => {
    authManager = new AuthManager();
    vi.clearAllMocks();

    // Create mock auth state with future expiry
    mockAuthState = {
      access_token: 'test-token-123',
      token_type: 'Bearer',
      expires_at: Date.now() + 3600000, // 1 hour from now
      user: {
        user_id: 'user-123',
        email: 'test@example.com',
        roles: ['user'],
        is_active: true,
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
        token_type: 'Bearer',
        expires_at: Date.now() + 3600000,
        user: {
          user_id: 'user-123',
          email: 'test@example.com',
          roles: [],
          is_active: true,
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
