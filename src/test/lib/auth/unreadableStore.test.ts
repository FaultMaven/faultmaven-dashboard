import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../../../config', () => ({ default: { apiUrl: 'http://test-api.local' } }));

// The app's `window.browser.storage`, over `localStorage`, as `main.tsx` installs it.
import '../../../lib/storage';
import { AuthManager } from '../../../lib/auth/AuthManager';
import { OTHER_AUTH_STATE, TEST_AUTH_STATE } from '../../support/authFixtures';
import type { AuthState } from '../../../lib/auth/types';

/**
 * A storage read that fails decides nothing about the session (faultmaven#2346).
 *
 * Driven through the REAL storage shim: it is the shim that used to report a
 * throwing `getItem` as "nothing stored", which AuthManager then turned into a
 * sign-out. A test that mocks `browser.storage.local.get` would never see that.
 */

const ROW = 'faultmaven_authState';
const EXPIRED: AuthState = {
  ...TEST_AUTH_STATE,
  expires_at: Date.now() - 1000,
  idp_logout_url: 'https://idp.example.com/logout',
};

const data = new Map<string, string>();
/** Which `getItem` calls throw, counted from 1 since the last `failReads`. */
let fails: (n: number) => boolean = () => false;
let reads = 0;
const failReads = (which: (n: number) => boolean) => {
  reads = 0;
  fails = which;
};

// The WHOLE object is stubbed: happy-dom ignores writes to `localStorage.getItem`.
const local = {
  getItem: vi.fn((key: string) => {
    reads += 1;
    if (fails(reads)) throw new DOMException('The operation is insecure.', 'SecurityError');
    return data.get(key) ?? null;
  }),
  setItem: vi.fn((key: string, value: string) => void data.set(key, value)),
  removeItem: vi.fn((key: string) => void data.delete(key)),
  clear: () => data.clear(),
  key: () => null,
  get length() {
    return data.size;
  },
};

const stored = (): unknown => JSON.parse(data.get(ROW) ?? 'null');

let fetchSpy: ReturnType<typeof vi.fn>;
let assignSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  data.clear();
  failReads(() => false);
  vi.stubGlobal('localStorage', local);
  fetchSpy = vi.fn();
  vi.stubGlobal('fetch', fetchSpy);
  assignSpy = vi.spyOn(window.location, 'assign').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  local.getItem.mockClear();
  local.setItem.mockClear();
  local.removeItem.mockClear();
});

async function signedIn(state: AuthState = EXPIRED) {
  const manager = new AuthManager();
  await manager.saveAuthState(state);
  const cleared = vi.fn();
  manager.onAuthCleared(cleared);
  local.removeItem.mockClear();
  return { manager, cleared };
}

function rotates() {
  fetchSpy.mockResolvedValueOnce({
    ok: true,
    json: async () => ({ access_token: 'new-access', refresh_token: 'new-refresh', expires_in: 3600 }),
  });
}

describe('a renewal whose storage read fails', () => {
  it.each([
    ['refreshTokens()', 0, (m: AuthManager) => m.refreshTokens()],
    ['getAccessToken() on an expired token, its first read succeeding', 1, (m: AuthManager) => m.getAccessToken()],
  ])('%s keeps the session: no clear, no remove, no navigation, no refresh sent', async (_name, okReads, renew) => {
    const { manager, cleared } = await signedIn();
    failReads((n) => n > okReads);

    expect(await renew(manager)).toBeNull();

    expect(local.removeItem).not.toHaveBeenCalled();
    expect(cleared).not.toHaveBeenCalled();
    expect(assignSpy).not.toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled();

    // Storage reads again: the session is still there, and renews.
    failReads(() => false);
    expect(stored()).toEqual(EXPIRED);
    rotates();
    expect(await manager.refreshTokens()).toBe('new-access');
  });

  it('keeps the session when only the other-account read fails', async () => {
    // Another account's row sits in storage; this tab cannot tell whose it is
    // on the third read, so it must neither clear nor remove it (#212).
    const { manager, cleared } = await signedIn();
    data.set(ROW, JSON.stringify(OTHER_AUTH_STATE));
    failReads((n) => n > 2);

    expect(await manager.refreshTokens()).toBeNull();

    // The stale check, doRefresh's own-row read, then the other-account read.
    expect(reads).toBe(3);
    expect(stored()).toEqual(OTHER_AUTH_STATE);
    expect(local.removeItem).not.toHaveBeenCalled();
    expect(cleared).not.toHaveBeenCalled();
    expect(manager.isSigningOut()).toBe(false);
  });

  it("keeps the session when only doRefresh's own-row read fails", async () => {
    const { manager, cleared } = await signedIn();
    failReads((n) => n === 2);

    expect(await manager.refreshTokens()).toBeNull();

    expect(stored()).toEqual(EXPIRED);
    expect(local.removeItem).not.toHaveBeenCalled();
    expect(cleared).not.toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('a rejected credential ends the IdP session even when every later read fails', async () => {
    // The URL comes from the row the refresh was sent with, not a re-read.
    const { manager, cleared } = await signedIn();
    fetchSpy.mockResolvedValueOnce({ ok: false, status: 401 });
    failReads((n) => n > 2);

    expect(await manager.refreshTokens()).toBeNull();

    expect(assignSpy).toHaveBeenCalledWith('https://idp.example.com/logout');
    expect(data.has(ROW)).toBe(false);
    expect(cleared).toHaveBeenCalledTimes(1);
  });
});

describe('a legacy row whose later reads fail', () => {
  it('still clears and ends the IdP session, from the row that decided the clear', async () => {
    const { manager, cleared } = await signedIn({ ...EXPIRED, refresh_token: undefined });
    failReads((n) => n > 2);

    expect(await manager.refreshTokens()).toBeNull();

    expect(data.has(ROW)).toBe(false);
    expect(cleared).toHaveBeenCalledTimes(1);
    expect(assignSpy).toHaveBeenCalledWith('https://idp.example.com/logout');
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe('getAccessTokenFor on a failed read', () => {
  it('is no token, not another account', async () => {
    const { manager } = await signedIn(TEST_AUTH_STATE);
    failReads((n) => n === 1);

    expect(await manager.getAccessTokenFor('u1')).toEqual({ kind: 'none' });
  });
});

describe('clearAuthState on a failed read', () => {
  it('fails closed: removes the row and the bridge copy, and a later clear leaves nothing', async () => {
    const { manager, cleared } = await signedIn(TEST_AUTH_STATE);
    data.set('fm_auth_state', JSON.stringify(TEST_AUTH_STATE));
    failReads(() => true);

    await manager.clearAuthState();

    expect(data.has(ROW)).toBe(false);
    expect(data.has('fm_auth_state')).toBe(false);
    expect(cleared).toHaveBeenCalledTimes(1);

    failReads(() => false);
    await manager.clearAuthState();
    expect(data.size).toBe(0);
    expect(await new AuthManager().getAccessToken()).toBeNull();
  });
});

describe('a restored tab whose first read fails', () => {
  it('is not pinned signed out: a later readable read lets it renew', async () => {
    data.set(ROW, JSON.stringify(EXPIRED));
    const manager = new AuthManager();
    failReads(() => true);

    expect(await manager.getAccessToken()).toBeNull();

    failReads(() => false);
    rotates();
    expect(await manager.getAccessToken()).toBe('new-access');
  });
});

describe('what a readable store still decides', () => {
  it('an absent row, read successfully, still ends the session', async () => {
    const { manager, cleared } = await signedIn();
    data.delete(ROW);

    expect(await manager.refreshTokens()).toBeNull();

    expect(cleared).toHaveBeenCalledTimes(1);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('a legacy row with no refresh token still clears and ends the IdP session', async () => {
    const { manager, cleared } = await signedIn({ ...EXPIRED, refresh_token: undefined });

    expect(await manager.refreshTokens()).toBeNull();

    expect(data.has(ROW)).toBe(false);
    expect(cleared).toHaveBeenCalledTimes(1);
    expect(assignSpy).toHaveBeenCalledWith('https://idp.example.com/logout');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("another account's readable row ends this tab as a sign-out from another tab, removing nothing", async () => {
    const { manager, cleared } = await signedIn();
    data.set(ROW, JSON.stringify(OTHER_AUTH_STATE));
    failReads(() => false);

    expect(await manager.refreshTokens()).toBeNull();

    // The same three reads the failing case counts; the third is the one that decides.
    expect(reads).toBe(3);
    expect(cleared).toHaveBeenCalledTimes(1);
    expect(manager.isSigningOut()).toBe(true);
    expect(stored()).toEqual(OTHER_AUTH_STATE);
    expect(local.removeItem).not.toHaveBeenCalledWith(ROW);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('a rejected credential still clears the row and ends the IdP session', async () => {
    const { manager, cleared } = await signedIn();
    fetchSpy.mockResolvedValueOnce({ ok: false, status: 401 });

    expect(await manager.refreshTokens()).toBeNull();

    expect(local.removeItem).toHaveBeenCalledWith(ROW);
    expect(data.has(ROW)).toBe(false);
    expect(cleared).toHaveBeenCalledTimes(1);
    expect(assignSpy).toHaveBeenCalledWith('https://idp.example.com/logout');
  });
});
