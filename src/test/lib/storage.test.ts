import { describe, it, expect, beforeEach } from 'vitest';
import { storage } from '../../lib/storage';

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
