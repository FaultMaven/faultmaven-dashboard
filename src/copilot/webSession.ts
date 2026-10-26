/**
 * The session half of the web host: who is signed in, and how the panel gets a
 * bearer for them.
 *
 * The Copilot UI never logs in, never stores a token and never refreshes one —
 * it asks, and the host, which owns the refresh lock, the storage key and the
 * rotation, answers. That is what makes "the built-in panel renders no sign-in"
 * structural rather than a branch someone maintains: `HostSession` is
 * non-nullable, so there is no value of the host type without a signed-in user
 * and no state in which the panel could decide to show one (ADR-016 D3).
 */
import type {
  AuthOutcome,
  CredentialUnavailableError,
  HostSession,
  HostUser,
  SessionSwitchedError,
} from '@faultmaven/copilot-ui';
import { authManager } from '../lib/auth/AuthManager';
import type { AccountProfile } from '../lib/auth/functions';

/**
 * The signed-in account as the panel needs it, from `/auth/me`.
 *
 * `/auth/me` rather than the stored `AuthState.user`: the stored copy is a
 * login-time snapshot whose roles can be stale, and the panel gates an admin
 * affordance on `roles`.
 *
 * No tenant is passed. `HostUser.organizationId` was deleted from the package
 * (copilot#253) because nothing in it ever read the field — and there is
 * nothing to replace it with: `/auth/me` publishes no enterprise at all, and
 * its nullable `organization` is a billing summary (ADR-017 D5), null for every
 * account nobody pays for. A field every host writes and nothing consumes is a
 * claim about the session that nothing checks.
 */
export function hostUserFromProfile(profile: AccountProfile): HostUser {
  return {
    id: profile.user_id,
    username: profile.username,
    displayName: profile.display_name,
    email: profile.email,
    roles: profile.roles ?? [],
  };
}

/**
 * The panel's session, plus what the TRANSPORT can tell it that the package's
 * `HostSession` call cannot: which bearer a 401 refused. Still a `HostSession`
 * — the parameter is optional — so the panel takes it as one.
 */
export type WebSession = Omit<HostSession, 'onUnauthorized'> & {
  onUnauthorized(rejectedBearer?: string): Promise<AuthOutcome>;
};

/**
 * The package's own error classes this host throws, handed in from the module
 * the mount loaded. The package entry is imported once, dynamically, by the
 * mount, and the request path tells each apart with `instanceof`, so a copy,
 * or a class of our own, would let the request through.
 */
export interface PackageErrors {
  SessionSwitched: typeof SessionSwitchedError;
  CredentialUnavailable: typeof CredentialUnavailableError;
}

/**
 * Build the session the panel runs against.
 *
 * `user` is passed in rather than fetched here so the caller owns the loading
 * state: the panel must not mount until there IS a user, and a session object
 * that resolved its identity asynchronously would have a window in which it
 * had none.
 */
export function createWebSession(
  user: HostUser,
  { SessionSwitched, CredentialUnavailable }: PackageErrors,
): WebSession {
  return {
    user,

    /**
     * A currently-valid access token FOR `user`, or a throw.
     *
     * The read names the user the panel was built for. When storage holds a
     * DIFFERENT account's session — another tab signed it in and this tab has
     * not ended yet, or this tab signed someone else in — it throws the
     * package's `SessionSwitchedError`: the request is not sent at all, and the
     * panel shows a notice that ends no one's session (copilot#350, #212). A
     * plain error there would send the request header-less instead, and a
     * `POST /cases` built for this user would be answered as a sign-in failure.
     *
     * Otherwise this is the same credential every other Dashboard request
     * carries, refreshed transparently near expiry. It THROWS rather than
     * returning null on purpose: a null would hand the shared UI a decision
     * about what an absent credential means, and that decision belongs to
     * whoever owns it.
     *
     * No token is not a verdict, so it is never the package's
     * `AuthenticationError`. What it is turns on whether this tab still holds
     * `user`'s session (faultmaven#1460):
     *   - held, or storage unreadable: the package's
     *     `CredentialUnavailableError`. A refresh that failed transiently (5xx,
     *     offline) keeps the session, so nothing is sent and the panel shows its
     *     connection error. Sent with no bearer, the request's 401 read as
     *     "Sign in first" inside a signed-in Dashboard. `isSigningOut()` is not
     *     asked: during this tab's own sign-out the session is still held, and
     *     nothing goes out without a bearer then either;
     *   - not held: a plain `Error`. The request goes out header-less, the
     *     not-signed-in path, and the session's end reaches the panel through
     *     `subscribeAuthState`, below.
     *
     * Two reads, not one: a session cleared or restored between them costs one
     * connection error, and the next attempt reads it right. The mint is never
     * sent without a bearer either way; the panel retries it on its backoff.
     */
    async accessToken() {
      const credential = await authManager.getAccessTokenFor(user.id);
      if (credential.kind === 'anotherUser') {
        throw new SessionSwitched();
      }
      if (credential.kind === 'none') {
        if ((await authManager.holdsSessionFor(user.id)) !== false) {
          throw new CredentialUnavailable('No usable FaultMaven credential right now; the session is kept.');
        }
        throw new Error('No FaultMaven session: the Dashboard holds no usable access token.');
      }
      return credential.token;
    },

    /**
     * The API refused the credential we handed out.
     *
     * This is the Dashboard's existing answer to a 401, not a new one: one
     * reactive refresh naming the token that was refused (`lib/knowledge/client.ts`
     * does the same at every request site). Naming it matters — the refresh path
     * otherwise judges staleness by the expiry clock, which still calls a
     * revoked token fresh and would hand the same dead credential straight back.
     *
     * What happens next is AuthManager's call, and deliberately so. A definitive
     * rejection clears the session, which fires `onAuthCleared`, which drops the
     * React auth state and routes the app to `/login`; a transient failure (5xx,
     * offline) keeps the session so a deploy blip does not sign everyone out.
     * Clearing unconditionally here would turn every 401 into a forced logout.
     *
     * The ANSWER matters as much as the action. The panel used to be told
     * nothing and assumed the worst: it threw `AuthenticationError` after this
     * callback whatever happened, so a host that had just successfully renewed
     * the credential still got a blocking "session expired" modal whose action
     * wiped the panel while the shell stayed signed in. Three answers, because
     * a refresh that renewed nothing is two different states (faultmaven#1460):
     *   - `'refreshed'`: renewed, or another tab rotated while this refresh
     *     failed, so storage holds a token for this user other than the one
     *     refused. The client retries. A renewal is answered before
     *     `isSigningOut()` is read, defensively: through AuthManager the flag
     *     and a held session coexist only in this tab's own sign-out, between
     *     `logoutAuth`'s `beginSignOut()` and its `clearAuthState()`, and a
     *     sign-out from another tab leaves this tab nothing to renew.
     *   - `'ended'`: a sign-out is under way, or AuthManager no longer holds
     *     this panel user's session (cleared, or another account's).
     *   - `'unavailable'`: a 5xx or offline renewal kept the session, or
     *     storage could not be read. The panel shows its connection error and
     *     stays signed in; answering `'ended'` there showed a sign-out inside
     *     a signed-in Dashboard.
     *
     * `rejectedBearer` is the token the refused request CARRIED, which the
     * transport passes (copilot#348). Storage may hold a newer one by the time
     * the 401 lands, and naming that one as rejected would spend a rotation on a
     * credential nobody refused. A caller with no bearer to name — the
     * package's own `HostSession` call — falls back to the stored token.
     */
    async onUnauthorized(rejectedBearer?: string): Promise<AuthOutcome> {
      const rejected = rejectedBearer || (await authManager.peekAccessToken());
      const renewed = await authManager.refreshTokens(rejected ?? undefined);
      if (renewed) return 'refreshed';
      if (authManager.isSigningOut()) return 'ended';
      const held = await authManager.holdsSessionFor(user.id);
      if (held === false) return 'ended';
      const stored = held && (await authManager.peekAccessToken());
      return stored && stored !== rejected ? 'refreshed' : 'unavailable';
    },

    /**
     * `null`: the Dashboard's own account menu owns sign-out.
     *
     * Not a no-op — `null` removes the affordance, so the panel renders no
     * second sign-out that would clear half the state and leave the page
     * believing it still had a session.
     */
    signOut: null,

    /**
     * The session ended — wherever that was decided.
     *
     * ONE subscription, deliberately. `onAuthCleared` fires for every way a
     * session ends: the account menu's sign-out, AuthManager wiping a
     * definitively-rejected credential from inside the request path, and — since
     * the cross-tab decision moved into AuthManager — another tab signing out or
     * signing a different account in. Subscribing to the storage event as well,
     * as this did, delivered a cross-tab sign-out to the panel twice while still
     * missing an account switch entirely, because both listeners only acted on
     * `null`.
     *
     * Only a signed-OUT transition is reported. A different account signing in
     * is not something this panel adopts in place: the Dashboard routes identity
     * through `AuthProvider`, which remounts the panel with a fresh session for
     * whoever signed in.
     */
    subscribeAuthState(onChange) {
      return authManager.onAuthCleared(() => onChange(null));
    },
  };
}
