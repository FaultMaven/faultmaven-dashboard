/**
 * Reading what another tab did to the shared session.
 *
 * The Dashboard's cross-tab channel has always been shared `localStorage`: the
 * storage adapter is localStorage-backed, so every tab of an origin reads and
 * writes one `faultmaven_authState`. That is why AuthManager needs no
 * BroadcastChannel to hand a rotated token between tabs (#48) — the write IS
 * the message.
 *
 * This module is only the READER. What a change MEANS, and what to do about it,
 * belongs to `AuthManager`: it owns the token chain, the storage key and the
 * rotation, and it is the only thing that knows which identity this tab holds.
 * Splitting the decision across two subscribers is what let a cross-tab
 * sign-out reach the panel twice and an account switch reach it not at all.
 */
import { authLocalStore, STORAGE_KEY_PREFIX } from '../storage';
import type { AuthState } from './types';

/** The physical `localStorage` key the storage adapter writes the session to. */
export const AUTH_STATE_STORAGE_KEY = `${STORAGE_KEY_PREFIX}authState`;

/** What another tab's write says the session is now. */
export type CrossTabAuthState = AuthState | null;

/**
 * Decode a cross-tab row THROUGH THE ADAPTER that wrote it.
 *
 * Hand-parsing here is how the reader came to disagree with the writer: the
 * adapter JSON-encodes every value, and a second decoder is a second set of
 * assumptions about that. A row with no user is not a session anyone can act
 * as, so it reads as signed out rather than as a half-built identity.
 */
export function decodeCrossTabAuthState(raw: string | null): CrossTabAuthState {
  const { present, value } = authLocalStore.decode(raw);
  if (!present || !value || typeof value !== 'object') return null;
  const state = value as Partial<AuthState>;
  if (!state.user || typeof state.user.user_id !== 'string') return null;
  return state as AuthState;
}

/**
 * Call `onChange` when ANOTHER tab writes or clears the session.
 *
 * Returns an unsubscribe. `null` means signed out — including
 * `localStorage.clear()`, which arrives as an event with a null `key` and must
 * not be mistaken for "some unrelated key changed".
 *
 * The `storage` event is not delivered to the tab that made the change, which
 * is exactly right: that tab already knows.
 */
export function subscribeCrossTabAuthState(
  onChange: (state: CrossTabAuthState) => void,
): () => void {
  if (typeof window === 'undefined') return () => {};

  const handler = (event: StorageEvent) => {
    if (event.key === null) {
      // Whole-store clear in another tab: the session went with it.
      onChange(null);
      return;
    }
    if (event.key !== AUTH_STATE_STORAGE_KEY) return;
    onChange(decodeCrossTabAuthState(event.newValue));
  };

  window.addEventListener('storage', handler);
  return () => window.removeEventListener('storage', handler);
}
