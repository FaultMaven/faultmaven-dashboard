/**
 * Observing a sign-in or sign-out that happened in ANOTHER tab.
 *
 * The Dashboard's cross-tab channel has always been shared `localStorage`: the
 * storage adapter (`lib/storage.ts`) is localStorage-backed, so every tab of an
 * origin reads and writes one `faultmaven_authState`. That is why AuthManager
 * needs no BroadcastChannel to hand a rotated token between tabs (#48) — the
 * write IS the message.
 *
 * What was missing is a READER. `authManager.onAuthCleared` fires only in the
 * tab that did the clearing, so a tab left open while the user signed out
 * elsewhere kept its React state and kept rendering as though signed in. That
 * did not matter while every page was a read-only view that would 401 on its
 * next request. It matters to the built-in Copilot panel, whose host contract
 * requires the fact ("who is signed in now, or nobody") rather than the
 * mechanism, and whose whole point is that it holds a live session.
 *
 * The `storage` event is not delivered to the tab that made the change, which
 * is exactly right: that tab already knows, and `onAuthCleared` covers it.
 */
import { STORAGE_KEY_PREFIX } from '../storage';
import type { AuthState } from './types';

/** The physical `localStorage` key the storage adapter writes the session to. */
export const AUTH_STATE_STORAGE_KEY = `${STORAGE_KEY_PREFIX}authState`;

/** What another tab now holds: a session, or nobody. */
export type CrossTabAuthChange = AuthState | null;

function parseAuthState(raw: string | null): AuthState | null {
  if (raw === null) return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object') return null;
    const state = parsed as Partial<AuthState>;
    // A row with no user is not a session anyone can act as. Treat it as
    // signed out rather than handing a caller a half-built identity.
    if (!state.user || typeof state.user.user_id !== 'string') return null;
    return state as AuthState;
  } catch {
    return null;
  }
}

/**
 * Call `onChange` when another tab signs in, signs out, or switches account.
 *
 * Returns an unsubscribe. `null` means signed out — including
 * `localStorage.clear()`, which arrives as an event with a null `key` and must
 * not be mistaken for "some unrelated key changed".
 */
export function subscribeCrossTabAuthState(
  onChange: (state: CrossTabAuthChange) => void,
): () => void {
  if (typeof window === 'undefined') return () => {};

  const handler = (event: StorageEvent) => {
    if (event.key === null) {
      // Whole-store clear in another tab: the session is gone with it.
      onChange(null);
      return;
    }
    if (event.key !== AUTH_STATE_STORAGE_KEY) return;
    onChange(parseAuthState(event.newValue));
  };

  window.addEventListener('storage', handler);
  return () => window.removeEventListener('storage', handler);
}
