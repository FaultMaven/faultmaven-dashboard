/**
 * The Dashboard's implementation of the Copilot UI's host contract (ADR-016 D2).
 *
 * `@faultmaven/copilot-ui` states what it needs from the environment it runs in
 * — a key-value store, where the backend is, how to navigate, whether the page
 * can be captured — and each host answers differently. This file is the web
 * host's answers. The session is the fifth member and lives in `webSession.ts`,
 * because it exists only once someone is signed in and these do not.
 *
 * Nothing here branches on `kind`. A branch on `kind` is a capability the
 * interface failed to model, and the next host makes it wrong.
 */
import type {
  HostCapabilities,
  HostEndpoints,
  HostNavigation,
  HostPageCapture,
  HostStore,
  StoredValue,
} from '@faultmaven/copilot-ui';
import config from '../config';
import { COPILOT_STORE_URL, PAGE_CAPTURE_UNSUPPORTED_REASON } from './storeListing';

/**
 * Namespace for the panel's own keys in this viewer's `localStorage`.
 *
 * Distinct from the `faultmaven_` prefix the Dashboard's auth storage adapter
 * uses (`lib/storage.ts`), so the two keyspaces cannot collide: the panel
 * persists conversation caches and titles under names it chose for extension
 * `storage.local`, where nothing else lives, and this app's own keys were
 * chosen with no knowledge of them.
 *
 * `localStorage`, not `sessionStorage`: this is per-VIEWER state — pinned
 * cases, titles, the conversation cache — and a person who closes a tab and
 * comes back expects it, exactly as the extension's `storage.local` survives a
 * side-panel teardown.
 */
export const PANEL_STORAGE_NAMESPACE = 'fm.copilot.';

/** Local storage this browser actually offers, or null (private mode, blocked). */
function safeLocalStorage(): Storage | null {
  try {
    if (typeof localStorage === 'undefined') return null;
    return localStorage;
  } catch {
    return null;
  }
}

/**
 * Per-viewer key-value storage for the panel.
 *
 * Reads and writes are namespaced and JSON round-tripped, so `set` and `get`
 * return the same type — the extension's `storage.local` is structured, and a
 * store that handed back strings would silently change the meaning of every
 * value the shared UI persists.
 *
 * ABSENT KEYS ARE OMITTED, not returned as `undefined` entries. `useDataRecovery`
 * distinguishes "no conversations cached" from "an empty cache" by key presence,
 * and extension `storage.local` behaves this way.
 */
export function createWebHostStore(namespace: string = PANEL_STORAGE_NAMESPACE): HostStore {
  const physical = (key: string) => `${namespace}${key}`;

  const read = (key: string): { present: boolean; value: StoredValue } => {
    const store = safeLocalStorage();
    if (!store) return { present: false, value: undefined };
    const raw = store.getItem(physical(key));
    if (raw === null) return { present: false, value: undefined };
    try {
      return { present: true, value: JSON.parse(raw) as StoredValue };
    } catch {
      // A value written by hand, or by a build that stored a bare string.
      // Hand it back verbatim rather than dropping it.
      return { present: true, value: raw };
    }
  };

  return {
    async get(keys) {
      const out: Record<string, StoredValue> = {};
      for (const key of keys) {
        const { present, value } = read(key);
        if (present) out[key] = value;
      }
      return out;
    },

    async set(items) {
      const store = safeLocalStorage();
      if (!store) return;
      for (const [key, value] of Object.entries(items)) {
        try {
          store.setItem(physical(key), JSON.stringify(value));
        } catch {
          // Quota exceeded or storage blocked. The panel's persistence is a
          // cache over server state, so losing a write costs a re-fetch, not
          // data — and throwing here would take down whatever effect wrote it.
        }
      }
    },

    async remove(keys) {
      const store = safeLocalStorage();
      if (!store) return;
      for (const key of keys) {
        try {
          store.removeItem(physical(key));
        } catch {
          // As above.
        }
      }
    },

    /**
     * Fires for changes made in ANOTHER tab of this origin.
     *
     * The `storage` event is deliberately not delivered to the tab that made
     * the change, which is the right shape here: a writer already knows what it
     * wrote, and the extension's `storage.onChanged` exists for exactly the
     * same reason — a second context writing the same keys.
     */
    subscribe(keys, onChange) {
      if (typeof window === 'undefined') return () => {};
      const watched = new Set(keys.map(physical));
      const handler = (event: StorageEvent) => {
        // `key === null` is `localStorage.clear()` in another tab: every
        // watched key just became absent.
        if (event.key === null) {
          const changed: Record<string, StoredValue> = {};
          for (const key of keys) changed[key] = undefined;
          onChange(changed);
          return;
        }
        if (!watched.has(event.key)) return;
        const logical = event.key.slice(namespace.length);
        onChange({ [logical]: read(logical).value });
      };
      window.addEventListener('storage', handler);
      return () => window.removeEventListener('storage', handler);
    },
  };
}

/**
 * Where the backend is: fixed, for the life of this document.
 *
 * The extension's endpoint is user-configured on its Options page and changes
 * at runtime; the origin that served this app already decided, through
 * `window.ENV.API_URL` / `VITE_API_URL` / same-host detection (`src/config.ts`).
 * `subscribe` therefore never calls back — but it is still implemented and
 * still returns an unsubscribe, so the calling hook needs no host branch.
 */
export function createWebHostEndpoints(): HostEndpoints {
  return {
    async apiUrl() {
      return config.apiUrl;
    },
    async dashboardUrl() {
      return window.location.origin;
    },
    subscribe() {
      return () => {};
    },
  };
}

/**
 * Navigation the panel asks for and this host performs.
 *
 * `dashboard(path)` is a router push, because in this host the Dashboard IS the
 * page: the extension focuses or opens a tab, and the panel must not know which
 * of those is happening. `settings` is `null` — the Dashboard has no Copilot
 * settings page, and `null` rather than a no-op is what makes the panel render
 * no dead "Open Settings" button (ADR-016 D2; the open question D4 in the
 * package's design doc is whether that is permanent).
 */
export function createWebHostNavigation(
  navigate: (path: string) => void,
): HostNavigation {
  return {
    async dashboard(path) {
      navigate(path);
    },
    async external(url) {
      window.open(url, '_blank', 'noopener,noreferrer');
    },
    settings: null,
  };
}

/**
 * Page capture: the one capability this host cannot provide.
 *
 * A union arm carrying a reason and an install link, not a missing method —
 * the affordance stays visible and explains itself when pressed, which is the
 * only install prompt the product makes and the moment the extension earns it
 * (ADR-016 D2).
 */
export const WEB_HOST_PAGE_CAPTURE: HostPageCapture = {
  supported: false,
  reason: PAGE_CAPTURE_UNSUPPORTED_REASON,
  installUrl: COPILOT_STORE_URL,
};

/**
 * Everything about this environment that is known before anyone signs in.
 *
 * Split from the session on purpose: capabilities are properties of the host
 * and can be built once; a session is not, and requiring both at the mount is
 * what makes "the panel renders no sign-in" a property of the type.
 */
export function createWebHostCapabilities(
  navigate: (path: string) => void,
): HostCapabilities {
  return {
    store: createWebHostStore(),
    endpoints: createWebHostEndpoints(),
    navigation: createWebHostNavigation(navigate),
    pageCapture: WEB_HOST_PAGE_CAPTURE,
  };
}
