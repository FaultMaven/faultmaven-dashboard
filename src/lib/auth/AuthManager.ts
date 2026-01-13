// Authentication manager for handling auth state

import type { AuthState } from './types';
import { browser } from './storage';

/**
 * Manages authentication state in browser storage
 *
 * Handles token storage, retrieval, expiry checking, and cleanup.
 */
export class AuthManager {
  /**
   * Save authentication state to browser storage
   */
  async saveAuthState(authState: AuthState): Promise<void> {
    if (browser?.storage) {
      await browser.storage.local.set({ authState });
    }
  }

  /**
   * Retrieve authentication state from browser storage
   * Returns null if not authenticated or token is expired
   */
  async getAuthState(): Promise<AuthState | null> {
    try {
      if (browser?.storage) {
        const result = (await browser.storage.local.get(['authState'])) as { authState?: AuthState };
        const authState = result.authState;

        if (!authState) return null;

        // Check if token is expired
        if (Date.now() >= authState.expires_at) {
          await this.clearAuthState();
          return null;
        }

        return authState;
      }
    } catch (error: unknown) {
      console.error('[AuthManager] Failed to get auth state:', error);
    }
    return null;
  }

  /**
   * Clear authentication state from browser storage
   */
  async clearAuthState(): Promise<void> {
    if (browser?.storage) {
      await browser.storage.local.remove(['authState']);
    }
  }

  /**
   * Get current access token
   * Returns null if not authenticated or token is expired
   */
  async getAccessToken(): Promise<string | null> {
    const authState = await this.getAuthState();
    return authState?.access_token || null;
  }
}

/**
 * Singleton instance of AuthManager
 */
export const authManager = new AuthManager();
