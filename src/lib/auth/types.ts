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
  /** Server-side session this login created. Sent back as X-Session-Id on
   *  logout so the server can end the IdP session without the browser.
   *  Optional: absent for sessions stored before it was persisted. */
  session_id?: string;
  /** Where to send the browser to end the identity provider's own session.
   *
   *  Present only for SSO logins. Clearing our state does NOT end the IdP's
   *  session, so without navigating here the next sign-in is answered silently:
   *  the account cannot be switched, and a shared browser is one click from
   *  being signed back in. Absent for dev/password logins and for sessions
   *  stored before this field existed — logout then behaves as it always did. */
  idp_logout_url?: string | null;
  user: {
    user_id: string;
    username: string;
    email: string;
    display_name: string;
    is_dev_user: boolean;
    // ‼ NO `is_active`. It was declared here, REQUIRED, and the backend's
    // `UserProfile` has never carried one — no field, no `extra="allow"`, so
    // Pydantic never emits it. Nothing in `src/` read it either; it survived
    // only in test fixtures, which supplied the value that made it look real.
    // The same defect as `KBDocument.user_id` (#168), found the same way: by
    // binding the response this is built from and letting the compiler name
    // the field that does not exist. `is_active` IS real on
    // `AdminUserListItem` — the admin user list — which is a different shape
    // on a different route.
    // Role strings as the backend sends them. `platform_admin` is the
    // cross-tenant operator role; `admin` is organization-scoped (ADR-012 D9).
    // There is no `is_admin` boolean — the backend has never sent one.
    roles?: string[];
    // No tenant field. `AuthTokenResponse.user` is a `UserProfile`, which has
    // never carried one — and there is nothing to rename the deleted
    // `organization_id` to: the enterprise that actually isolates the session
    // (ADR-017 D1) is a token claim the server verifies, not something published
    // on a profile, and the billing organization (D5) is on `/auth/me` only.
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
