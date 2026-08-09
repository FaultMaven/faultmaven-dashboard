// Cross-tab refresh-token rotation (#48).
//
// These tests deliberately do NOT mock storage per-instance. Two browser tabs
// share one origin's localStorage, so the defect only appears when two
// AuthManager instances read and write the SAME store — which is what the
// harness below provides. A per-instance mock would let both tabs "succeed"
// against private state and the race would be invisible.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { AuthState } from './types';

vi.mock('../../config', () => ({
  default: { apiUrl: 'http://test-api.local' },
}));

// ---------------------------------------------------------------------------
// One store, shared by every AuthManager — the browser-storage adapter's real
// topology.
// ---------------------------------------------------------------------------
const store: Record<string, unknown> = {};

const sharedStorage = {
  get: async (keys: string[]) => {
    const out: Record<string, unknown> = {};
    for (const k of keys) if (k in store) out[k] = store[k];
    return out;
  },
  set: async (items: Record<string, unknown>) => {
    Object.assign(store, items);
  },
  remove: async (keys: string[]) => {
    for (const k of keys) delete store[k];
  },
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).window = { browser: { storage: { local: sharedStorage } } };

const localStore: Record<string, string> = {};
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).localStorage = {
  getItem: (k: string) => (k in localStore ? localStore[k] : null),
  setItem: (k: string, v: string) => { localStore[k] = v; },
  removeItem: (k: string) => { delete localStore[k]; },
};

// ---------------------------------------------------------------------------
// Web Locks. A FIFO mutex is all AuthManager relies on. `installLocks(false)`
// models the deployments that genuinely have none — Web Locks needs a secure
// context, so a self-hosted dashboard on plain HTTP over a LAN address has no
// navigator.locks at all.
// ---------------------------------------------------------------------------
function installLocks(available: boolean) {
  if (!available) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).navigator = {};
    return;
  }
  const queues = new Map<string, Promise<unknown>>();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (globalThis as any).navigator = {
    locks: {
      request: (name: string, cb: () => Promise<unknown>) => {
        const tail = queues.get(name) ?? Promise.resolve();
        const run = tail.then(() => cb());
        queues.set(name, run.catch(() => undefined));
        return run;
      },
    },
  };
}

// ---------------------------------------------------------------------------
// An /auth/refresh that rotates: each accepted refresh token is consumed and
// revoked, exactly as the backend behaves. Presenting a spent token gets 401.
// ---------------------------------------------------------------------------
function rotatingAuthServer(validRefresh: string) {
  const presented: string[] = [];
  let generation = 0;

  const fetchImpl = vi.fn(async (_url: string, init: { body: string }) => {
    const token = (JSON.parse(init.body) as { refresh_token: string }).refresh_token;
    presented.push(token);

    if (token !== validRefresh) {
      return { ok: false, status: 401 };
    }
    generation += 1;
    validRefresh = `refresh-${generation}`;
    return {
      ok: true,
      json: async () => ({
        access_token: `access-${generation}`,
        refresh_token: validRefresh,
        expires_in: 3600,
      }),
    };
  });

  return { fetchImpl, presented };
}

import { AuthManager } from './AuthManager';

const EXPIRED_SEED: AuthState = {
  access_token: 'access-0',
  token_type: 'bearer',
  // Already past expiry, so any getAccessToken() forces the refresh path.
  expires_at: Date.now() - 1000,
  refresh_token: 'refresh-0',
  user: {
    user_id: 'u1',
    username: 'tester',
    email: 't@example.com',
    display_name: 'Tester',
    is_dev_user: false,
    is_active: true,
    roles: ['user'],
  },
};

const seedStore = (state: AuthState = EXPIRED_SEED) => { store.authState = { ...state }; };
const storedState = () => store.authState as AuthState | undefined;

let consoleError: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  for (const k of Object.keys(store)) delete store[k];
  for (const k of Object.keys(localStore)) delete localStore[k];
  installLocks(true);
  consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  consoleError.mockRestore();
});

describe('#48 cross-tab refresh rotation', () => {
  describe('with Web Locks available', () => {
    it('collapses two tabs hitting expiry into exactly one /auth/refresh call', async () => {
      seedStore();
      const { fetchImpl, presented } = rotatingAuthServer('refresh-0');
      globalThis.fetch = fetchImpl as unknown as typeof fetch;

      const tabA = new AuthManager();
      const tabB = new AuthManager();

      const [a, b] = await Promise.all([tabA.getAccessToken(), tabB.getAccessToken()]);

      // The acceptance criterion from the issue, stated directly.
      expect(presented).toEqual(['refresh-0']);
      expect(fetchImpl).toHaveBeenCalledTimes(1);

      // Both tabs end up on the rotated token; neither is logged out.
      expect(a).toBe('access-1');
      expect(b).toBe('access-1');
      expect(storedState()).toBeDefined();
      expect(storedState()?.refresh_token).toBe('refresh-1');
    });

    it('keeps every tab signed in when many tabs expire together', async () => {
      seedStore();
      const { fetchImpl, presented } = rotatingAuthServer('refresh-0');
      globalThis.fetch = fetchImpl as unknown as typeof fetch;

      const tabs = Array.from({ length: 6 }, () => new AuthManager());
      const tokens = await Promise.all(tabs.map((t) => t.getAccessToken()));

      expect(presented).toEqual(['refresh-0']);
      expect(tokens.every((t) => t === 'access-1')).toBe(true);
      expect(storedState()).toBeDefined();
    });
  });

  describe('without Web Locks (fallback path)', () => {
    beforeEach(() => installLocks(false));

    it('does not log the session out when its token was superseded mid-flight', async () => {
      seedStore();

      // The losing tab: its request is already on the wire when the winning
      // tab's rotation lands in shared storage, so the 401 it gets back is
      // about a token that is spent, not a session that is dead.
      const fetchImpl = vi.fn(async () => {
        await sharedStorage.set({
          authState: {
            ...EXPIRED_SEED,
            access_token: 'access-1',
            refresh_token: 'refresh-1',
            expires_at: Date.now() + 3_600_000,
          },
        });
        return { ok: false, status: 401 };
      });
      globalThis.fetch = fetchImpl as unknown as typeof fetch;

      const loser = new AuthManager();
      const token = await loser.getAccessToken();

      // Adopts the winner's token rather than wiping shared storage.
      expect(token).toBe('access-1');
      expect(storedState()).toBeDefined();
      expect(storedState()?.refresh_token).toBe('refresh-1');
    });

    it('still refreshes normally when it is the only tab', async () => {
      seedStore();
      const { fetchImpl, presented } = rotatingAuthServer('refresh-0');
      globalThis.fetch = fetchImpl as unknown as typeof fetch;

      const token = await new AuthManager().getAccessToken();

      expect(token).toBe('access-1');
      expect(presented).toEqual(['refresh-0']);
    });
  });

  // The supersession guard must not become a blanket "never log out".
  describe('negative controls — the session IS still cleared when it should be', () => {
    it('clears when the token it presented is still the one on file (real revocation)', async () => {
      seedStore();
      globalThis.fetch = vi.fn(async () => ({ ok: false, status: 401 })) as unknown as typeof fetch;

      const token = await new AuthManager().getAccessToken();

      expect(token).toBeNull();
      expect(storedState()).toBeUndefined();
    });

    it('clears on a 403 rejection', async () => {
      seedStore();
      globalThis.fetch = vi.fn(async () => ({ ok: false, status: 403 })) as unknown as typeof fetch;

      expect(await new AuthManager().getAccessToken()).toBeNull();
      expect(storedState()).toBeUndefined();
    });

    it('clears when a 200 response is malformed and the token was not superseded', async () => {
      seedStore();
      globalThis.fetch = vi.fn(async () => ({
        ok: true,
        json: async () => ({ access_token: 'x', refresh_token: 'y' }), // no expires_in
      })) as unknown as typeof fetch;

      expect(await new AuthManager().getAccessToken()).toBeNull();
      expect(storedState()).toBeUndefined();
    });
  });

  // A server that cannot answer has not rejected the credential.
  describe('transient failures keep the session', () => {
    it.each([500, 502, 503, 429])('does not clear on %i', async (status) => {
      seedStore();
      globalThis.fetch = vi.fn(async () => ({ ok: false, status })) as unknown as typeof fetch;

      const token = await new AuthManager().getAccessToken();

      expect(token).toBeNull();
      expect(storedState()).toBeDefined();
      expect(storedState()?.refresh_token).toBe('refresh-0');
    });

    it('does not clear when the refresh request is aborted by its timeout', async () => {
      seedStore();
      globalThis.fetch = vi.fn(async () => {
        throw new DOMException('The operation was aborted.', 'TimeoutError');
      }) as unknown as typeof fetch;

      expect(await new AuthManager().getAccessToken()).toBeNull();
      expect(storedState()).toBeDefined();
    });
  });

  // A 401 on an API call means the server refused a token the expiry clock
  // still considers fresh. The refresh path must not answer with that token.
  describe('reactive 401 retry', () => {
    it('forces a rotation when the caller reports the stored token was rejected', async () => {
      seedStore({ ...EXPIRED_SEED, expires_at: Date.now() + 3_600_000 });
      const { fetchImpl, presented } = rotatingAuthServer('refresh-0');
      globalThis.fetch = fetchImpl as unknown as typeof fetch;

      const token = await new AuthManager().refreshTokens('access-0');

      expect(presented).toEqual(['refresh-0']);
      expect(token).toBe('access-1');
      expect(token).not.toBe('access-0');
    });

    it('still skips the network when no token was reported rejected', async () => {
      seedStore({ ...EXPIRED_SEED, expires_at: Date.now() + 3_600_000 });
      const fetchImpl = vi.fn();
      globalThis.fetch = fetchImpl as unknown as typeof fetch;

      const token = await new AuthManager().refreshTokens();

      expect(fetchImpl).not.toHaveBeenCalled();
      expect(token).toBe('access-0');
    });
  });

  describe('a different user signing in mid-flight', () => {
    it('neither adopts their token nor destroys their session', async () => {
      seedStore();
      globalThis.fetch = vi.fn(async () => {
        await sharedStorage.set({
          authState: {
            ...EXPIRED_SEED,
            access_token: 'other-users-access',
            refresh_token: 'other-users-refresh',
            expires_at: Date.now() + 3_600_000,
            user: { ...EXPIRED_SEED.user, user_id: 'u2', username: 'someone-else' },
          },
        });
        return { ok: false, status: 401 };
      }) as unknown as typeof fetch;

      const token = await new AuthManager().getAccessToken();

      expect(token).toBeNull();
      expect(storedState()).toBeDefined();
      expect(storedState()?.access_token).toBe('other-users-access');
    });
  });

  describe('refresh request is bounded so it cannot pin the cross-tab lock', () => {
    it('passes an abort signal to /auth/refresh', async () => {
      seedStore();
      const { fetchImpl } = rotatingAuthServer('refresh-0');
      globalThis.fetch = fetchImpl as unknown as typeof fetch;

      await new AuthManager().getAccessToken();

      const init = fetchImpl.mock.calls[0][1] as unknown as { signal?: AbortSignal };
      expect(init.signal).toBeInstanceOf(AbortSignal);
    });

    // Node and modern browsers have AbortSignal.timeout, so the fallback branch
    // never runs here unless it is forced. Safari 15.4-15.6 is the real case:
    // Web Locks present, AbortSignal.timeout absent — the one combination where
    // an unbounded fetch would pin the lock for every other tab.
    it('still bounds the request where AbortSignal.timeout is unavailable', async () => {
      seedStore();
      const { fetchImpl } = rotatingAuthServer('refresh-0');
      globalThis.fetch = fetchImpl as unknown as typeof fetch;

      // `timeout` is INHERITED, not an own property of AbortSignal, so
      // `delete AbortSignal.timeout` is a silent no-op that leaves the native
      // implementation in place — the fallback would never be entered and this
      // test would pass without exercising anything. Shadow it with an own
      // property instead, and remove the shadow to restore.
      expect(Object.getOwnPropertyNames(AbortSignal)).not.toContain('timeout');
      Object.defineProperty(AbortSignal, 'timeout', { value: undefined, configurable: true });
      expect(typeof AbortSignal.timeout).not.toBe('function');
      try {
        await new AuthManager().getAccessToken();
      } finally {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        delete (AbortSignal as any).timeout;
      }
      expect(typeof AbortSignal.timeout).toBe('function');

      const init = fetchImpl.mock.calls[0][1] as unknown as { signal?: AbortSignal };
      expect(init.signal).toBeInstanceOf(AbortSignal);
      expect(init.signal?.aborted).toBe(false);
    });
  });
});
