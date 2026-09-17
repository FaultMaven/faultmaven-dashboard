// Authentication API functions

import config from '../../config';
import type { components } from '../../types/api.generated';
import { authManager, deriveExpiresAt } from './AuthManager';
import { AuthenticationError, type AuthState } from './types';
import { isSafeLogoutUrl } from './logoutUrl';

export type PublishableScope = 'personal' | 'team' | 'global';

const PUBLISHABLE_SCOPES: readonly PublishableScope[] = ['personal', 'team', 'global'];

function isPublishableScope(scope: string): scope is PublishableScope {
  return (PUBLISHABLE_SCOPES as readonly string[]).includes(scope);
}

/**
 * `GET /auth/me/available-scopes`, bound to the pinned contract (#165).
 *
 * ‼ The contract declares `scopes: string[]`, and this NARROWS it. That is
 * deliberate and it is not a free choice: `useAvailableScopes` and the publish
 * UI switch on the members, so binding straight through would be a DOWNGRADE
 * that removes exhaustiveness checking from every consumer. Bind the name,
 * keep the guarantee the app relies on — and guard the narrowing, since
 * `Omit`/intersection tricks are blind to a rename on their own (#171, #172).
 */
type AvailableScopesResponse = Omit<
  components['schemas']['AvailableScopesResponse'],
  'scopes'
> & {
  scopes: PublishableScope[];
};

/**
 * The guards. BOTH kinds, because each misses what the other catches.
 *
 * `keys` catches the field being renamed away; `subtype` catches its TYPE
 * changing underneath the narrowing. Measured: with `keys` alone, changing the
 * wire's `scopes` from `string[]` to `string` compiles clean — and then
 * `getAvailableScopes` returns a bare string typed as an array, and the first
 * `.map()` in the publish UI throws. A `[number]` refinement check does not
 * help there either: `string[number]` is `string`, so it is a near-tautology.
 */
type _Assert<T extends true> = T;
type _IsSubtype<Narrowed, Wire> = [Narrowed] extends [Wire] ? true : false;

export type AvailableScopesGuards = {
  keys: Pick<
    components['schemas']['AvailableScopesResponse'],
    keyof AvailableScopesResponse
  >;
  subtype: _Assert<
    _IsSubtype<AvailableScopesResponse, components['schemas']['AvailableScopesResponse']>
  >;
};

/**
 * Fetch the KB scopes the current user can target when publishing a runbook.
 *
 * Backend gates by actual memberships (not AUTH_MODE), so this is the
 * single source of truth for which radio buttons / select options to render.
 */
export async function getAvailableScopes(): Promise<PublishableScope[]> {
  const token = await authManager.getAccessToken();
  if (!token) throw new AuthenticationError('Not authenticated');

  const response = await fetch(
    `${config.apiUrl}/api/v1/auth/me/available-scopes`,
    {
      method: 'GET',
      headers: { Authorization: `Bearer ${token}` },
    },
  );

  if (!response.ok) {
    throw new Error(`available-scopes fetch failed: ${response.status}`);
  }

  const body = (await response.json()) as AvailableScopesResponse;
  // ‼ FILTERED, not asserted. The contract declares `scopes: string[]`, so any
  // string conforms — the narrowing above is this client's claim, not the
  // server's promise. Add a fourth tier upstream and an unfiltered cast hands
  // the publish UI a value no `switch` has a case for, which is the
  // exhaustiveness guarantee the narrowing exists to provide, silently false.
  // Dropping the unknown member is the conservative reading: a scope this
  // build cannot render is a scope it cannot let someone publish at.
  return body.scopes.filter(isPublishableScope);
}

/** The tenant a session is bound to, as `/auth/me` names it.
 *
 * Aliased rather than declared: the shape belongs to the spec, and a second
 * copy of it here is a copy that can silently fall out of step. Kept as a name
 * because it is re-exported through the `lib/api` barrel. */
export type AccountOrganization = components['schemas']['OrganizationSummary'];

/**
 * The `/auth/me` body, taken from the generated types rather than restated.
 *
 * `organization` was written out here as an intersection while
 * faultmaven#1068 was in flight and the committed spec did not carry the
 * field. It does now, so the intersection is gone — that was the point of the
 * note it replaced: a rename upstream has to break this build rather than
 * leave it green and quietly empty the organization row at runtime.
 *
 * The generated field is optional and nullable, which is also the honest shape
 * while backends of both vintages are in the field, so nothing about how
 * callers read it changes.
 */
export type AccountProfile = components['schemas']['UserInfoResponse'];

/**
 * Fetch the signed-in account, including the organization it is bound to.
 *
 * Separate from the stored `AuthState.user`, which comes from the login
 * response and carries no organization *name* — only its id. This is the
 * canonical "who am I" read, and the only place the tenant is named.
 *
 * Called when the account menu opens rather than on every page load: the
 * organization is worth a request exactly when someone asks whose session
 * this is, and never otherwise.
 */
export async function getAccountProfile(): Promise<AccountProfile> {
  const token = await authManager.getAccessToken();
  if (!token) throw new AuthenticationError('Not authenticated');

  const response = await fetch(`${config.apiUrl}/api/v1/auth/me`, {
    method: 'GET',
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!response.ok) {
    throw new Error(`profile fetch failed: ${response.status}`);
  }

  return (await response.json()) as AccountProfile;
}

/**
 * Turn a validated token response into the session this app STORES.
 *
 * ‼ `AuthState` is not the wire shape and must not be bound to it. It holds
 * `expires_at` (epoch ms, derived here) where the contract sends `expires_in`
 * (seconds), and it is read back out of `localStorage`, so it has to tolerate
 * sessions stored by older builds. Binding it to `AuthTokenResponse` would
 * make a stored session from last month a type error about this month's
 * contract.
 *
 * What IS bound is the body this reads — by name, and partially, because the
 * caller has already decided a 2xx can lie (#165). Constructing the fields
 * explicitly rather than spreading is the point: `{...body}` typechecked only
 * because `body` was `any`, and it quietly carried through `user` and
 * `session_id` that nothing had checked. A login response with no `user` was
 * accepted and stored, and the app then crashed on the first `user.user_id`.
 */
function toAuthState(
  body: Partial<components['schemas']['AuthTokenResponse']>,
  accessToken: string,
  expiresAt: number,
): AuthState {
  if (!body.user) {
    // Same class as a missing token: a 2xx that cannot identify the account is
    // unusable, so fail here rather than three screens later.
    throw new AuthenticationError('Login response missing the account profile');
  }
  return {
    access_token: accessToken,
    token_type: 'bearer',
    expires_at: expiresAt,
    refresh_token: body.refresh_token ?? undefined,
    session_id: body.session_id,
    idp_logout_url: body.idp_logout_url,
    user: body.user,
  };
}

/**
 * Development login (no password required)
 *
 * @param username - Username for dev login
 * @returns Authentication state with access token
 * @throws {AuthenticationError} If login fails
 */
export async function devLogin(username: string): Promise<AuthState> {
  try {
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

    // The backend returns expires_in (seconds) + refresh_token; derive the
    // absolute expires_at (epoch ms) that AuthManager checks. Previously the raw
    // response was stored verbatim, leaving expires_at undefined so the expiry
    // guard never fired (and there was no refresh_token to renew with).
    // Bound by NAME, PARTIAL by intent (#165). The names make an upstream rename
    // a build error here; the partiality keeps the two-line guard below meaningful,
    // since this parses a 2xx body from a server of unknown version and
    // `openapi-typescript` renders the schema's fields as REQUIRED.
    const body = (await response.json()) as Partial<
      components['schemas']['AuthTokenResponse']
    >;
    const expiresAt = deriveExpiresAt(body.expires_in);
    if (!body.access_token || expiresAt === null) {
      // A 2xx login that omits a usable token/expiry is a contract violation;
      // fail loudly instead of storing an instantly-stale session.
      throw new AuthenticationError('Login response missing a valid token');
    }
    const authState = toAuthState(body, body.access_token, expiresAt);
    await authManager.saveAuthState(authState);
    return authState;
  } catch (error) {
    // Enhanced error handling for network issues
    if (error instanceof TypeError && error.message.includes('fetch')) {
      throw new TypeError('Could not reach API. Is the backend running on port 8090?');
    }
    throw error;
  }
}

/**
 * Exchange an SSO completion code for a FaultMaven session (ADR-015).
 *
 * The backend's `/auth/sso/callback` redirects the browser to the dashboard
 * with a short-lived single-use `code`; this trades it for the standard token
 * response. The code is single-use and expires in ~60s, so any failure means
 * the user must restart the hosted-login flow — surfaced as an
 * AuthenticationError, never retried here.
 *
 * @param code - Single-use completion code from the SSO callback redirect
 * @returns Authentication state with access token (already persisted)
 * @throws {AuthenticationError} If the exchange fails
 */
export async function ssoExchange(code: string): Promise<AuthState> {
  const response = await fetch(`${config.apiUrl}/api/v1/auth/sso/exchange`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ code }),
  });

  if (!response.ok) {
    // The backend deliberately returns a uniform 401 for every failure mode
    // (expired/replayed code, deactivated user) — don't over-interpret.
    throw new AuthenticationError('Sign-in could not be completed');
  }

  // Same contract handling as devLogin: derive the absolute expires_at that
  // AuthManager's expiry guard checks from the backend's expires_in (seconds).
  // Bound by NAME, PARTIAL by intent (#165). The names make an upstream rename
  // a build error here; the partiality keeps the two-line guard below meaningful,
  // since this parses a 2xx body from a server of unknown version and
  // `openapi-typescript` renders the schema's fields as REQUIRED.
  const body = (await response.json()) as Partial<
    components['schemas']['AuthTokenResponse']
  >;
  const expiresAt = deriveExpiresAt(body.expires_in);
  if (!body.access_token || expiresAt === null) {
    throw new AuthenticationError('Login response missing a valid token');
  }
  const authState = toAuthState(body, body.access_token, expiresAt);
  await authManager.saveAuthState(authState);
  return authState;
}

/** What a sign-out actually achieved, as far as this client can verify. */
export interface LogoutOutcome {
  /** True only when the server confirmed every session for the account ended.
   *  False covers "the server said it did not take" and "we never got an
   *  answer" alike, because they mean the same thing to the user: another
   *  client — typically the Copilot, on its own token chain — may still be
   *  signed in. Never inferred from the request merely having been sent. */
  allSessionsEnded: boolean;
}

/** sessionStorage key carrying an unconfirmed account-wide sign-out forward to
 *  the login screen. The UI that asked for the sign-out is gone by the time the
 *  answer exists — local state is cleared and the app has redirected, possibly
 *  via the IdP — so the notice has to outlive the page that would have shown
 *  it. Same tab, so sessionStorage is the right scope; it survives the IdP
 *  round trip because that returns to this origin in this tab. */
export const SIGNOUT_NOTICE_KEY = 'fm_signout_notice';

/**
 * Logout and clear authentication state
 *
 * Attempts to call the logout endpoint best-effort and always clears local auth
 * state. Reads the RAW stored token (peekAccessToken) rather than
 * getAccessToken: the latter would silently refresh a near-expired session,
 * minting a rotated refresh token only to discard it on logout and leaving a
 * live token orphaned server-side. Sending a possibly-expired token is fine —
 * server-side logout is best-effort and the local state is cleared regardless.
 *
 * Best-effort server-side, but NOT silent: a deliberate sign-out is
 * account-scoped, so the backend reports whether the account-wide revocation
 * took (`all_sessions_ended`). When it did not, the user is told rather than
 * shown a clean sign-out — see SIGNOUT_NOTICE_KEY.
 */
export async function logoutAuth(): Promise<LogoutOutcome> {
  // Read before teardown — clearing the state destroys the URL along with it.
  // peek, not getAuthState: the latter would silently refresh a near-expired
  // session, and on one with no refresh token it clears the state outright —
  // destroying the URL this is here to read.
  let idpLogoutUrl: string | null = null;
  try {
    idpLogoutUrl = await authManager.peekIdpLogoutUrl();
  } catch (error) {
    // A state we cannot read costs single-logout, not the logout. Logged rather
    // than swallowed: today readState cannot throw, so silence here would mean
    // a future change quietly disabling single-logout with no signal at all.
    console.error('Could not read IdP logout URL; signing out locally only:', error);
  }

  // Pessimistic until the server says otherwise: every path that fails to
  // produce a confirmation — no token, network error, non-2xx, an older backend
  // with no such field — leaves this false, which is what the user is told.
  let allSessionsEnded = false;

  try {
    const token = await authManager.peekAccessToken();
    if (token) {
      // X-Session-Id lets the server end the IdP session itself. That path does
      // not depend on the browser completing the redirect below, so a closed
      // tab no longer leaves the IdP session alive with nothing able to end it.
      const sessionId = await authManager.peekSessionId();
      const response = await fetch(`${config.apiUrl}/api/v1/auth/logout`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          ...(sessionId ? { 'X-Session-Id': sessionId } : {}),
        },
      });
      if (response.ok) {
        // Typed from the generated schema, so a rename on the backend breaks
        // this build rather than pinning the answer to "not confirmed" forever.
        // The `=== true` is still load-bearing at runtime: a body that will not
        // parse, or one from a backend predating the field, reads as
        // unconfirmed — which is exactly what it is.
        const body = (await response
          .json()
          .catch(() => null)) as components['schemas']['LogoutResponse'] | null;
        allSessionsEnded = body?.all_sessions_ended === true;
      }
    }
  } catch (error) {
    console.error('Logout error:', error);
  } finally {
    // BEFORE the clear, so the destination capture is suppressed rather than
    // raced: clearing fires `onAuthCleared`, AuthContext drops its state, and
    // ProtectedRoute's effect would otherwise record the URL of the account
    // that is signing out. See `beginSignOut`.
    authManager.beginSignOut();
    await authManager.clearAuthState();
  }

  // Hand the answer to the login screen, since this page is about to go away.
  // Written on failure and cleared on success, so a clean sign-out can never
  // inherit the previous one's warning.
  try {
    if (allSessionsEnded) {
      sessionStorage.removeItem(SIGNOUT_NOTICE_KEY);
    } else {
      sessionStorage.setItem(SIGNOUT_NOTICE_KEY, 'other_sessions_unconfirmed');
    }
  } catch (error) {
    // Storage can be denied (private mode, blocked cookies). Losing the notice
    // costs the warning, not the sign-out.
    console.error('Could not record the sign-out notice:', error);
  }

  // Only after local state is gone. The IdP holds its own session cookie on its
  // own domain, which nothing here can clear: revoking our token leaves that
  // session live, so the next authorization request is answered without a
  // prompt — the account cannot be switched, and the next person at a shared
  // browser is one click from being signed back in.
  //
  // This navigates away, so it must be last: nothing after it is guaranteed to
  // run. Absent for dev/password logins and for sessions stored before the
  // backend sent this field, where the caller's own redirect still applies.
  if (isSafeLogoutUrl(idpLogoutUrl)) {
    window.location.assign(idpLogoutUrl);
  }

  return { allSessionsEnded };
}

