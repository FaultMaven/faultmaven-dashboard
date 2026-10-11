import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { HostUser } from '@faultmaven/copilot-ui';

const getAccessTokenFor = vi.fn();
const peekAccessToken = vi.fn();
const refreshTokens = vi.fn();
const onAuthCleared = vi.fn();
const clearAuthState = vi.fn();

vi.mock('../../lib/auth/AuthManager', () => ({
  authManager: {
    getAccessTokenFor: (...args: unknown[]) => getAccessTokenFor(...args),
    peekAccessToken: (...args: unknown[]) => peekAccessToken(...args),
    refreshTokens: (...args: unknown[]) => refreshTokens(...args),
    onAuthCleared: (...args: unknown[]) => onAuthCleared(...args),
    clearAuthState: (...args: unknown[]) => clearAuthState(...args),
  },
}));

import { SessionSwitchedError } from '@faultmaven/copilot-ui';
import { createWebSession, hostUserFromProfile } from '../../copilot/webSession';
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

/** The session as the mount builds it: with the package's own error class. */
const session = () => createWebSession(USER, SessionSwitchedError);

beforeEach(() => {
  vi.clearAllMocks();
  onAuthCleared.mockReturnValue(() => {});
});

describe('hostUserFromProfile', () => {
  it('maps /auth/me onto the host contract, and carries NO tenant', () => {
    // `HostUser.organizationId` is gone from the package (copilot#253): nothing
    // read it, and there is nothing to replace it with — `/auth/me` publishes no
    // enterprise, and its `organization` is a billing summary (ADR-017 D5).
    // `toEqual` is exact, so a re-added tenant key fails here.
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
    });
  });

  it('is the same shape whether or not the account has a billing organization', () => {
    // Being in no organization is the normal state for a beta account, and it
    // says nothing about the session. The panel must not be handed a value that
    // varies with it.
    const withOrg = {
      user_id: 'u9',
      username: 'grace',
      display_name: 'Grace H',
      email: 'grace@example.com',
      roles: ['user'],
      is_dev_user: false,
      created_at: '2026-01-01T00:00:00Z',
      organization: { organization_id: 'org-7', name: 'Acme' },
    } as AccountProfile;
    const withoutOrg = { ...withOrg, organization: null } as AccountProfile;

    expect(hostUserFromProfile(withoutOrg)).toEqual(hostUserFromProfile(withOrg));
  });
});

describe('accessToken', () => {
  it('hands over the token the Dashboard would use for any other request', async () => {
    getAccessTokenFor.mockResolvedValue({ kind: 'token', token: 'tok-live' });
    await expect(session().accessToken()).resolves.toBe('tok-live');
  });

  it("asks for THIS panel's user, by id", async () => {
    getAccessTokenFor.mockResolvedValue({ kind: 'token', token: 'tok-live' });
    await session().accessToken();
    expect(getAccessTokenFor).toHaveBeenCalledExactlyOnceWith('u1');
  });

  it("throws the PACKAGE'S SessionSwitchedError when another account's session is stored (#212)", async () => {
    // The very class `getAuthHeaders` checks with `instanceof`: the request is
    // not sent, and the panel shows a notice that ends no one's session. Any
    // other error lets it go out header-less.
    getAccessTokenFor.mockResolvedValue({ kind: 'anotherUser' });
    await expect(session().accessToken()).rejects.toBeInstanceOf(SessionSwitchedError);
  });

  it('THROWS when the manager cannot produce one', async () => {
    // The contract is non-null on purpose. A null would hand the shared UI a
    // decision about what an absent credential means, and that decision belongs
    // to whoever owns the credential — a caller that cannot get a token is
    // looking at a session that has ended, which is onUnauthorized's business.
    getAccessTokenFor.mockResolvedValue({ kind: 'none' });
    const attempt = session().accessToken();
    await expect(attempt).rejects.toThrow(/no faultmaven session/i);
    await expect(attempt).rejects.not.toBeInstanceOf(SessionSwitchedError);
  });
});

describe('signOut', () => {
  it('is null — the Dashboard account menu owns it', () => {
    // Not a no-op: `null` removes the affordance, so the panel renders no second
    // sign-out that would clear half the state.
    expect(session().signOut).toBeNull();
  });
});

describe('onUnauthorized', () => {
  it('runs one reactive refresh NAMING the token that was refused', async () => {
    // The refresh path otherwise judges staleness by the expiry clock, which
    // still calls a revoked token fresh and would hand the same dead credential
    // straight back for the retry to re-send.
    peekAccessToken.mockResolvedValue('tok-refused');
    refreshTokens.mockResolvedValue('tok-new');

    await session().onUnauthorized();

    expect(refreshTokens).toHaveBeenCalledWith('tok-refused');
  });

  it('names the bearer the refused request CARRIED, when the transport passes it', async () => {
    // Storage may hold a newer token by the time the 401 lands (copilot#348);
    // naming that one would spend a rotation on a credential nobody refused.
    peekAccessToken.mockResolvedValue('tok-stored-now');
    refreshTokens.mockResolvedValue('tok-new');

    await session().onUnauthorized('tok-carried');

    expect(refreshTokens).toHaveBeenCalledExactlyOnceWith('tok-carried');
    expect(peekAccessToken).not.toHaveBeenCalled();
  });

  it("answers 'refreshed' when the credential was renewed", async () => {
    // The answer is what stops the panel showing a blocking "session expired"
    // modal after a refresh that WORKED — and whose action wiped the panel
    // while the shell stayed signed in. On 'refreshed' the client retries.
    peekAccessToken.mockResolvedValue('tok-refused');
    refreshTokens.mockResolvedValue('tok-new');

    await expect(session().onUnauthorized()).resolves.toBe('refreshed');
  });

  it("answers 'ended' when the session is genuinely over", async () => {
    peekAccessToken.mockResolvedValue('tok-refused');
    refreshTokens.mockResolvedValue(null);

    await expect(session().onUnauthorized()).resolves.toBe('ended');
  });

  it('does not clear the session itself', async () => {
    // Whether a 401 condemns the session is AuthManager's call: a definitive
    // rejection clears (and routes to /login through onAuthCleared), while a
    // 5xx or an offline blip keeps it. Clearing here would turn every 401 into
    // a forced logout for every open tab.
    peekAccessToken.mockResolvedValue('tok-refused');
    refreshTokens.mockResolvedValue(null);

    await session().onUnauthorized();

    expect(refreshTokens).toHaveBeenCalledTimes(1);
    expect(clearAuthState).not.toHaveBeenCalled();
  });
});

describe('subscribeAuthState', () => {
  it('reports signed-out through the ONE channel AuthManager notifies on', () => {
    // One subscription, not two. Every way a session ends — the account menu,
    // a definitively-rejected credential inside the request path, and (since
    // the decision moved into AuthManager) another tab signing out or signing a
    // different account in — arrives as `onAuthCleared`. Subscribing to the
    // storage event here as well delivered a cross-tab sign-out to the panel
    // TWICE while still missing an account switch entirely, because both
    // listeners only acted on `null`.
    let fireCleared = () => {};
    onAuthCleared.mockImplementation((listener: () => void) => {
      fireCleared = listener;
      return () => {};
    });

    const onChange = vi.fn();
    session().subscribeAuthState(onChange);

    expect(onAuthCleared).toHaveBeenCalledTimes(1);
    fireCleared();
    expect(onChange).toHaveBeenCalledExactlyOnceWith(null);
  });

  it('does not listen to the storage event itself', () => {
    // The host must not second-guess AuthManager about what a cross-tab write
    // means; that is what produced the double delivery.
    const addEventListener = vi.spyOn(window, 'addEventListener');

    session().subscribeAuthState(vi.fn());

    expect(addEventListener).not.toHaveBeenCalledWith('storage', expect.anything());
    addEventListener.mockRestore();
  });

  it('detaches on unsubscribe', () => {
    const stop = vi.fn();
    onAuthCleared.mockReturnValue(stop);

    session().subscribeAuthState(vi.fn())();

    expect(stop).toHaveBeenCalled();
  });
});
