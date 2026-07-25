// Authentication types and interfaces

/**
 * Authentication state stored in browser storage
 */
export interface AuthState {
  access_token: string;
  token_type: 'bearer';
  /** Absolute expiry of access_token, epoch ms. Derived from the backend's
   *  expires_in (seconds) at login/refresh time. */
  expires_at: number;
  /** Long-lived refresh token used to silently mint a new access token.
   *  Optional: absent for older stored sessions. */
  refresh_token?: string;
  user: {
    user_id: string;
    username: string;
    email: string;
    display_name: string;
    is_dev_user: boolean;
    is_active: boolean;
    // Role strings as the backend sends them. `platform_admin` is the
    // cross-tenant operator role; `admin` is organization-scoped (ADR-012 D9).
    // There is no `is_admin` boolean — the backend has never sent one.
    roles?: string[];
    organization_id?: string; // Multi-tenant organization context per backend storage fixes
  };
}

/**
 * Custom error for authentication failures
 */
export class AuthenticationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AuthenticationError';
  }
}
