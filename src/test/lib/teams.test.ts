// Teams API tests — the read-only team listing (ADR-013 §D4).

import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../../lib/knowledge/client', async () => {
  const actual = await vi.importActual<typeof import('../../lib/knowledge/client')>(
    '../../lib/knowledge/client'
  );
  return { ...actual, makeAuthenticatedRequest: vi.fn() };
});
vi.mock('../../lib/knowledge/errors', () => ({ handleAPIResponse: vi.fn() }));

import { makeAuthenticatedRequest } from '../../lib/knowledge/client';
import { listTeams } from '../../lib/teams/api';

const mockRequest = makeAuthenticatedRequest as ReturnType<typeof vi.fn>;

describe('listTeams', () => {
  beforeEach(() => vi.clearAllMocks());

  it('GETs /api/v1/teams and returns the roster', async () => {
    const teams = [
      { team_id: 't1', name: 'SRE', description: null, organization_id: 'o1' },
      { team_id: 't2', name: 'Platform', description: 'infra', organization_id: 'o1' },
    ];
    mockRequest.mockResolvedValueOnce({ json: async () => teams });

    const res = await listTeams();

    expect(mockRequest).toHaveBeenCalledWith('/api/v1/teams');
    expect(res).toEqual(teams);
  });

  it('returns an empty roster (standalone has no teams)', async () => {
    mockRequest.mockResolvedValueOnce({ json: async () => [] });

    const res = await listTeams();

    expect(res).toEqual([]);
  });
});
