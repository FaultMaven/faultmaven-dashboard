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
import type { HostSession, HostUser } from '@faultmaven/copilot-ui';
import { authManager } from '../lib/auth/AuthManager';
import { subscribeCrossTabAuthState } from '../lib/auth/crossTab';
import type { AccountProfile } from '../lib/auth/functions';

/**
 * The signed-in account as the panel needs it, from `/auth/me`.
 *
 * `/auth/me` rather than the stored `AuthState.user`: the stored copy is a
 * login-time snapshot whose roles can be stale and which carries no
 * organization at all on some vintages, and the panel gates an admin
 * affordance on `roles`.
 */
export function hostUserFromProfile(profile: AccountProfile): HostUser {
  return {
    id: profile.user_id,
    username: profile.username,
    displayName: profile.display_name,
    email: profile.email,
    roles: profile.roles ?? [],
    organizationId: profile.organization?.organization_id,
  };
}

/**
 * Build the session the panel runs against.
 *
 * `user` is passed in rather than fetched here so the caller owns the loading
 * state: the panel must not mount until there IS a user, and a session object
 * that resolved its identity asynchronously would have a window in which it
 * had none.
 */
export function createWebSession(user: HostUser): HostSession {
  return {
    user,

    /**
     * A currently-valid access token, or a throw.
     *
     * `getAccessToken` refreshes transparently when the stored token is at or
     * near expiry, so this is the same credential every other Dashboard request
     * carries. It THROWS rather than returning null on purpose: a null would
     * hand the shared UI a decision about what an absent credential means, and
     * that decision belongs to whoever owns it. A caller that cannot get a
     * token is looking at a session that has ended — `onUnauthorized`'s
     * business, not a value to branch on at a request site.
     */
    async accessToken() {
      const token = await authManager.getAccessToken();
      if (!token) {
        throw new Error('No FaultMaven session: the Dashboard holds no usable access token.');
      }
      return token;
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
     */
    async onUnauthorized() {
      const rejected = await authManager.peekAccessToken();
      await authManager.refreshTokens(rejected ?? undefined);
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
     * The signed-in identity changed somewhere else.
     *
     * Both halves of "somewhere else" are real on a web page and neither alone
     * is enough:
     *
     *  - `onAuthCleared` is THIS tab — the account menu's sign-out, or
     *    AuthManager wiping a definitively-rejected session from inside the
     *    request path. The `storage` event is deliberately not delivered to the
     *    tab that wrote it, so without this the panel would miss its own
     *    sign-out.
     *  - `subscribeCrossTabAuthState` is ANOTHER tab: the page is still open and
     *    its credential is gone. That is the case the contract calls out for a
     *    web host.
     *
     * Only a signed-OUT transition is reported. A different account signing in
     * elsewhere is a change this panel must not silently adopt: the Dashboard
     * routes identity through `AuthProvider`, which remounts the panel with a
     * fresh session for the new user, and reporting the new identity from here
     * would race that with a half-swapped store.
     */
    subscribeAuthState(onChange) {
      const stopLocal = authManager.onAuthCleared(() => onChange(null));
      const stopCrossTab = subscribeCrossTabAuthState((state) => {
        if (state === null) onChange(null);
      });
      return () => {
        stopLocal();
        stopCrossTab();
      };
    },
  };
}
