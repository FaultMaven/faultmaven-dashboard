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
/** How many more `getItem` calls succeed; every one after them throws. */
let readsLeft = Infinity;

// The WHOLE object is stubbed: happy-dom ignores writes to `localStorage.getItem`.
const local = {
  getItem: vi.fn((key: string) => {
    if (readsLeft <= 0) throw new DOMException('The operation is insecure.', 'SecurityError');
    readsLeft -= 1;
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
  readsLeft = Infinity;
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
    readsLeft = okReads;

    expect(await renew(manager)).toBeNull();

    expect(local.removeItem).not.toHaveBeenCalled();
    expect(cleared).not.toHaveBeenCalled();
    expect(assignSpy).not.toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled();

    // Storage reads again: the session is still there, and renews.
    readsLeft = Infinity;
    expect(stored()).toEqual(EXPIRED);
    rotates();
    expect(await manager.refreshTokens()).toBe('new-access');
  });

  it('keeps the session when only the other-account read fails', async () => {
    // Another account's row sits in storage; this tab cannot tell whose it is
    // on the third read, so it must neither clear nor remove it (#212).
    const { manager, cleared } = await signedIn();
    data.set(ROW, JSON.stringify(OTHER_AUTH_STATE));
    readsLeft = 2;

    expect(await manager.refreshTokens()).toBeNull();

    expect(stored()).toEqual(OTHER_AUTH_STATE);
    expect(local.removeItem).not.toHaveBeenCalled();
    expect(cleared).not.toHaveBeenCalled();
    expect(manager.isSigningOut()).toBe(false);
  });
});

describe('clearAuthState on a failed read', () => {
  it('ends this tab and tells the listeners, but removes no row', async () => {
    const { manager, cleared } = await signedIn(TEST_AUTH_STATE);
    readsLeft = 0;

    await manager.clearAuthState();

    expect(local.removeItem).not.toHaveBeenCalled();
    expect(cleared).toHaveBeenCalledTimes(1);
    expect(stored()).toEqual(TEST_AUTH_STATE);
  });
});

describe('a restored tab whose first read fails', () => {
  it('is not pinned signed out: a later readable read lets it renew', async () => {
    data.set(ROW, JSON.stringify(EXPIRED));
    const manager = new AuthManager();
    readsLeft = 0;

    expect(await manager.getAccessToken()).toBeNull();

    readsLeft = Infinity;
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

  it("another account's readable row ends this tab as a sign-out from another tab, removing nothing", async () => {
    const { manager, cleared } = await signedIn();
    data.set(ROW, JSON.stringify(OTHER_AUTH_STATE));

    expect(await manager.refreshTokens()).toBeNull();

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
