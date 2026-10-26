import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../../../config', () => ({ default: { apiUrl: 'http://test-api.local' } }));

import { AuthManager, authManager } from '../../../lib/auth/AuthManager';
import { AUTH_STATE_STORAGE_KEY, decodeCrossTabAuthState } from '../../../lib/auth/crossTab';
import { createWebSession, hostUserFromProfile } from '../../../copilot/webSession';
import { TEST_AUTH_STATE, OTHER_AUTH_STATE, TEST_PROFILE } from '../../support/authFixtures';
import { CredentialUnavailableError, SessionSwitchedError } from '@faultmaven/copilot-ui';
import type { AuthState } from '../../../lib/auth/types';

/**
 * One cross-tab mechanism, inside AuthManager.
 *
 * Before this there were two independent subscribers — the shell's and the
 * panel's — and each acted only on `null`. Two consequences, both real:
 *
 *  - a cross-tab sign-out was delivered to the panel TWICE (directly, and again
 *    through `onAuthCleared`);
 *  - a cross-tab ACCOUNT SWITCH was delivered to neither, leaving a tab showing
 *    user A's identity while `accessToken()` handed out user B's bearer. That
 *    is the dangerous half: the page looks right and acts as someone else.
 *
 * AuthManager owns the credential and is the only thing that knows which
 * identity THIS tab holds, so the decision belongs here and the result leaves
 * on one channel.
 */

const store: Record<string, unknown> = {};
const local: Record<string, string> = {};
const session: Record<string, string> = {};

function installGlobals() {
  const listeners: Array<(e: StorageEvent) => void> = [];
  (globalThis as Record<string, unknown>).window = {
    browser: {
      storage: {
        local: {
          get: async (keys: string[]) => {
            const out: Record<string, unknown> = {};
            for (const k of keys) if (k in store) out[k] = store[k];
            return out;
          },
          set: async (items: Record<string, unknown>) => { Object.assign(store, items); },
          remove: async (keys: string[]) => { for (const k of keys) delete store[k]; },
        },
      },
    },
    addEventListener: (type: string, fn: (e: StorageEvent) => void) => {
      if (type === 'storage') listeners.push(fn);
    },
    removeEventListener: (_type: string, fn: (e: StorageEvent) => void) => {
      const i = listeners.indexOf(fn);
      if (i >= 0) listeners.splice(i, 1);
    },
  };
  (globalThis as Record<string, unknown>).localStorage = {
    getItem: (k: string) => (k in local ? local[k] : null),
    setItem: (k: string, v: string) => { local[k] = v; },
    removeItem: (k: string) => { delete local[k]; },
  };
  (globalThis as Record<string, unknown>).sessionStorage = {
    getItem: (k: string) => (k in session ? session[k] : null),
    setItem: (k: string, v: string) => { session[k] = v; },
    removeItem: (k: string) => { delete session[k]; },
  };
  return {
    /** What ANOTHER tab writing the shared key looks like to this one. */
    fireStorage(newValue: string | null, key: string = AUTH_STATE_STORAGE_KEY) {
      for (const fn of [...listeners]) fn({ key, newValue } as StorageEvent);
    },
  };
}

let harness: ReturnType<typeof installGlobals>;

/** The package's own error classes, as the mount hands them to the host session. */
const PACKAGE_ERRORS = { SessionSwitched: SessionSwitchedError, CredentialUnavailable: CredentialUnavailableError };

beforeEach(() => {
  for (const k of Object.keys(store)) delete store[k];
  for (const k of Object.keys(local)) delete local[k];
  for (const k of Object.keys(session)) delete session[k];
  harness = installGlobals();
});

afterEach(() => { vi.restoreAllMocks(); });

/** A manager that already believes it is signed in as the fixture user. */
async function signedInManager(state: AuthState = TEST_AUTH_STATE) {
  const manager = new AuthManager();
  await manager.saveAuthState(state);
  return manager;
}

describe('decodeCrossTabAuthState', () => {
  it('decodes through the adapter that wrote the row', () => {
    expect(decodeCrossTabAuthState(JSON.stringify(TEST_AUTH_STATE))?.user.user_id).toBe('u1');
  });

  it('reads an absent, unparseable or user-less row as signed out', () => {
    // A row with no user is not a session anyone can act as; handing back a
    // half-built identity would let the comparison below pass on nonsense.
    expect(decodeCrossTabAuthState(null)).toBeNull();
    expect(decodeCrossTabAuthState('{not json')).toBeNull();
    expect(decodeCrossTabAuthState(JSON.stringify({ access_token: 'x' }))).toBeNull();
  });
});

describe('a cross-tab sign-out', () => {
  it('ends this tab through its own sign-out path', async () => {
    const manager = await signedInManager();
    const cleared = vi.fn();
    manager.onAuthCleared(cleared);
    manager.watchCrossTabAuthChanges();

    harness.fireStorage(null);
    await vi.waitFor(() => expect(cleared).toHaveBeenCalledTimes(1));

    expect(await manager.peekAccessToken()).toBeNull();
  });

  it('is reported ONCE, not once per subscriber', async () => {
    const manager = await signedInManager();
    const cleared = vi.fn();
    manager.onAuthCleared(cleared);
    manager.watchCrossTabAuthChanges();

    harness.fireStorage(null);
    await vi.waitFor(() => expect(cleared).toHaveBeenCalled());

    expect(cleared).toHaveBeenCalledTimes(1);
  });

  it('records NO return path, and drops one already recorded', async () => {
    // The URL in the bar belongs to the account that just went away. Recording
    // it would deep-link whoever signs in next straight into the previous
    // person's case.
    const manager = await signedInManager();
    sessionStorage.setItem('oauth_redirect_after_login', '/cases/case-of-user-a');
    manager.watchCrossTabAuthChanges();

    harness.fireStorage(null);
    await vi.waitFor(() => expect(manager.isSigningOut()).toBe(true));

    expect(sessionStorage.getItem('oauth_redirect_after_login')).toBeNull();
  });
});

describe('a cross-tab ACCOUNT SWITCH', () => {
  it('ends this tab — it must not keep showing the previous identity', async () => {
    // The defect this exists for: without it the page still renders user A
    // while `accessToken()` reads user B's bearer out of shared storage.
    const manager = await signedInManager();
    const cleared = vi.fn();
    manager.onAuthCleared(cleared);
    manager.watchCrossTabAuthChanges();

    harness.fireStorage(JSON.stringify(OTHER_AUTH_STATE));
    await vi.waitFor(() => expect(cleared).toHaveBeenCalledTimes(1));

    expect(manager.isSigningOut()).toBe(true);
  });
});

describe('a cross-tab ROTATION', () => {
  it('is ignored — the same account refreshing is not a sign-out', async () => {
    // Another tab rotates roughly every half hour. Treating that as an identity
    // change would sign everybody out on a timer.
    const manager = await signedInManager();
    const cleared = vi.fn();
    manager.onAuthCleared(cleared);
    manager.watchCrossTabAuthChanges();

    harness.fireStorage(JSON.stringify({ ...TEST_AUTH_STATE, access_token: 'tok-rotated' }));
    await new Promise((r) => setTimeout(r, 10));

    expect(cleared).not.toHaveBeenCalled();
    expect(manager.isSigningOut()).toBe(false);
  });

  it('ignores a write to an unrelated key', async () => {
    const manager = await signedInManager();
    const cleared = vi.fn();
    manager.onAuthCleared(cleared);
    manager.watchCrossTabAuthChanges();

    harness.fireStorage('anything', 'faultmaven_somethingElse');
    await new Promise((r) => setTimeout(r, 10));

    expect(cleared).not.toHaveBeenCalled();
  });
});

/**
 * Another tab signs a DIFFERENT account in, as a browser delivers it: the
 * shared row changes first, and this tab's `storage` event arrives later. In
 * Chromium a tab could read the new row before its own event fired in 20 of 20
 * runs (#212). Returns the event, for the test to deliver when it chooses.
 */
function anotherTabSignsIn(state: AuthState): () => void {
  store.authState = state;
  return () => harness.fireStorage(JSON.stringify(state));
}

describe('an account switch in another tab, before this tab hears it (#212)', () => {
  it('hands out no credential in that window — not the other account’s', async () => {
    const manager = await signedInManager();
    anotherTabSignsIn(OTHER_AUTH_STATE);

    expect(await manager.getAccessToken()).toBeNull();
    expect(await manager.getAuthState()).toBeNull();
  });

  it('does not adopt the other account, so the watch still ends this tab', async () => {
    // The read used to make this tab user B; the event then compared B with B
    // and the tab went on showing A while sending B's bearer.
    const manager = await signedInManager();
    const cleared = vi.fn();
    manager.onAuthCleared(cleared);
    manager.watchCrossTabAuthChanges();

    const deliver = anotherTabSignsIn(OTHER_AUTH_STATE);
    await manager.getAccessToken();
    deliver();

    await vi.waitFor(() => expect(cleared).toHaveBeenCalledTimes(1));
  });

  it('ends a RESTORED tab too — its first read is what told it who it is', async () => {
    // A tab loaded with a session never signs in; reading is how it learns its
    // user. The watch must still have someone to compare against.
    store.authState = TEST_AUTH_STATE;
    const manager = new AuthManager();
    expect(await manager.getAuthState()).toEqual(TEST_AUTH_STATE);
    const cleared = vi.fn();
    manager.onAuthCleared(cleared);
    manager.watchCrossTabAuthChanges();

    anotherTabSignsIn(OTHER_AUTH_STATE)();

    await vi.waitFor(() => expect(cleared).toHaveBeenCalledTimes(1));
  });

  it("ends this tab WITHOUT signing the other account out", async () => {
    // Removing the shared row reaches B's tab as a storage event with no value,
    // and B's tab signs out. B signed in; nobody asked to end B's session.
    const manager = await signedInManager();
    local.fm_auth_state = JSON.stringify(OTHER_AUTH_STATE);
    const cleared = vi.fn();
    manager.onAuthCleared(cleared);
    manager.watchCrossTabAuthChanges();

    anotherTabSignsIn(OTHER_AUTH_STATE)();
    await vi.waitFor(() => expect(cleared).toHaveBeenCalledTimes(1));

    expect(store.authState).toEqual(OTHER_AUTH_STATE);
    expect(local.fm_auth_state).toBe(JSON.stringify(OTHER_AUTH_STATE));
  });

  it('a sign-out here in that window neither reads nor removes the other account', async () => {
    // `logoutAuth` peeks the bearer to revoke "this" account's sessions
    // server-side; B's token there would sign B out everywhere.
    const manager = await signedInManager();
    anotherTabSignsIn(OTHER_AUTH_STATE);

    expect(await manager.peekAccessToken()).toBeNull();
    expect(await manager.peekSessionId()).toBeNull();
    expect(await manager.peekIdpLogoutUrl()).toBeNull();
    await manager.clearAuthState();

    expect(store.authState).toEqual(OTHER_AUTH_STATE);
  });

  it('the Copilot panel built for this tab’s user refuses to send — the package’s notice, no bearer', async () => {
    // The end-to-end shape of #212: the panel's `POST /cases` would otherwise
    // carry B's bearer and create A's first message as a case in B's account.
    // The package's own class, so `getAuthHeaders` does not send it at all.
    await authManager.saveAuthState(TEST_AUTH_STATE);
    const session = createWebSession(hostUserFromProfile(TEST_PROFILE), PACKAGE_ERRORS);
    anotherTabSignsIn(OTHER_AUTH_STATE);

    await expect(session.accessToken()).rejects.toBeInstanceOf(SessionSwitchedError);
  });

  it('a credential read for a NAMED user tells another account from no session', async () => {
    const manager = await signedInManager();
    expect(await manager.getAccessTokenFor('u1')).toEqual({ kind: 'token', token: 'tok-live' });

    anotherTabSignsIn(OTHER_AUTH_STATE);
    expect(await manager.getAccessTokenFor('u1')).toEqual({ kind: 'anotherUser' });

    delete store.authState;
    expect(await manager.getAccessTokenFor('u1')).toEqual({ kind: 'none' });
  });

  it('a panel built for A is refused after THIS tab signs B in', async () => {
    // The tab's identity moves with a sign-in here, so "is it this tab's?" is
    // not the panel's question — "is it the user I was built for?" is.
    const manager = await signedInManager();
    await manager.saveAuthState(OTHER_AUTH_STATE);

    expect(await manager.getAccessTokenFor('u1')).toEqual({ kind: 'anotherUser' });
  });

  it('a refresh in that window ends this tab as a sign-out FROM ANOTHER TAB', async () => {
    // Not as a session that died: that path records the URL in the bar for
    // whoever signs in next, and leaves the switch's own event nothing to do —
    // so the deliberate-sign-out handling would never run.
    const manager = await signedInManager();
    sessionStorage.setItem('oauth_redirect_after_login', '/cases/case-of-user-a');
    const cleared = vi.fn();
    manager.onAuthCleared(cleared);
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    anotherTabSignsIn(OTHER_AUTH_STATE);

    expect(await manager.refreshTokens('tok-live')).toBeNull();

    expect(cleared).toHaveBeenCalledTimes(1);
    expect(manager.isSigningOut()).toBe(true);
    expect(sessionStorage.getItem('oauth_redirect_after_login')).toBeNull();
    expect(store.authState).toEqual(OTHER_AUTH_STATE);
    // And B's refresh token was never spent from this tab.
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('ends a tab restored from a row that names NO user, too', async () => {
    // Such a tab holds a session with no user id. "No id" is not "signed out":
    // the watch must still treat a named account as somebody else.
    const legacy = { ...TEST_AUTH_STATE, user: { ...TEST_AUTH_STATE.user, user_id: undefined } };
    store.authState = legacy;
    const manager = new AuthManager();
    expect(await manager.getAuthState()).toEqual(legacy);
    const cleared = vi.fn();
    manager.onAuthCleared(cleared);
    manager.watchCrossTabAuthChanges();

    anotherTabSignsIn(OTHER_AUTH_STATE)();

    await vi.waitFor(() => expect(cleared).toHaveBeenCalledTimes(1));
    expect(store.authState).toEqual(OTHER_AUTH_STATE);
  });

  it('a sign-in IN THIS TAB still changes who the tab is', async () => {
    // The one way a tab takes on a new identity after its first read.
    const manager = await signedInManager();
    await manager.clearAuthState();
    await manager.saveAuthState(OTHER_AUTH_STATE);

    expect(await manager.getAccessToken()).toBe('tok-other');
  });
});

describe('a first read that fails', () => {
  it('settles nothing — the next read still restores the tab’s own session', async () => {
    // Pinning "signed out" on one storage hiccup would refuse this tab its own
    // session until a reload.
    store.authState = TEST_AUTH_STATE;
    const local = (window as unknown as { browser: { storage: { local: { get: (k: string[]) => Promise<unknown> } } } })
      .browser.storage.local;
    const realGet = local.get;
    local.get = vi.fn().mockRejectedValueOnce(new Error('storage hiccup')).mockImplementation(realGet);
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const manager = new AuthManager();

    expect(await manager.getAuthState()).toBeNull();
    expect(await manager.getAuthState()).toEqual(TEST_AUTH_STATE);
  });
});

describe('a sign-out', () => {
  it('removes a malformed bridge copy rather than keeping it as someone else’s', async () => {
    const manager = await signedInManager();
    local.fm_auth_state = JSON.stringify({ ...TEST_AUTH_STATE, user: { user_id: 42 } });

    await manager.clearAuthState();

    expect(local.fm_auth_state).toBeUndefined();
  });
});

describe('a tab that was never signed in', () => {
  it('is not signed out by another tab signing IN', async () => {
    // There is no session here to end, and no identity to compare against.
    const manager = new AuthManager();
    const cleared = vi.fn();
    manager.onAuthCleared(cleared);
    manager.watchCrossTabAuthChanges();

    harness.fireStorage(JSON.stringify(TEST_AUTH_STATE));
    await new Promise((r) => setTimeout(r, 10));

    expect(cleared).not.toHaveBeenCalled();
  });
});

describe('unsubscribing', () => {
  it('stops watching', async () => {
    const manager = await signedInManager();
    const cleared = vi.fn();
    manager.onAuthCleared(cleared);
    manager.watchCrossTabAuthChanges()();

    harness.fireStorage(null);
    await new Promise((r) => setTimeout(r, 10));

    expect(cleared).not.toHaveBeenCalled();
  });
});

describe('holdsSessionFor: what a refresh that renewed nothing left (faultmaven#1460)', () => {
  // `refreshTokens` returns null whether it cleared the session or kept it,
  // and the Copilot panel's verdict on a 401 turns on which. The real manager,
  // the real host session, and `fetch` answering the refresh.
  const panel = () => createWebSession(hostUserFromProfile(TEST_PROFILE), PACKAGE_ERRORS);

  beforeEach(async () => {
    await authManager.saveAuthState(TEST_AUTH_STATE);
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => vi.unstubAllGlobals());

  it.each([
    ['answers 5xx, keeping it', () => Promise.resolve(new Response(null, { status: 503 })), true],
    ['fails on the network, keeping it', () => Promise.reject(new TypeError('offline')), true],
    ['rejects the refresh token, clearing it', () => Promise.resolve(new Response(null, { status: 401 })), false],
  ])('a refresh that %s', async (_arm, refresh, held) => {
    vi.stubGlobal('fetch', vi.fn(refresh));

    await expect(panel().onUnauthorized('tok-live')).resolves.toBe(held ? 'unavailable' : 'ended');
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(await authManager.holdsSessionFor('u1')).toBe(held);
  });

  it('is false for another identity: asked about another user, or another account signed in', async () => {
    vi.stubGlobal('fetch', vi.fn());
    expect(await authManager.holdsSessionFor('u2')).toBe(false);

    anotherTabSignsIn(OTHER_AUTH_STATE);
    await expect(panel().onUnauthorized('tok-live')).resolves.toBe('ended');
    expect(await authManager.holdsSessionFor('u1')).toBe(false);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('is per tab: false here after a sign-out from another tab, though that tab signs the same user in again', async () => {
    // Storage holds `u1` signed in, but not this tab's session: this tab ended
    // and has not signed in since. A read of the raw row would answer true.
    const manager = await signedInManager();
    manager.watchCrossTabAuthChanges();
    harness.fireStorage(null);
    await vi.waitFor(() => expect(manager.isSigningOut()).toBe(true));

    anotherTabSignsIn(TEST_AUTH_STATE)();

    expect(await manager.holdsSessionFor('u1')).toBe(false);
  });

  it('never matches an unknown user: a row naming no one is not held for a profile with no id', async () => {
    // This tab holds the legacy row; `undefined === undefined` must not make it
    // the session of a profile that carried no `user_id`.
    store.authState = { ...TEST_AUTH_STATE, user: { ...TEST_AUTH_STATE.user, user_id: undefined } };
    const manager = new AuthManager();
    expect(await manager.getAuthState()).not.toBeNull();

    expect(await manager.holdsSessionFor(undefined as unknown as string)).toBe(false);
  });

  it('renews nothing itself, even for an expired token', async () => {
    await authManager.saveAuthState({ ...TEST_AUTH_STATE, expires_at: Date.now() - 1_000 });
    vi.stubGlobal('fetch', vi.fn());

    expect(await authManager.holdsSessionFor('u1')).toBe(true);
    expect(fetch).not.toHaveBeenCalled();
  });
});
