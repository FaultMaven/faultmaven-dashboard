import { useCallback, useEffect, useMemo, useState } from 'react';
import { listTeams, type Team } from '../lib/api';
import { useAvailableScopes } from './useAvailableScopes';

export interface TeamSharing {
  /**
   * True when the deployment reports the `team` scope — i.e. team sharing is
   * wired (a Cloud collaboration feature) AND the caller belongs to at least
   * one Team. All team UI (badges, filter, share action) gates on this, so it
   * is hidden in standalone and until Cloud multi-tenancy is live.
   */
  enabled: boolean;
  /** Teams the caller belongs to (empty until `enabled`). */
  teams: Team[];
  /** team_id → name, for resolving `shared_team_ids` to labels. */
  teamsById: Map<string, string>;
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

// Cached process-wide for the session, mirroring useAvailableScopes: the team
// roster changes rarely, and both hooks refetch on window focus so a user added
// to a team mid-session sees it without a full reload.
let cachedTeams: Team[] | null = null;

/**
 * Team-sharing capability + the caller's team roster (ADR-013 §D4).
 *
 * `/teams` is only fetched once the `team` scope is reported, so a standalone
 * deployment (no teams) never makes the call.
 */
export function useTeamSharing(): TeamSharing {
  const { scopes, loading: scopesLoading } = useAvailableScopes();
  const enabled = scopes.includes('team');

  const [teams, setTeams] = useState<Team[]>(cachedTeams ?? []);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchTeams = useCallback(async () => {
    setLoading(true);
    try {
      const fetched = await listTeams();
      cachedTeams = fetched;
      setTeams(fetched);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load teams');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!enabled) return;
    if (cachedTeams === null) void fetchTeams();
    const onFocus = () => void fetchTeams();
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [enabled, fetchTeams]);

  const teamsById = useMemo(
    () => new Map(teams.map((t) => [t.team_id, t.name])),
    [teams]
  );

  return {
    enabled,
    teams: enabled ? teams : [],
    teamsById,
    loading: loading || scopesLoading,
    error,
    refetch: fetchTeams,
  };
}
