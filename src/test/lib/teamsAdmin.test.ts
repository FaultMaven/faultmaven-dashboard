// Team admin console client tests (/api/v1/admin/teams/*, U13b).

import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../../lib/knowledge/client', async () => {
  const actual = await vi.importActual<typeof import('../../lib/knowledge/client')>(
    '../../lib/knowledge/client'
  );
  return { ...actual, makeAuthenticatedRequest: vi.fn() };
});
vi.mock('../../lib/knowledge/errors', () => ({ handleAPIResponse: vi.fn() }));

import { makeAuthenticatedRequest } from '../../lib/knowledge/client';
import {
  listAdminTeams,
  createTeam,
  updateTeam,
  deleteTeam,
  listTeamMembers,
  addTeamMember,
  removeTeamMember,
} from '../../lib/teams';

const mockRequest = makeAuthenticatedRequest as ReturnType<typeof vi.fn>;
const jsonResponse = (body: unknown) => ({ json: async () => body });

describe('team admin client', () => {
  beforeEach(() => vi.clearAllMocks());

  it('listAdminTeams GETs the admin base (distinct from read-only /teams)', async () => {
    const teams = [{ team_id: 't1', name: 'SRE', description: null, organization_id: 'o1' }];
    mockRequest.mockResolvedValueOnce(jsonResponse(teams));

    const res = await listAdminTeams();

    expect(mockRequest).toHaveBeenCalledWith('/api/v1/admin/teams');
    expect(res).toEqual(teams);
  });

  it('createTeam POSTs name + description', async () => {
    const team = { team_id: 't2', name: 'Platform', description: 'infra', organization_id: 'o1' };
    mockRequest.mockResolvedValueOnce(jsonResponse(team));

    await createTeam({ name: 'Platform', description: 'infra' });

    expect(mockRequest).toHaveBeenCalledWith('/api/v1/admin/teams', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Platform', description: 'infra' }),
    });
  });

  it('updateTeam PATCHes /{id}', async () => {
    const team = { team_id: 't2', name: 'Renamed', description: null, organization_id: 'o1' };
    mockRequest.mockResolvedValueOnce(jsonResponse(team));

    await updateTeam('t2', { name: 'Renamed' });

    expect(mockRequest).toHaveBeenCalledWith('/api/v1/admin/teams/t2', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Renamed' }),
    });
  });

  it('deleteTeam DELETEs /{id}', async () => {
    mockRequest.mockResolvedValueOnce(jsonResponse(undefined));

    await deleteTeam('t2');

    expect(mockRequest).toHaveBeenCalledWith('/api/v1/admin/teams/t2', { method: 'DELETE' });
  });

  it('listTeamMembers GETs /{id}/members', async () => {
    const members = [{ user_id: 'u1', team_id: 't1', team_role: null }];
    mockRequest.mockResolvedValueOnce(jsonResponse(members));

    const res = await listTeamMembers('t1');

    expect(mockRequest).toHaveBeenCalledWith('/api/v1/admin/teams/t1/members');
    expect(res).toEqual(members);
  });

  it('addTeamMember POSTs {user_id} to /{id}/members', async () => {
    mockRequest.mockResolvedValueOnce(jsonResponse(undefined));

    await addTeamMember('t1', 'u3');

    expect(mockRequest).toHaveBeenCalledWith('/api/v1/admin/teams/t1/members', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: 'u3' }),
    });
  });

  it('removeTeamMember DELETEs /{id}/members/{userId}', async () => {
    mockRequest.mockResolvedValueOnce(jsonResponse(undefined));

    await removeTeamMember('t1', 'u3');

    expect(mockRequest).toHaveBeenCalledWith('/api/v1/admin/teams/t1/members/u3', {
      method: 'DELETE',
    });
  });
});
