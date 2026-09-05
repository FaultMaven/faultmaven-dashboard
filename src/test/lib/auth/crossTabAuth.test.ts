import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../../../config', () => ({ default: { apiUrl: 'http://test-api.local' } }));

import { AuthManager } from '../../../lib/auth/AuthManager';
import { AUTH_STATE_STORAGE_KEY, decodeCrossTabAuthState } from '../../../lib/auth/crossTab';
import { TEST_AUTH_STATE, OTHER_AUTH_STATE } from '../../support/authFixtures';
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
    removeEventListener: (type: string, fn: (e: StorageEvent) => void) => {
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
    await vi.waitFor(() => expect(manager.isCrossTabSignOut()).toBe(true));

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

    expect(manager.isCrossTabSignOut()).toBe(true);
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
    expect(manager.isCrossTabSignOut()).toBe(false);
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
