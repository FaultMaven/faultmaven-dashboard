// Simplified API client for FaultMaven Dashboard
import config from "../config";

// Use the global browser object provided by storage adapter
declare global {
  interface Window {
    browser?: {
      storage: {
        local: {
          get(keys: string[]): Promise<Record<string, any>>;
          set(items: Record<string, any>): Promise<void>;
          remove(keys: string[]): Promise<void>;
        };
      };
    };
  }
}

const browser = typeof window !== 'undefined' ? window.browser : undefined;

// ===== Authentication =====

export interface AuthState {
  access_token: string;
  token_type: 'bearer';
  expires_at: number;
  user: {
    user_id: string;
    username: string;
    email: string;
    display_name: string;
    is_dev_user: boolean;
    is_active: boolean;
    roles?: string[];
  };
}

class AuthManager {
  async saveAuthState(authState: AuthState): Promise<void> {
    if (browser?.storage) {
      await browser.storage.local.set({ authState });
    }
  }

  async getAuthState(): Promise<AuthState | null> {
    try {
      if (browser?.storage) {
        const result = await browser.storage.local.get(['authState']);
        const authState = result.authState;

        if (!authState) return null;

        // Check if token is expired
        if (Date.now() >= authState.expires_at) {
          await this.clearAuthState();
          return null;
        }

        return authState;
      }
    } catch (error) {
      console.error('[AuthManager] Failed to get auth state:', error);
    }
    return null;
  }

  async clearAuthState(): Promise<void> {
    if (browser?.storage) {
      await browser.storage.local.remove(['authState']);
    }
  }

  async getAccessToken(): Promise<string | null> {
    const authState = await this.getAuthState();
    return authState?.access_token || null;
  }
}

export const authManager = new AuthManager();

// ===== API Functions =====

export class AuthenticationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AuthenticationError';
  }
}

/**
 * Development login (no password required)
 */
export async function devLogin(username: string): Promise<AuthState> {
  const response = await fetch(`${config.apiUrl}/api/v1/auth/dev-login`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ username }),
  });

  if (!response.ok) {
    throw new AuthenticationError('Login failed');
  }

  const authState = await response.json();
  await authManager.saveAuthState(authState);
  return authState;
}

/**
 * Logout and clear auth state
 */
export async function logoutAuth(): Promise<void> {
  try {
    const token = await authManager.getAccessToken();
    if (token) {
      await fetch(`${config.apiUrl}/v1/auth/logout`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });
    }
  } catch (error) {
    console.error('Logout error:', error);
  } finally {
    await authManager.clearAuthState();
  }
}

// Export for use in pages
export { config };
