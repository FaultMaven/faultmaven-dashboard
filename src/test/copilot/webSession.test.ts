import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { HostUser } from '@faultmaven/copilot-ui';

const getAccessToken = vi.fn();
const peekAccessToken = vi.fn();
const refreshTokens = vi.fn();
const onAuthCleared = vi.fn();
const clearAuthState = vi.fn();

vi.mock('../../lib/auth/AuthManager', () => ({
  authManager: {
    getAccessToken: (...args: unknown[]) => getAccessToken(...args),
    peekAccessToken: (...args: unknown[]) => peekAccessToken(...args),
    refreshTokens: (...args: unknown[]) => refreshTokens(...args),
    onAuthCleared: (...args: unknown[]) => onAuthCleared(...args),
    clearAuthState: (...args: unknown[]) => clearAuthState(...args),
  },
}));

import { createWebSession, hostUserFromProfile } from '../../copilot/webSession';
import { AUTH_STATE_STORAGE_KEY } from '../../lib/auth/crossTab';
import type { AccountProfile } from '../../lib/auth/functions';

/**
 * The session half of the web host (ADR-016 D3).
 *
 * The shared UI never logs in, never stores a token and never refreshes one. It
 * asks; the host — which owns the refresh lock, the storage key and the
 * rotation — answers. Everything below is that answer, and the two properties
 * that carry the invariant are: `accessToken` THROWS rather than resolving
 * null, and `signOut` is null.
 */

const USER: HostUser = {
  id: 'u1',
  username: 'ada',
  displayName: 'Ada L',
  email: 'ada@example.com',
  roles: ['user'],
};

beforeEach(() => {
  vi.clearAllMocks();
  onAuthCleared.mockReturnValue(() => {});
});

describe('hostUserFromProfile', () => {
  it('maps /auth/me onto the host contract, organization included', () => {
    const profile = {
      user_id: 'u9',
      username: 'grace',
      display_name: 'Grace H',
      email: 'grace@example.com',
      roles: ['user', 'admin'],
      is_dev_user: false,
      created_at: '2026-01-01T00:00:00Z',
      organization: { organization_id: 'org-7', name: 'Acme' },
    } as AccountProfile;

    expect(hostUserFromProfile(profile)).toEqual({
      id: 'u9',
      username: 'grace',
      displayName: 'Grace H',
      email: 'grace@example.com',
      roles: ['user', 'admin'],
      organizationId: 'org-7',
    });
  });

  it('leaves organizationId undefined when the session is bound to no tenant', () => {
    // `/auth/me` documents null as "nothing to show", never "no access". The
    // panel must not read it as a permission signal, so it simply carries none.
    const profile = {
      user_id: 'u9',
      username: 'grace',
      display_name: 'Grace H',
      email: 'grace@example.com',
      roles: ['user'],
      is_dev_user: false,
      created_at: '2026-01-01T00:00:00Z',
      organization: null,
    } as AccountProfile;

    expect(hostUserFromProfile(profile).organizationId).toBeUndefined();
  });
});

describe('accessToken', () => {
  it('hands over the token the Dashboard would use for any other request', async () => {
    getAccessToken.mockResolvedValue('tok-live');
    await expect(createWebSession(USER).accessToken()).resolves.toBe('tok-live');
  });

  it('THROWS when the manager cannot produce one', async () => {
    // The contract is non-null on purpose. A null would hand the shared UI a
    // decision about what an absent credential means, and that decision belongs
    // to whoever owns the credential — a caller that cannot get a token is
    // looking at a session that has ended, which is onUnauthorized's business.
    getAccessToken.mockResolvedValue(null);
    await expect(createWebSession(USER).accessToken()).rejects.toThrow(/no faultmaven session/i);
  });
});

describe('signOut', () => {
  it('is null — the Dashboard account menu owns it', () => {
    // Not a no-op: `null` removes the affordance, so the panel renders no second
    // sign-out that would clear half the state.
    expect(createWebSession(USER).signOut).toBeNull();
  });
});

describe('onUnauthorized', () => {
  it('runs one reactive refresh NAMING the token that was refused', async () => {
    // The refresh path otherwise judges staleness by the expiry clock, which
    // still calls a revoked token fresh and would hand the same dead credential
    // straight back for the retry to re-send.
    peekAccessToken.mockResolvedValue('tok-refused');
    refreshTokens.mockResolvedValue('tok-new');

    await createWebSession(USER).onUnauthorized();

    expect(refreshTokens).toHaveBeenCalledWith('tok-refused');
  });

  it('does not clear the session itself', async () => {
    // Whether a 401 condemns the session is AuthManager's call: a definitive
    // rejection clears (and routes to /login through onAuthCleared), while a
    // 5xx or an offline blip keeps it. Clearing here would turn every 401 into
    // a forced logout for every open tab.
    peekAccessToken.mockResolvedValue('tok-refused');
    refreshTokens.mockResolvedValue(null);

    await createWebSession(USER).onUnauthorized();

    expect(refreshTokens).toHaveBeenCalledTimes(1);
    expect(clearAuthState).not.toHaveBeenCalled();
  });
});

describe('subscribeAuthState', () => {
  it('reports signed-out when THIS tab clears the session', async () => {
    let fireLocalClear = () => {};
    onAuthCleared.mockImplementation((listener: () => void) => {
      fireLocalClear = listener;
      return () => {};
    });

    const onChange = vi.fn();
    createWebSession(USER).subscribeAuthState(onChange);
    fireLocalClear();

    expect(onChange).toHaveBeenCalledWith(null);
  });

  it('reports signed-out when ANOTHER TAB signs out', () => {
    // The `storage` event is deliberately not delivered to the tab that wrote
    // it, so this leg and the one above cover different halves of "somewhere
    // else" and neither alone is enough.
    const onChange = vi.fn();
    createWebSession(USER).subscribeAuthState(onChange);

    window.dispatchEvent(
      new StorageEvent('storage', { key: AUTH_STATE_STORAGE_KEY, newValue: null }),
    );

    expect(onChange).toHaveBeenCalledWith(null);
  });

  it('reports signed-out when another tab clears all storage', () => {
    const onChange = vi.fn();
    createWebSession(USER).subscribeAuthState(onChange);

    window.dispatchEvent(new StorageEvent('storage', { key: null }));

    expect(onChange).toHaveBeenCalledWith(null);
  });

  it('says NOTHING when another tab merely rotates the token', () => {
    // Rotation is not an identity change. Reporting it would make the panel
    // treat a routine refresh as a sign-out.
    const onChange = vi.fn();
    createWebSession(USER).subscribeAuthState(onChange);

    window.dispatchEvent(
      new StorageEvent('storage', {
        key: AUTH_STATE_STORAGE_KEY,
        newValue: JSON.stringify({
          access_token: 'tok-rotated',
          user: { user_id: 'u1' },
        }),
      }),
    );

    expect(onChange).not.toHaveBeenCalled();
  });

  it('detaches both listeners on unsubscribe', () => {
    const stopLocal = vi.fn();
    onAuthCleared.mockReturnValue(stopLocal);

    const onChange = vi.fn();
    const unsubscribe = createWebSession(USER).subscribeAuthState(onChange);
    unsubscribe();

    expect(stopLocal).toHaveBeenCalled();
    window.dispatchEvent(
      new StorageEvent('storage', { key: AUTH_STATE_STORAGE_KEY, newValue: null }),
    );
    expect(onChange).not.toHaveBeenCalled();
  });
});
