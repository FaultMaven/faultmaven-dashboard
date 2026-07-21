import { useCallback, useEffect, useSyncExternalStore } from 'react';
import { authManager, getAvailableScopes, type PublishableScope } from '../lib/auth';

interface State {
  scopes: PublishableScope[];
  loading: boolean;
  error: string | null;
}

const ALWAYS_AVAILABLE: PublishableScope[] = ['personal', 'global'];

// Process-wide store for the current user's publishable KB scopes.
//
// Held in a small external store (consumed via useSyncExternalStore) rather than
// per-component state so every consumer shares one fetch AND so the cache can be
// evicted centrally on identity change. `state` is replaced (never mutated) on
// change, so its reference is a stable snapshot between updates.
let state: State = { scopes: ALWAYS_AVAILABLE, loading: true, error: null };
let inFlight: Promise<void> | null = null;
const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) listener();
}

function setState(next: State): void {
  state = next;
  emit();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot(): State {
  return state;
}

async function loadScopes(): Promise<void> {
  if (inFlight) return inFlight;
  inFlight = (async () => {
    try {
      const scopes = await getAvailableScopes();
      setState({ scopes, loading: false, error: null });
    } catch (e) {
      setState({
        scopes: state.scopes ?? ALWAYS_AVAILABLE,
        loading: false,
        error: e instanceof Error ? e.message : 'Failed to load scopes',
      });
    } finally {
      inFlight = null;
    }
  })();
  return inFlight;
}

/**
 * Reset the scope cache to its unfetched baseline so the next consumer refetches
 * for the CURRENT identity.
 *
 * Cross-user residue guard (same class as copilot #164): the previous design
 * cached scopes process-wide and never evicted them, so after a logout +
 * different-user login the new user briefly saw the previous user's publishable
 * scopes. This is wired to AuthManager's auth-cleared event (logout / refresh
 * hard-fail) and called explicitly on a fresh login.
 */
export function invalidateAvailableScopes(): void {
  inFlight = null;
  setState({ scopes: ALWAYS_AVAILABLE, loading: true, error: null });
}

// Evict cached scopes whenever auth state is cleared. Registered once at module
// load for the app lifetime; the store outlives any individual component.
authManager.onAuthCleared(invalidateAvailableScopes);

/**
 * Hook returning the KB scopes the current user can publish to.
 *
 * Shares one process-wide fetch across consumers. Refetches when the window
 * regains focus so a user added to a team mid-session sees the new option
 * without a full reload, and is evicted on identity change (see
 * invalidateAvailableScopes).
 */
export function useAvailableScopes(): State & { refetch: () => Promise<void> } {
  const snapshot = useSyncExternalStore(subscribe, getSnapshot);

  useEffect(() => {
    // Kick off the initial (or post-invalidation) fetch. loadScopes dedupes via
    // inFlight, so concurrent consumers share a single request.
    if (snapshot.loading) {
      void loadScopes();
    }
    const onFocus = () => void loadScopes();
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [snapshot.loading]);

  const refetch = useCallback(() => loadScopes(), []);

  return { ...snapshot, refetch };
}
