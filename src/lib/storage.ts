/**
 * BROWSER EXTENSION API ADAPTER (Web Polyfill)
 * ============================================
 *
 * This file polyfills the `window.browser` and `browser.storage` APIs so that code
 * shared between the Browser Extension and the Dashboard (Web) can run without modification.
 *
 * **CRITICAL REQUIREMENT:**
 * This file MUST be imported in main.tsx for side-effects BEFORE any auth code runs.
 *
 * **Why this exists:**
 * - Browser Extension uses: `browser.storage.local` (native extension API)
 * - Dashboard (Web) needs: localStorage wrapper that mimics the same API
 * - Without this adapter: `window.browser` is undefined → Auth fails with 401
 *
 * **Usage:**
 * ```typescript
 * // main.tsx (REQUIRED - do not remove!)
 * import './lib/storage';  // ✅ Initializes window.browser
 * ```
 *
 * **Testing:**
 * After login, verify in browser console:
 * ```javascript
 * window.browser  // Should exist: { storage: { local: {...} } }
 * localStorage.getItem('faultmaven_authState')  // Should have JWT token
 * ```
 */

type StorageValue = string | number | boolean | Record<string, unknown> | Array<unknown>;
type StorageData = Record<string, StorageValue>;

/**
 * Prefix every key this adapter writes into `localStorage` carries.
 *
 * Exported so nothing has to restate the composed key. `AUTH_STATE_STORAGE_KEY`
 * (lib/auth/crossTab.ts) is the one place outside this file that must know the
 * physical name, because the cross-tab `storage` event reports physical keys —
 * and a second hand-written `'faultmaven_authState'` literal is exactly the
 * copy that would keep working while this prefix changed underneath it.
 */
export const STORAGE_KEY_PREFIX = 'faultmaven_';

/** A value read back out of the store, and whether the key was there at all. */
export interface StoredRead {
  /**
   * Key presence, reported separately from the value.
   *
   * Callers distinguish "nothing cached" from "an empty cache" by PRESENCE —
   * the shared UI's hydrate does exactly that — and `undefined` alone cannot
   * carry the difference.
   */
  present: boolean;
  value: unknown;
}

/**
 * The one prefixed `localStorage` codec, used by every keyspace this app owns.
 *
 * There were three hand-rolled copies of this: the auth adapter below, the
 * Copilot panel's host store, and the cross-tab reader — which is two copies
 * too many for logic whose whole job is that a value round-trips to the same
 * type it went in as. `set("42")` reading back as the number 42 is a bug that
 * has to be fixed once, not three times, and the cross-tab reader had already
 * drifted: it hand-decoded the stored row and so could disagree with the very
 * adapter that wrote it.
 *
 * Parameterised on the prefix rather than shared as one keyspace, because the
 * keyspaces must NOT collide: `faultmaven_` is this app's session, `fm.copilot.`
 * is the panel's own persistence, and neither should be able to overwrite the
 * other.
 */
export function createPrefixedLocalStore(prefix: string) {
  const physicalKey = (key: string) => `${prefix}${key}`;

  /** Local storage this browser actually offers, or null (private mode, blocked). */
  const store = (): Storage | null => {
    try {
      return typeof localStorage === 'undefined' ? null : localStorage;
    } catch {
      return null;
    }
  };

  /**
   * Decode one raw stored string.
   *
   * A value that will not parse is handed back verbatim rather than dropped: it
   * was written by hand, or by a build that stored a bare string, and losing it
   * silently is worse than returning it as it is.
   */
  const decode = (raw: string | null): StoredRead =>
    raw === null
      ? { present: false, value: undefined }
      : (() => {
          try {
            return { present: true, value: JSON.parse(raw) as unknown };
          } catch {
            return { present: true, value: raw };
          }
        })();

  return {
    physicalKey,
    decode,

    read(key: string): StoredRead {
      const s = store();
      return s ? decode(s.getItem(physicalKey(key))) : { present: false, value: undefined };
    },

    write(key: string, value: unknown): void {
      // Always JSON-serialize so `read` round-trips the original type.
      try {
        store()?.setItem(physicalKey(key), JSON.stringify(value));
      } catch {
        // Quota exceeded or storage blocked. Every keyspace here is a cache
        // over server state or a per-viewer convenience, so a lost write costs
        // a re-fetch, not data — and throwing would take down the caller.
      }
    },

    remove(key: string): void {
      try {
        store()?.removeItem(physicalKey(key));
      } catch {
        // As above.
      }
    },
  };
}

/** This app's own session keyspace. */
export const authLocalStore = createPrefixedLocalStore(STORAGE_KEY_PREFIX);

class LocalStorageAdapter {
  async get(keys: string[]): Promise<StorageData> {
    const result: StorageData = {};
    for (const key of keys) {
      const { present, value } = authLocalStore.read(key);
      if (present) result[key] = value as StorageData[string];
    }
    return result;
  }

  async set(items: StorageData): Promise<void> {
    for (const [key, value] of Object.entries(items)) {
      authLocalStore.write(key, value);
    }
  }

  async remove(keys: string[]): Promise<void> {
    for (const key of keys) authLocalStore.remove(key);
  }
}

// Create a browser-like storage interface for web
export const storage = {
  local: new LocalStorageAdapter()
};

// Make it available globally for the API client
if (typeof window !== 'undefined') {
  (window as unknown as { browser?: { storage: { local: LocalStorageAdapter } } }).browser = { storage };
}
