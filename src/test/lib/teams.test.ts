// The team-and-invitation client — core `/api/v1/teams` + `/api/v1/invitations`
// (contract 3.1.0/3.4.0, ADR-017 D4).
//
// Every assertion here is about the CONSENT surface. The `/admin/teams` console
// this module used to also carry was deleted with cloud contract 2.0.0, and the
// last test in this file is what stops it coming back by accident.

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
  acceptInvitation,
  createTeam,
  declineInvitation,
  inviteToTeam,
  leaveTeam,
  listMyInvitations,
  listTeamInvitations,
  listTeamMembers,
  listTeams,
  revokeTeamInvitation,
} from '../../lib/teams/api';
import * as teamsModule from '../../lib/teams';
import { teamRefusalReason } from '../../types/teams';

const mockRequest = makeAuthenticatedRequest as ReturnType<typeof vi.fn>;
const jsonResponse = (body: unknown) => ({ json: async () => body });

const JSON_HEADERS = { 'Content-Type': 'application/json' };

describe('teams client', () => {
  beforeEach(() => vi.clearAllMocks());

  it('listTeams GETs /api/v1/teams and returns the enterprise-keyed rows', async () => {
    const teams = [
      { team_id: 't1', name: 'SRE', description: null, enterprise_id: 'ent-1' },
      { team_id: 't2', name: 'Platform', description: 'infra', enterprise_id: 'ent-1' },
    ];
    mockRequest.mockResolvedValueOnce(jsonResponse(teams));

    const res = await listTeams();

    expect(mockRequest).toHaveBeenCalledWith('/api/v1/teams');
    expect(res).toEqual(teams);
  });

  it('createTeam POSTs the name and description to /api/v1/teams', async () => {
    const team = { team_id: 't3', name: 'Net', description: null, enterprise_id: 'ent-1' };
    mockRequest.mockResolvedValueOnce(jsonResponse(team));

    const res = await createTeam({ name: 'Net', description: null });

    expect(mockRequest).toHaveBeenCalledWith('/api/v1/teams', {
      method: 'POST',
      headers: JSON_HEADERS,
      body: JSON.stringify({ name: 'Net', description: null }),
    });
    expect(res).toEqual(team);
  });

  it('listTeamMembers GETs the roster and url-encodes the team id', async () => {
    const members = [
      { user_id: 'u1', team_id: 't/1', team_role: 'admin', joined_at: '2026-01-01T00:00:00Z' },
    ];
    mockRequest.mockResolvedValueOnce(jsonResponse(members));

    const res = await listTeamMembers('t/1');

    expect(mockRequest).toHaveBeenCalledWith('/api/v1/teams/t%2F1/members');
    expect(res).toEqual(members);
  });

  it('leaveTeam DELETEs /members/me — the only way out, and only for oneself', async () => {
    mockRequest.mockResolvedValueOnce(jsonResponse(undefined));

    await leaveTeam('t1');

    expect(mockRequest).toHaveBeenCalledWith('/api/v1/teams/t1/members/me', {
      method: 'DELETE',
    });
  });

  it('inviteToTeam POSTs the address to the team invitations collection', async () => {
    const invitation = { invitation_id: 'i1', team_id: 't1', email: 'a@acme.com' };
    mockRequest.mockResolvedValueOnce(jsonResponse(invitation));

    const res = await inviteToTeam('t1', { email: 'a@acme.com' });

    expect(mockRequest).toHaveBeenCalledWith('/api/v1/teams/t1/invitations', {
      method: 'POST',
      headers: JSON_HEADERS,
      body: JSON.stringify({ email: 'a@acme.com' }),
    });
    expect(res).toEqual(invitation);
  });

  it('listTeamInvitations GETs every offer the team issued', async () => {
    const invitations = [{ invitation_id: 'i1', team_id: 't1', status: 'pending' }];
    mockRequest.mockResolvedValueOnce(jsonResponse(invitations));

    const res = await listTeamInvitations('t1');

    expect(mockRequest).toHaveBeenCalledWith('/api/v1/teams/t1/invitations');
    expect(res).toEqual(invitations);
  });

  it('revokeTeamInvitation DELETEs one offer and url-encodes both ids', async () => {
    mockRequest.mockResolvedValueOnce(jsonResponse(undefined));

    await revokeTeamInvitation('t/1', 'i/1');

    expect(mockRequest).toHaveBeenCalledWith('/api/v1/teams/t%2F1/invitations/i%2F1', {
      method: 'DELETE',
    });
  });

  it('listMyInvitations GETs /api/v1/invitations', async () => {
    const invitations = [{ invitation_id: 'i1', team_id: 't1', status: 'pending' }];
    mockRequest.mockResolvedValueOnce(jsonResponse(invitations));

    const res = await listMyInvitations();

    expect(mockRequest).toHaveBeenCalledWith('/api/v1/invitations');
    expect(res).toEqual(invitations);
  });

  it('acceptInvitation POSTs /accept and resolves to the TEAM just joined', async () => {
    // The contract answers 200 `TeamResponse` here, not `InvitationResponse`:
    // once accepted the offer is spent, and the team is what the caller now
    // has. Asserting the resolved value is what keeps the declared type honest
    // — the endpoint's name would otherwise talk anyone into `Invitation`.
    const joined = { team_id: 't1', name: 'SRE', description: null, enterprise_id: 'ent-1' };
    mockRequest.mockResolvedValueOnce(jsonResponse(joined));

    const res = await acceptInvitation('i1');

    expect(mockRequest).toHaveBeenCalledWith('/api/v1/invitations/i1/accept', {
      method: 'POST',
    });
    expect(res).toEqual(joined);
    expect(res.enterprise_id).toBe('ent-1');
    expect(res).not.toHaveProperty('invitation_id');
  });

  it('declineInvitation DELETEs the offer', async () => {
    mockRequest.mockResolvedValueOnce(jsonResponse(undefined));

    await declineInvitation('i1');

    expect(mockRequest).toHaveBeenCalledWith('/api/v1/invitations/i1', {
      method: 'DELETE',
    });
  });

  it('reaches no /admin/teams route at all — cloud 2.0.0 deleted that surface', async () => {
    mockRequest.mockResolvedValue(jsonResponse([]));

    await listTeams();
    await listTeamMembers('t1');
    await listTeamInvitations('t1');
    await listMyInvitations();

    for (const call of mockRequest.mock.calls) {
      expect(String(call[0])).not.toContain('/admin/teams');
    }
  });

  it('exports no team rename, delete, or member-eviction call', () => {
    // Core publishes none of these: a team is retired only when its last member
    // leaves, and nothing lets an admin eject somebody (ADR-017 D4). They are
    // the four open owner decisions from cloud#35, and a client function for one
    // would be a call with no endpoint behind it.
    for (const gone of ['updateTeam', 'deleteTeam', 'addTeamMember', 'removeTeamMember']) {
      expect(teamsModule).not.toHaveProperty(gone);
    }
  });
});

describe('teamRefusalReason', () => {
  it('reads a published slug off the thrown error body', () => {
    expect(teamRefusalReason({ details: { reason: 'already_a_member' } })).toBe('already_a_member');
    expect(teamRefusalReason({ details: { reason: 'invitation_expired' } })).toBe(
      'invitation_expired'
    );
  });

  it('is null for a slug this client does not publish, so the backend sentence wins', () => {
    // A cast rather than a branch: an unknown slug must land on the API's own
    // `detail`, never on a branch written for a different refusal.
    expect(teamRefusalReason({ details: { reason: 'something_new' } })).toBeNull();
  });

  it('is null when there is no reason at all — a 404 carries none by design', () => {
    expect(teamRefusalReason({ details: { detail: 'Not found' } })).toBeNull();
    expect(teamRefusalReason(new Error('boom'))).toBeNull();
    expect(teamRefusalReason(null)).toBeNull();
  });
});
