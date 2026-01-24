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

class LocalStorageAdapter {
  async get(keys: string[]): Promise<StorageData> {
    const result: StorageData = {};
    for (const key of keys) {
      const value = localStorage.getItem(`faultmaven_${key}`);
      if (value !== null) {
        try {
          result[key] = JSON.parse(value);
        } catch {
          result[key] = value;
        }
      }
    }
    return result;
  }

  async set(items: StorageData): Promise<void> {
    for (const [key, value] of Object.entries(items)) {
      const serialized = typeof value === 'string' ? value : JSON.stringify(value);
      localStorage.setItem(`faultmaven_${key}`, serialized);
    }
  }

  async remove(keys: string[]): Promise<void> {
    for (const key of keys) {
      localStorage.removeItem(`faultmaven_${key}`);
    }
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
