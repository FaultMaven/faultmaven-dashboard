import { useCallback, useEffect, useSyncExternalStore } from 'react';
import { getCapabilities } from '../lib/meta';
import type { MetaCapabilities } from '../types/meta';

interface State {
  capabilities: MetaCapabilities | null;
  loading: boolean;
  error: string | null;
}

// Process-wide store for the backend's advertised capabilities, mirroring
// useAvailableScopes: capabilities are deployment-wide (identical for every
// user), so one shared fetch serves all consumers. `state` is replaced (never
// mutated) on change, so its reference is a stable snapshot between updates.
//
// No identity-change eviction (unlike useAvailableScopes): capabilities carry
// no per-user data, so a logout + different-user login sees the same, correct,
// public capability set.
let state: State = { capabilities: null, loading: true, error: null };
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

async function loadCapabilities(): Promise<void> {
  if (inFlight) return inFlight;
  inFlight = (async () => {
    try {
      const capabilities = await getCapabilities();
      setState({ capabilities, loading: false, error: null });
    } catch (e) {
      setState({
        capabilities: state.capabilities,
        loading: false,
        error: e instanceof Error ? e.message : 'Failed to load capabilities',
      });
    } finally {
      inFlight = null;
    }
  })();
  return inFlight;
}

export interface Capabilities {
  /**
   * Org/Team management console (ADR-010 D7). True only when the backend has a
   * live TeamService (Cloud multi-tenancy, ADR-010 P2); false in standalone and
   * pre-P2 cloud. The console nav item + route gate on this.
   */
  managementConsole: boolean;
  /** Team-based KB/case sharing (ADR-013). Same TeamService signal. */
  teamSharing: boolean;
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

/**
 * Hook returning the backend's advertised feature capabilities.
 *
 * Shares one process-wide fetch across consumers and refetches on window focus
 * so a deployment that activates multi-tenancy mid-session surfaces the console
 * without a full reload. Unknown/missing flags read as `false` (feature off).
 */
export function useCapabilities(): Capabilities {
  const snapshot = useSyncExternalStore(subscribe, getSnapshot);

  useEffect(() => {
    // Fetch on first mount, and retry on a later mount (e.g. navigation) if a
    // prior fetch errored — otherwise a one-off failure would leave a legit
    // admin without the console until they refocus the tab. Read the module
    // `state` (not the reactive snapshot) so this stays a mount-only effect:
    // loadCapabilities dedupes via `inFlight`, so a persistent failure re-fetches
    // at most once per mount rather than spinning.
    if (state.capabilities === null || state.error !== null) {
      void loadCapabilities();
    }
    const onFocus = () => void loadCapabilities();
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, []);

  const refetch = useCallback(() => loadCapabilities(), []);
  const features = snapshot.capabilities?.features;

  return {
    managementConsole: features?.managementConsole === true,
    teamSharing: features?.teamSharing === true,
    loading: snapshot.loading,
    error: snapshot.error,
    refetch,
  };
}
