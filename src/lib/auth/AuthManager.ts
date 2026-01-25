// Authentication manager for handling auth state

import type { AuthState } from './types';

// Access window.browser directly to avoid module load-time evaluation issues
// The storage adapter (lib/storage.ts) initializes window.browser as a side-effect
function getBrowserStorage() {
  if (typeof window === 'undefined') return undefined;
  return window.browser;
}

/**
 * Manages authentication state in browser storage
 *
 * Handles token storage, retrieval, expiry checking, and cleanup.
 */
export class AuthManager {
  constructor() {
    // Dev-mode assertion: Ensure storage adapter is initialized
    if (import.meta.env.DEV && typeof window !== 'undefined' && !getBrowserStorage()?.storage) {
      console.error(
        '❌ CRITICAL: Browser storage adapter not initialized! ' +
        'Auth will fail. Ensure lib/storage.ts is imported in main.tsx.'
      );
    }
  }

  /**
   * Save authentication state to browser storage
   */
  async saveAuthState(authState: AuthState): Promise<void> {
    const browser = getBrowserStorage();
    if (browser?.storage) {
      await browser.storage.local.set({ authState });
    }
  }

  /**
   * Retrieve authentication state from browser storage
   * Returns null if not authenticated or token is expired
   */
  async getAuthState(): Promise<AuthState | null> {
    const browser = getBrowserStorage();
    try {
      if (browser?.storage) {
        const result = (await browser.storage.local.get(['authState'])) as { authState?: AuthState };
        const authState = result.authState;

        if (!authState) {
          return null;
        }

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
    const browser = getBrowserStorage();
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
