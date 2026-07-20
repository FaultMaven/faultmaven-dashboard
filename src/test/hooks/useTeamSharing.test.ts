import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';

const mockUseAvailableScopes = vi.fn();
vi.mock('../../hooks/useAvailableScopes', () => ({
  useAvailableScopes: () => mockUseAvailableScopes(),
}));

const mockListTeams = vi.fn();
vi.mock('../../lib/api', () => ({
  listTeams: () => mockListTeams(),
}));

import { useTeamSharing } from '../../hooks/useTeamSharing';

const TEAMS = [
  { team_id: 't1', name: 'SRE', organization_id: 'o1' },
  { team_id: 't2', name: 'Platform', organization_id: 'o1' },
];

describe('useTeamSharing (ADR-013 §D4)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockListTeams.mockResolvedValue(TEAMS);
  });

  // NB: the enabled case runs first — the hook caches the roster process-wide
  // (mirroring useAvailableScopes), so the first enabled render is the one that
  // actually fetches.
  it('reports enabled and fetches the roster when the team scope is present', async () => {
    mockUseAvailableScopes.mockReturnValue({
      scopes: ['personal', 'team', 'global'],
      loading: false,
    });

    const { result } = renderHook(() => useTeamSharing());

    await waitFor(() => expect(result.current.teams).toHaveLength(2));
    expect(result.current.enabled).toBe(true);
    expect(mockListTeams).toHaveBeenCalled();
    expect(result.current.teamsById.get('t1')).toBe('SRE');
  });

  it('is disabled and never calls /teams when the team scope is absent', async () => {
    mockUseAvailableScopes.mockReturnValue({
      scopes: ['personal', 'global'],
      loading: false,
    });

    const { result } = renderHook(() => useTeamSharing());

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.enabled).toBe(false);
    expect(result.current.teams).toEqual([]);
    expect(mockListTeams).not.toHaveBeenCalled();
  });
});
