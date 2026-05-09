import { useCallback, useEffect, useState } from 'react';
import { getAvailableScopes, type PublishableScope } from '../lib/auth';

interface State {
  scopes: PublishableScope[];
  loading: boolean;
  error: string | null;
}

let cached: PublishableScope[] | null = null;

const ALWAYS_AVAILABLE: PublishableScope[] = ['personal', 'global'];

/**
 * Hook returning the KB scopes the current user can publish to.
 *
 * Cached process-wide for the session. Refetches when the window regains
 * focus so a user who was added to a team mid-session sees the new option
 * without a full reload.
 */
export function useAvailableScopes(): State & { refetch: () => Promise<void> } {
  const [state, setState] = useState<State>({
    scopes: cached ?? ALWAYS_AVAILABLE,
    loading: cached === null,
    error: null,
  });

  const fetchScopes = useCallback(async () => {
    try {
      const scopes = await getAvailableScopes();
      cached = scopes;
      setState({ scopes, loading: false, error: null });
    } catch (e) {
      setState({
        scopes: cached ?? ALWAYS_AVAILABLE,
        loading: false,
        error: e instanceof Error ? e.message : 'Failed to load scopes',
      });
    }
  }, []);

  useEffect(() => {
    if (cached === null) {
      void fetchScopes();
    }
    const onFocus = () => void fetchScopes();
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [fetchScopes]);

  return { ...state, refetch: fetchScopes };
}
