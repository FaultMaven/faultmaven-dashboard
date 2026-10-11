// Authentication manager for handling auth state

import config from '../../config';
import type { AuthState } from './types';
import type { components } from '../../types/api.generated';
import { isSafeLogoutUrl } from './logoutUrl';
import { decodeCrossTabAuthState, subscribeCrossTabAuthState } from './crossTab';

// Refresh the access token this long before it actually expires so an in-flight
// request never races the expiry boundary.
const EXPIRY_SKEW_MS = 30_000;

// Name of the cross-tab mutex that serializes refresh-token rotation (#48).
const REFRESH_LOCK_NAME = 'fm-auth-refresh';

// Upper bound on a single /auth/refresh call. This is not about latency: the
// refresh runs while holding REFRESH_LOCK_NAME, and Web Locks have no timeout
// of their own, so an unbounded fetch in ONE tab would block every other tab's
// renewal for as long as the socket stayed open. Bounding the request bounds
// the lock hold. An abort surfaces as a thrown fetch, i.e. the transient path —
// state is kept, not cleared.
const REFRESH_TIMEOUT_MS = 15_000;

/**
 * Whether an HTTP status means the server definitively rejected the refresh
 * token we presented, as opposed to failing to answer the question.
 *
 * Only a rejection of the credential itself may clear the session. A 500/502/
 * 429 says the auth service is unwell, NOT that the user's refresh token is
 * dead — treating those as definitive turned every backend blip into a
 * forced logout for every open tab.
 */
function isCredentialRejection(status: number): boolean {
  return status === 400 || status === 401 || status === 403;
}

/**
 * The Web Locks API, when the browser exposes it.
 *
 * Returns undefined rather than assuming presence: Web Locks requires a SECURE
 * CONTEXT, so a self-hosted dashboard served over plain HTTP on a LAN address
 * — a first-class deployment for us — has no `navigator.locks` at all. The
 * lock is therefore an optimization that removes the redundant request; the
 * correctness guarantee lives in doRefresh's supersession check, which needs
 * no platform support.
 */
function getLockManager(): LockManager | undefined {
  if (typeof navigator === 'undefined') return undefined;
  return (navigator as Navigator & { locks?: LockManager }).locks;
}

/**
 * Abort signal bounding one refresh request. Prefers `AbortSignal.timeout`,
 * falls back to an `AbortController` + timer, and returns undefined (an
 * unbounded fetch, i.e. the pre-existing behaviour) only where neither exists.
 */
function refreshAbortSignal(): AbortSignal | undefined {
  if (typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function') {
    return AbortSignal.timeout(REFRESH_TIMEOUT_MS);
  }
  // Safari 15.4–15.6 ships Web Locks but NOT AbortSignal.timeout — precisely
  // the combination where an unbounded fetch would pin the cross-tab lock for
  // every other tab. Fall back rather than let the bound quietly not apply.
  if (typeof AbortController !== 'undefined') {
    const controller = new AbortController();
    setTimeout(() => controller.abort(), REFRESH_TIMEOUT_MS);
    return controller.signal;
  }
  return undefined;
}

/**
 * Whether two stored states demonstrably belong to DIFFERENT signed-in users.
 *
 * `onCredentialRejected` — the only caller — asks this as well as comparing
 * tokens, because "storage holds a different token than the one I sent" is
 * also true when the previous user logged out and a new one signed in
 * mid-flight.
 *
 * Phrased as "different" rather than "same" so that an unknown identity fails
 * closed: see the body.
 *
 * Its caller hands it the RAW row on purpose. `readState` refuses another
 * user's row, so through it a replaced session and an absent one look alike —
 * and only the absent one is this tab's to clear.
 */
function isDifferentIdentity(a: AuthState | null, b: AuthState | null): boolean {
  const left = a?.user?.user_id;
  const right = b?.user?.user_id;
  // Unknown identity is NOT a different identity. Answering "different" when
  // an id is missing routes a genuine revocation down the leave-it-alone path,
  // so the dead session survives in storage, no auth-cleared listener fires,
  // and the bridge copy is left for the extension to re-forward. Absence must
  // fail closed — fall through and let the token comparison decide.
  if (!left || !right) return false;
  return left !== right;
}

/**
 * Who a tab is signed in as — see `AuthManager.identity`.
 *
 * `unread` until its first successful read of storage; `signedIn` with the
 * user the session names, or `null` for a legacy row that names none.
 */
type TabIdentity =
  | { kind: 'unread' }
  | { kind: 'signedOut' }
  | { kind: 'signedIn'; userId: string | null };

function signedInAs(state: AuthState): TabIdentity {
  return { kind: 'signedIn', userId: state.user?.user_id ?? null };
}

/**
 * Convert the backend's `expires_in` (seconds) into an absolute `expires_at`
 * (epoch ms). Returns null when `expires_in` is missing or not a positive,
 * finite number — callers must treat that as an unusable token rather than
 * storing `Date.now() + NaN` (which makes every `Date.now() < expires_at`
 * check false and spins an endless refresh loop) or `Date.now() + 0` (an
 * instantly-expired token).
 */
export function deriveExpiresAt(expiresInSeconds: unknown): number | null {
  if (typeof expiresInSeconds !== 'number' || !Number.isFinite(expiresInSeconds)) {
    return null;
  }
  if (expiresInSeconds <= 0) {
    return null;
  }
  return Date.now() + expiresInSeconds * 1000;
}

/**
 * Read the `roles` claim out of an access token, for display gating only.
 *
 * The stored `user` object is a login-time snapshot, and refresh replaces only
 * the tokens — so without this, a session that predates a role change keeps
 * showing (or hiding) operator UI indefinitely even though the refreshed token
 * already authorizes it. Neither backend grant path revokes tokens: the
 * standalone bootstrap self-heal and `promote_to_platform_admin.py` both leave
 * existing sessions running.
 *
 * No signature verification, deliberately: this only decides what the UI
 * OFFERS. Every request is independently authorized server-side, so a forged
 * local token buys a broken page, not access. Returns null on anything
 * malformed, so a bad token can never clear a valid role set.
 */
export function readRolesFromAccessToken(token: string): string[] | null {
  try {
    const payload = token.split('.')[1];
    if (!payload) return null;
    // base64url -> base64, then pad.
    const base64 = payload.replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), '=');
    const claims = JSON.parse(atob(padded)) as { roles?: unknown };
    if (!Array.isArray(claims.roles)) return null;
    return claims.roles.filter((r): r is string => typeof r === 'string');
  } catch {
    return null;
  }
}

// Access window.browser directly to avoid module load-time evaluation issues
// The storage adapter (lib/storage.ts) initializes window.browser as a side-effect
function getBrowserStorage() {
  if (typeof window === 'undefined') return undefined;
  return window.browser;
}

/**
 * Manages authentication state in browser storage
 *
 * Handles token storage, retrieval, silent refresh, expiry checking, and cleanup.
 */
export class AuthManager {
  // Dedupe concurrent refreshes: many requests can discover the expiry at once,
  // but only one /auth/refresh call should fire (rotation revokes the old token).
  private refreshInFlight: Promise<string | null> | null = null;

  // Listeners notified whenever auth state is cleared — logout OR an
  // AuthManager-initiated wipe (e.g. a definitive refresh failure). React
  // context subscribes so it can drop its cached auth state and route back to
  // login instead of leaving the user on an error banner with stale
  // "authenticated" state; process-wide caches (e.g. available KB scopes)
  // subscribe so the next identity never sees the previous user's values.
  private authClearedListeners = new Set<() => void>();

  /**
   * Who this TAB is signed in as.
   *
   * Storage is shared, so "who is signed in" cannot be read from it to decide
   * whether another tab changed the account — by the time the event arrives,
   * storage already holds the new identity. This is the only record of what
   * this tab thought before that write landed.
   *
   * ‼ It changes ONLY through a sign-in (`saveAuthState`), a sign-out (here or
   * in another tab) or this tab's first successful read — never through a
   * later read. A read used to adopt whatever user it found, and in a real
   * browser a tab can read another tab's write before that tab's `storage`
   * event reaches it (measured: 20 of 20 runs in Chromium). Any read in that
   * window made this tab user B, the watcher then compared B with B, and the
   * tab went on showing A while every request carried B's bearer (#212).
   */
  private identity: TabIdentity = { kind: 'unread' };

  /**
   * Whether the sign-out this tab is in the middle of came from ANOTHER tab.
   *
   * Read by `ProtectedRoute`, which otherwise records the current URL as the
   * post-login destination on its way to `/login`. On a cross-tab sign-out that
   * URL belongs to the person who just signed out, so the NEXT account to sign
   * in on this tab would be deep-linked straight into the previous one's case.
   */
  private signingOut = false;

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
   * Store a SIGN-IN: the session, and that this tab is now its user.
   *
   * The one way a tab takes on an identity after its first read. Rotation does
   * not come through here (`writeState`): renewing a credential is not a
   * decision about who the tab is.
   */
  async saveAuthState(authState: AuthState): Promise<void> {
    // This tab's identity, and the end of any sign-out it was in.
    this.identity = signedInAs(authState);
    this.signingOut = false;
    await this.writeState(authState);
  }

  private async writeState(authState: AuthState): Promise<void> {
    const browser = getBrowserStorage();
    if (browser?.storage) {
      await browser.storage.local.set({ authState });
    }
    // Keep the extension-bridge copy current on every save — including token
    // rotation (#109).
    this.syncBridgeAuthState(authState);
  }

  /**
   * Whether a stored row is THIS tab's session.
   *
   * A row that names no user matches only a tab that restored one — a legacy
   * session keeps working, and a revoked one is still found and cleared. No
   * writer here stores such a row (every sign-in carries the profile), and
   * once the tab holds a named user, an unnamed row is not theirs.
   */
  private isThisTabs(state: AuthState | null): state is AuthState {
    return (
      this.identity.kind === 'signedIn' &&
      state !== null &&
      (state.user?.user_id ?? null) === this.identity.userId
    );
  }

  /**
   * Whether a stored row names a user OTHER than this tab's — the one row a
   * sign-out here must leave alone.
   *
   * Not `!isThisTabs`: a row that names nobody is no one else's either, and a
   * tab that has not read yet has no identity to compare (whatever is stored
   * would have been its restored session).
   */
  private belongsToAnotherUser(state: AuthState | null): boolean {
    const owner = state?.user?.user_id;
    if (!owner || this.identity.kind === 'unread') return false;
    return this.identity.kind === 'signedOut' || owner !== this.identity.userId;
  }

  /**
   * Mirror the current auth state into `fm_auth_state`, the localStorage key the
   * copilot's auth-bridge content script re-forwards to the extension.
   *
   * Written at login (LoginPage) but previously NOT on rotation, so after a
   * silent refresh the bridge still held the ORIGINAL — now-revoked — refresh
   * token. A dashboard reload then re-forwarded that revoked token and logged
   * the extension out (#109). Keeping it in sync means the bridge always forwards
   * the live token. Only UPDATE the key when it already exists (login creates it);
   * never create it here, so a non-bridge dashboard session stays untouched.
   */
  private syncBridgeAuthState(authState: AuthState): void {
    try {
      if (typeof localStorage !== 'undefined' && localStorage.getItem('fm_auth_state')) {
        localStorage.setItem('fm_auth_state', JSON.stringify(authState));
      }
    } catch {
      // localStorage unavailable/blocked — non-fatal; the bridge falls back to
      // its page-load read and the extension's own refresh path.
    }
  }

  /**
   * Subscribe to auth-cleared events. The listener fires after storage is wiped
   * (logout or a definitive refresh failure). Returns an unsubscribe function.
   */
  /**
   * Watch for another tab signing out, or signing a DIFFERENT account in.
   *
   * One mechanism, here, because both answers are this class's to give: it owns
   * the credential and it is the only thing that knows which identity this tab
   * holds. Before this, two independent subscribers each acted on `null` only —
   * so a cross-tab sign-out reached the panel twice, and an account switch
   * reached it not at all, leaving a tab showing user A's identity while
   * `accessToken()` handed out user B's bearer.
   *
   * Rotation is not a change of identity and is deliberately ignored; another
   * tab refreshes roughly every half hour, and treating that as a sign-out
   * would log everyone out on a timer.
   *
   * Called once, by the app shell. Returns an unsubscribe.
   */
  watchCrossTabAuthChanges(): () => void {
    return subscribeCrossTabAuthState((state) => {
      if (state === null) {
        this.signOutFromAnotherTab();
        return;
      }
      // An identity this tab never had is nothing to compare against: a tab
      // that was signed out already has no session to end. A tab signed in on
      // a row that names no user still has one, and any named user is not it.
      if (this.identity.kind !== 'signedIn') return;
      if (state.user.user_id !== this.identity.userId) {
        this.signOutFromAnotherTab();
      }
    });
  }

  /**
   * End this tab's session because another tab ended or replaced it.
   *
   * The same ending a local sign-out has — listeners notified once, on the one
   * channel, so every consumer (React state, the per-user caches, the Copilot
   * panel) hears it the same way — and two differences. No return path is
   * recorded; see `crossTabSignOut`. And storage is NOT touched: the other tab
   * already made it what it is now, so whatever is there — nothing, another
   * account, or this same account signed in afresh — is not this tab's to
   * remove. Removing another account's row is how a switch used to sign the
   * new account out as well (#212).
   */
  private signOutFromAnotherTab(): void {
    this.beginSignOut();
    this.endThisTabsSession();
  }

  /** This tab is signed out: say so, once, to everyone listening. */
  private endThisTabsSession(): void {
    this.identity = { kind: 'signedOut' };
    // AFTER storage is settled, so subscribers (React context, per-user caches)
    // observe a clean, logged-out world.
    this.notifyAuthCleared();
  }

  /**
   * A DELIBERATE sign-out is starting — here or in another tab.
   *
   * Two things, and both are needed: suppress the next destination capture, and
   * drop any destination captured before this point. Either alone leaks.
   *
   * ⚠️ CALL THIS FOR A LOCAL SIGN-OUT TOO. Only the cross-tab path used to, and
   * `logoutAuth` — the button every user actually presses — did not. So signing
   * out on `/cases/case-123?tab=report` left that URL in
   * `oauth_redirect_after_login`; `LoginPage` reads it on the next successful
   * sign-in and navigates there, and the cloud path forwards it to the IdP as
   * `return_to`, where it survives even a cleared sessionStorage. The next
   * person to sign in on that tab was deep-linked into the previous person's
   * case. The cross-tab branch was written against exactly this risk; the local
   * branch simply never got it.
   *
   * A session that DIES — an expired or revoked token — must not call this. The
   * same person is still there and returning them to their page is the point of
   * faultmaven-dashboard#133.
   */
  beginSignOut(): void {
    this.signingOut = true;
    // A destination captured before this point belongs to the account that is
    // leaving. Drop it as well as suppressing the next capture.
    try {
      sessionStorage.removeItem('oauth_redirect_after_login');
    } catch {
      // sessionStorage unavailable/blocked — non-fatal.
    }
  }

  /**
   * True while a DELIBERATE sign-out is in progress — this tab's or another's.
   *
   * Named for what it decides rather than for how it started, because that is
   * the question its one consumer asks: `ProtectedRoute` consults it before
   * recording a post-login destination, and the answer is the same either way —
   * the account is leaving on purpose, so the URL in the bar is not a place to
   * send whoever signs in next.
   *
   * It was named for the cross-tab case alone, which named the ORIGIN and
   * thereby answered only half the question. Cleared on the next successful
   * sign-in.
   */
  isSigningOut(): boolean {
    return this.signingOut;
  }

  onAuthCleared(listener: () => void): () => void {
    this.authClearedListeners.add(listener);
    return () => {
      this.authClearedListeners.delete(listener);
    };
  }

  private notifyAuthCleared(): void {
    for (const listener of this.authClearedListeners) {
      try {
        listener();
      } catch (error: unknown) {
        console.error('[AuthManager] auth-cleared listener failed:', error);
      }
    }
  }

  /**
   * Create/refresh the extension-bridge mirror (`fm_auth_state`).
   *
   * Only the copilot auth-bridge flow needs this localStorage key. A plain
   * dashboard session must NEVER create it, so that syncBridgeAuthState's
   * "update only when already present" guard keeps ordinary sessions from ever
   * mirroring tokens (incl. the refresh token) into plain localStorage. Call
   * this exclusively from the extension-login path.
   */
  writeBridgeAuthState(authState: AuthState): void {
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem('fm_auth_state', JSON.stringify(authState));
      }
    } catch {
      // localStorage unavailable/blocked — non-fatal.
    }
  }

  /**
   * Whether the extension-bridge mirror currently exists. Lets the
   * extension-login screen decide what to render without reading raw
   * localStorage at the call site.
   */
  hasBridgeAuthState(): boolean {
    try {
      return typeof localStorage !== 'undefined' && localStorage.getItem('fm_auth_state') !== null;
    } catch {
      return false;
    }
  }

  /**
   * Read the stored access token verbatim, WITHOUT triggering a refresh.
   *
   * For best-effort logout: getAccessToken would silently refresh an expired
   * session, minting a rotated refresh token only to discard it on logout and
   * leaving a live token orphaned server-side. Returns null when no session is
   * stored.
   */
  async peekAccessToken(): Promise<string | null> {
    const authState = await this.readState();
    return authState?.access_token ?? null;
  }

  /**
   * Read the stored IdP logout URL verbatim, WITHOUT triggering a refresh.
   *
   * Same reason peekAccessToken exists, plus one more: on a session with no
   * refresh token getAuthState *clears* the state and returns null, which would
   * destroy the very URL logout is trying to read. Returns null when no session
   * is stored, or for a login that had no IdP session (dev/password).
   */
  async peekIdpLogoutUrl(): Promise<string | null> {
    const authState = await this.readState();
    return authState?.idp_logout_url ?? null;
  }

  /**
   * Read the stored session id verbatim, WITHOUT triggering a refresh.
   *
   * Sent as X-Session-Id on logout so the server can end the IdP session
   * itself — the one teardown path that does not depend on the browser.
   */
  async peekSessionId(): Promise<string | null> {
    const authState = await this.readState();
    return authState?.session_id ?? null;
  }

  /**
   * Clear the session AND end the identity provider's, for a sign-out the user
   * did not ask for (rejected credential, unrefreshable session).
   *
   * Without this, single-logout is wired only to the explicit Log out button —
   * yet an expired session is the *more common* way a session ends. The IdP
   * cookie would survive, so the next "Sign in" is answered silently and the
   * next person at a shared browser lands in the previous user's account.
   *
   * Navigation is last and unconditional-on-success: local state is cleared
   * first, so a refused or missing URL still leaves the user signed out here.
   */
  private async clearAuthStateAndEndIdpSession(): Promise<void> {
    let idpLogoutUrl: string | null = null;
    try {
      idpLogoutUrl = await this.readState().then((s) => s?.idp_logout_url ?? null);
    } catch {
      // Reading is best-effort; the clear below is not.
    }
    await this.clearAuthState();
    if (isSafeLogoutUrl(idpLogoutUrl)) {
      window.location.assign(idpLogoutUrl);
    }
  }

  /**
   * THIS tab's stored session, without any expiry handling — or null when
   * storage holds none, or holds another user's.
   * Internal: callers that need a *valid* token use getAuthState/getAccessToken.
   *
   * Every credential this class hands out, renews, peeks at or ends is read
   * through here, so another account's row never reaches any of them: not the
   * Copilot panel's `accessToken()`, not a Dashboard request, and not the
   * bearer `logoutAuth` would send to revoke "this" account's sessions.
   */
  private async readState(): Promise<AuthState | null> {
    const { readable, state } = await this.readStoredRow();
    if (this.identity.kind === 'unread' && readable) {
      // A tab restored with a session never signs in — the session was already
      // in storage when the page loaded — so its first read is what tells it
      // who it is, and the only read that may. A FAILED read settles nothing:
      // pinning "signed out" on a storage hiccup would refuse this tab its own
      // session until a reload.
      this.identity = state ? signedInAs(state) : { kind: 'signedOut' };
    }
    return this.isThisTabs(state) ? state : null;
  }

  /** The stored row, whoever it belongs to. */
  private async readStoredState(): Promise<AuthState | null> {
    return (await this.readStoredRow()).state;
  }

  /** The stored row, and whether storage could be read at all. */
  private async readStoredRow(): Promise<{ readable: boolean; state: AuthState | null }> {
    const browser = getBrowserStorage();
    try {
      if (browser?.storage) {
        const result = (await browser.storage.local.get(['authState'])) as { authState?: AuthState };
        return { readable: true, state: result.authState ?? null };
      }
    } catch (error: unknown) {
      console.error('[AuthManager] Failed to get auth state:', error);
    }
    return { readable: false, state: null };
  }

  /**
   * Retrieve a valid authentication state.
   *
   * If the access token is still fresh, returns it. If it is at/near expiry but
   * a refresh token is available, transparently refreshes first — the access
   * token is short-lived and CANNOT be extended by activity, so without this
   * refresh the user is force-logged-out at expiry.
   *
   * Returning null does NOT imply the session was cleared: a refresh that
   * failed transiently (network down, 5xx) reports failure while deliberately
   * keeping the stored session, so a later attempt can succeed.
   */
  async getAuthState(): Promise<AuthState | null> {
    const authState = await this.readState();
    if (!authState) {
      return null;
    }

    // Still comfortably valid → use as-is.
    if (Date.now() < authState.expires_at - EXPIRY_SKEW_MS) {
      return authState;
    }

    // Expired or about to: try a silent refresh.
    if (authState.refresh_token) {
      const refreshed = await this.refreshTokens();
      if (refreshed) {
        return this.readState();
      }
      // Refresh failed. State has been cleared only if the failure was a
      // rejection of the credential we hold; a transient failure leaves the
      // session in place for the next attempt.
      return null;
    }

    // No refresh token (legacy session): nothing we can do — log out.
    await this.clearAuthStateAndEndIdpSession();
    return null;
  }

  /**
   * Exchange the stored refresh token for a new access + refresh token pair.
   *
   * Concurrent callers share a single in-flight request — within this tab via
   * `refreshInFlight`, and across tabs via the Web Locks mutex. Returns the new
   * access token on success, or null if refresh is not possible; auth state is
   * cleared only when the server rejected the token this session actually
   * holds (see doRefresh).
   */
  async refreshTokens(rejectedAccessToken?: string): Promise<string | null> {
    const inFlight = this.refreshInFlight;
    if (inFlight) {
      const shared = await inFlight;
      // Sharing is only sound if the answer is usable BY THIS CALLER. A refresh
      // started for someone else can legitimately resolve to a token that this
      // caller has just been told the server refuses — then handing it over
      // reopens the very no-op retry the rejected-token argument exists to
      // prevent, with zero /auth/refresh calls made. Fall through and get our
      // own rotation instead.
      if (!rejectedAccessToken || shared !== rejectedAccessToken) {
        return shared;
      }
    }

    // Deliberately not re-joining another in-flight refresh here: we only reach
    // this line because a shared result was already unusable for us, and a
    // second join could hand back the same token again.
    if (!this.refreshInFlight) {
      this.refreshInFlight = this.refreshUnderCrossTabLock(rejectedAccessToken).finally(() => {
        this.refreshInFlight = null;
      });
      return this.refreshInFlight;
    }
    return this.refreshUnderCrossTabLock(rejectedAccessToken);
  }

  /**
   * Serialize rotation across tabs, then re-check whether it is still needed.
   *
   * Rotation revokes the token it consumes, so two tabs refreshing the same
   * stored token means the loser presents an already-revoked credential (#48).
   * Holding a named lock makes the tabs take turns; re-reading storage inside
   * the lock means the tab that waited discovers the winner's freshly-stored
   * token and returns it instead of spending a second rotation on it. That is
   * what reduces N tabs to exactly one /auth/refresh call.
   *
   * Storage is the whole channel here — the adapter is localStorage-backed and
   * therefore already shared between tabs — so no BroadcastChannel or storage
   * event is needed to hand the new token over.
   */
  private async refreshUnderCrossTabLock(rejectedAccessToken?: string): Promise<string | null> {
    const locks = getLockManager();
    if (!locks) {
      return this.refreshIfStillStale(rejectedAccessToken);
    }
    return locks.request(REFRESH_LOCK_NAME, () => this.refreshIfStillStale(rejectedAccessToken));
  }

  /**
   * Skip the network only when storage already holds a token that is BOTH
   * usable and not the one the caller just had rejected.
   *
   * `rejectedAccessToken` is what makes this safe for the reactive path. A 401
   * on an API call means the server refused a token that has not expired yet —
   * revocation, a logout-all watermark, a deactivated account, clock skew.
   * Judging staleness by expiry alone would look at that same token, call it
   * fresh, and hand it straight back, so the retry would re-send the token the
   * server just refused and the tab would sit there erroring but nominally
   * signed in. Being told a specific token is dead is exactly the evidence the
   * expiry clock does not have.
   */
  private async refreshIfStillStale(rejectedAccessToken?: string): Promise<string | null> {
    const current = await this.readState();
    if (
      current?.access_token &&
      current.access_token !== rejectedAccessToken &&
      Date.now() < current.expires_at - EXPIRY_SKEW_MS
    ) {
      // Another tab rotated while we queued for the lock — adopt its token.
      return current.access_token;
    }
    return this.doRefresh();
  }

  private async doRefresh(): Promise<string | null> {
    const authState = await this.readState();
    if (!authState?.refresh_token) {
      // Not a dead session: another tab signed a different account in, and its
      // event has not reached this tab yet. End this tab the way that event
      // will — as a sign-out decided elsewhere, which records no return path —
      // rather than as a session that died, which would record this account's
      // URL for whoever signs in next, and leave the event nothing to act on.
      if (
        !authState &&
        this.identity.kind === 'signedIn' &&
        this.belongsToAnotherUser(await this.readStoredState())
      ) {
        this.signOutFromAnotherTab();
        return null;
      }
      await this.clearAuthStateAndEndIdpSession();
      return null;
    }

    // Remember exactly which credential we put on the wire. Every decision to
    // clear the session below is made against THIS value, never against
    // whatever storage happens to hold when the response lands.
    const presented = authState.refresh_token;

    try {
      const response = await fetch(`${config.apiUrl}/api/v1/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refresh_token: presented }),
        signal: refreshAbortSignal(),
      });

      if (!response.ok) {
        if (!isCredentialRejection(response.status)) {
          // The auth service failed to answer, so we learned nothing about the
          // token. Report this attempt as failed but keep the session: a 502
          // during a deploy must not log everyone out.
          console.error('[AuthManager] Token refresh failed with status', response.status);
          return null;
        }
        return this.onCredentialRejected(presented, authState);
      }

      // Bound to the contract by NAME, but PARTIAL — and both halves matter.
      //
      // Binding the names is what makes a rename upstream a build error here
      // instead of a runtime `undefined` (#165). Keeping it partial is what
      // preserves the guard below: this parser deliberately handles a body
      // from a server of unknown version, and `openapi-typescript` renders the
      // schema's fields as REQUIRED, so asserting that shape would tell the
      // compiler the very thing the next four lines exist to check.
      const body = (await response.json()) as Partial<
        components['schemas']['TokenRefreshResponse']
      >;

      const expiresAt = deriveExpiresAt(body.expires_in);
      if (!body.access_token || expiresAt === null) {
        // Malformed refresh response — storing it would mint a NaN/instantly-
        // stale token and re-enter refresh on the next request forever. Treat
        // as unrecoverable and route back to login instead of looping. Routed
        // through the supersession check for the same reason a 401 is: if a
        // rotation already landed, this reply is about a spent token.
        return this.onCredentialRejected(presented, authState);
      }

      // Carry the refreshed token's roles onto the stored user. Without this
      // the UI keeps gating on whatever the roles were at login; see
      // readRolesFromAccessToken. Falls back to the existing roles when the
      // claim is absent or unparseable, so a malformed token cannot silently
      // strip a user's UI.
      const refreshedRoles = readRolesFromAccessToken(body.access_token);
      const next: AuthState = {
        ...authState,
        user: refreshedRoles
          ? { ...authState.user, roles: refreshedRoles }
          : authState.user,
        access_token: body.access_token,
        // ‼ FALL BACK, never overwrite with nothing. `refresh_token` is
        // optional on the wire, and a 200 that omits it must mean "keep using
        // the one you have" — not "you no longer have one". Writing
        // `body.refresh_token` straight through destroyed the session's only
        // renewal credential, and did it SILENTLY: the current access token
        // keeps working until it expires, and the failure lands on the NEXT
        // refresh, which finds no token, calls
        // `clearAuthStateAndEndIdpSession()` and signs the user out mid-session
        // with nothing logged. The hand-written type this replaced declared
        // `refresh_token: string` — asserting a presence the server never
        // promised, which is what hid the gap.
        refresh_token: body.refresh_token ?? authState.refresh_token,
        expires_at: expiresAt,
      };
      // Only onto the session this refresh was FOR. The request was a network
      // round trip long, and in that time another tab may have signed a
      // different account in or signed this one out — or this tab itself may
      // have signed someone else in, which moves the tab's identity along with
      // the row, so "is it this tab's?" alone would pass. Writing then would
      // put this session back over theirs: signing B out from a tab B never
      // opened, or resurrecting a sign-out. The rotated token is orphaned
      // server-side, which is the lesser cost. Read-then-write here is one turn
      // of the event loop: the adapter is synchronous `localStorage` underneath,
      // and another tab's write reaches this one as a task, not between two
      // microtasks.
      const stored = await this.readStoredState();
      if (!this.isThisTabs(stored) || stored.user?.user_id !== authState.user?.user_id) {
        return null;
      }
      if (stored.refresh_token !== presented) {
        // The same account's session moved on while ours was in flight — a
        // rotation elsewhere, or a fresh sign-in. Its token is the live one.
        return stored.access_token || null;
      }
      await this.writeState(next);
      return next.access_token;
    } catch (error: unknown) {
      // Network error — do NOT clear state (the session may still be valid once
      // connectivity returns); just report failure for this attempt.
      console.error('[AuthManager] Token refresh failed:', error);
      return null;
    }
  }

  /**
   * The server rejected `presented`. Decide whether that condemns the session.
   *
   * It only does so if `presented` is still the credential the session holds.
   * When storage now carries a DIFFERENT refresh token, another tab completed a
   * rotation while our request was in flight: the server was right to reject
   * ours — it was spent — but the session is alive and the winner already
   * stored the successor. Clearing here is what turned a routine rotation into
   * a logout for every open tab (#48).
   *
   * This is the guarantee that does not depend on Web Locks. The lock keeps the
   * losing request from being sent; this keeps a losing request that WAS sent
   * (no lock available, or a rotation by some client outside this tab's lock
   * scope) from destroying a live session.
   */
  private async onCredentialRejected(
    presented: string,
    sentWith: AuthState,
  ): Promise<string | null> {
    const current = await this.readStoredState();

    // Storage no longer holds the session we were refreshing for — a different
    // user signed in on another tab while our request was in flight. Do not
    // adopt their token (that would hand this tab someone else's credential)
    // and do not clear (that session is not ours to destroy). Just fail here;
    // the cross-tab watch ends this tab when that write's event arrives.
    if (isDifferentIdentity(current, sentWith)) {
      return null;
    }

    if (this.isThisTabs(current) && current.refresh_token && current.refresh_token !== presented) {
      // Superseded, not revoked. Hand back the winner's access token; a caller
      // that gets null here would route to login on a perfectly good session.
      return current.access_token || null;
    }

    await this.clearAuthStateAndEndIdpSession();
    return null;
  }

  /**
   * Sign this tab out: drop its session from storage and tell the listeners.
   *
   * ‼ Its OWN session. Storage is shared, so when another tab has since signed
   * a different account in, the row there is that account's, and removing it
   * signs them out too — the removal reaches their tab as a `storage` event
   * with no value. That is what a cross-tab account switch used to do: this
   * tab's watch saw B, ended this tab, and took B's session with it (#212).
   * The listeners are told either way, because THIS tab's session is over.
   */
  async clearAuthState(): Promise<void> {
    const browser = getBrowserStorage();
    if (browser?.storage && !this.belongsToAnotherUser(await this.readStoredState())) {
      await browser.storage.local.remove(['authState']);
    }
    // Also drop the bridge copy so a dashboard logout / definitive refresh
    // rejection can't leave a revoked token for the bridge to re-forward (#109).
    // The same rule: a copy that is another account's is theirs.
    try {
      if (
        typeof localStorage !== 'undefined' &&
        // The bridge copy is JSON of the same shape the adapter stores, so the
        // cross-tab decoder reads it — one reader, and a malformed copy reads
        // as no one's and is removed rather than kept.
        !this.belongsToAnotherUser(decodeCrossTabAuthState(localStorage.getItem('fm_auth_state')))
      ) {
        localStorage.removeItem('fm_auth_state');
      }
    } catch {
      // localStorage unavailable/blocked — non-fatal.
    }
    this.endThisTabsSession();
  }

  /**
   * Get current access token, refreshing transparently if needed.
   * Returns null if not authenticated or the session cannot be renewed.
   */
  async getAccessToken(): Promise<string | null> {
    const authState = await this.readState();
    if (!authState) {
      return null;
    }

    // Still fresh → use directly.
    if (Date.now() < authState.expires_at - EXPIRY_SKEW_MS) {
      return authState.access_token || null;
    }

    // Expired/near-expiry → renew if we can; refreshTokens returns the new
    // access token (or null after clearing state).
    if (authState.refresh_token) {
      return this.refreshTokens();
    }

    await this.clearAuthStateAndEndIdpSession();
    return null;
  }
}

/**
 * Singleton instance of AuthManager
 */
export const authManager = new AuthManager();
