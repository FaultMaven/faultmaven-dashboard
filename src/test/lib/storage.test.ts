import { describe, it, expect, beforeEach, vi } from 'vitest';
import { authLocalStore, storage } from '../../lib/storage';

describe('LocalStorageAdapter round-trip', () => {
  beforeEach(() => localStorage.clear());

  it('preserves a string that looks like a number (no coercion to number)', async () => {
    await storage.local.set({ token: '42' });
    const out = await storage.local.get(['token']);
    expect(out.token).toBe('42');
    expect(typeof out.token).toBe('string');
  });

  it('preserves a string that looks like a boolean', async () => {
    await storage.local.set({ flag: 'true' });
    const out = await storage.local.get(['flag']);
    expect(out.flag).toBe('true');
    expect(typeof out.flag).toBe('string');
  });

  it('round-trips objects and numbers with their types intact', async () => {
    await storage.local.set({ authState: { user: { id: 'u1' } }, count: 7 });
    const out = await storage.local.get(['authState', 'count']);
    expect(out.authState).toEqual({ user: { id: 'u1' } });
    expect(out.count).toBe(7);
  });

  it('falls back to the raw string for a legacy non-JSON value', async () => {
    // A value written before symmetric serialization (bare, unquoted).
    localStorage.setItem('faultmaven_legacy', 'abc');
    const out = await storage.local.get(['legacy']);
    expect(out.legacy).toBe('abc');
  });

  it('omits keys that are absent', async () => {
    const out = await storage.local.get(['missing']);
    expect(out).toEqual({});
  });
});

describe('a read that fails (faultmaven#2346)', () => {
  // The WHOLE object is stubbed: happy-dom ignores writes to `localStorage.getItem`.
  const throwingStorage = {
    getItem() {
      throw new DOMException('The operation is insecure.', 'SecurityError');
    },
    setItem() {},
    removeItem() {},
    clear() {},
    key: () => null,
    length: 0,
  };

  it('read reports it as failed, and never throws', () => {
    vi.stubGlobal('localStorage', throwingStorage);
    try {
      expect(authLocalStore.read('authState')).toMatchObject({ present: false, failed: true });
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('get rejects rather than reporting the key absent, carrying the original error', async () => {
    vi.stubGlobal('localStorage', throwingStorage);
    try {
      const rejection = await storage.local.get(['authState']).catch((e: unknown) => e);
      expect(rejection).toBeInstanceOf(Error);
      expect((rejection as Error).message).toMatch(/read failed/);
      expect((rejection as Error & { cause?: unknown }).cause).toBeInstanceOf(DOMException);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('a localStorage getter that throws is a failed read, not an absent key', async () => {
    const original = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      get() {
        throw new DOMException('The operation is insecure.', 'SecurityError');
      },
    });
    try {
      expect(authLocalStore.read('authState')).toMatchObject({ present: false, failed: true });
      await expect(storage.local.get(['authState'])).rejects.toThrow(/read failed/);
    } finally {
      if (original) Object.defineProperty(globalThis, 'localStorage', original);
      else Reflect.deleteProperty(globalThis, 'localStorage');
    }
  });

  it('an absent key is not a failed read', async () => {
    localStorage.clear();
    expect(authLocalStore.read('missing')).toEqual({ present: false, value: undefined, failed: false });
    await expect(storage.local.get(['missing'])).resolves.toEqual({});
  });

  it('a browser with no localStorage reads as absent, not failed', async () => {
    vi.stubGlobal('localStorage', undefined);
    try {
      expect(authLocalStore.read('authState')).toEqual({ present: false, value: undefined, failed: false });
      await expect(storage.local.get(['authState'])).resolves.toEqual({});
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
