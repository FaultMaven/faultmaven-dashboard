// The team-and-invitation client — core `/api/v1/teams` + `/api/v1/invitations`
// (contract 3.1.0, amended by 3.4.0).
//
// A team is the ENTERPRISE's sharing unit and forms by consent (ADR-017 D4):
// any account may create one and is its team admin, the admin offers an address
// a place, and the invitee's own accept is the only call here that creates a
// membership. A pending invitation grants nothing.
//
// There is no organization on this surface. The cloud `/admin/teams` console
// this module used to also carry was deleted in cloud contract 2.0.0 — a
// billing admin has no standing over a team (ADR-017 D2), and core publishes no
// rename, no eviction and no operator delete to replace it.
//
// Refusals arrive as `{error, detail, status_code, reason}`; read the slug with
// `teamRefusalReason` and render `detail` when there is none.

import { makeAuthenticatedRequest } from '../knowledge/client';
import { handleAPIResponse } from '../knowledge/errors';
import type {
  CreateTeamRequest,
  Invitation,
  InvitationCreateRequest,
  Team,
  TeamMember,
} from '../../types/teams';

const TEAMS_BASE = '/api/v1/teams';
const INVITATIONS_BASE = '/api/v1/invitations';

const JSON_HEADERS = { 'Content-Type': 'application/json' };

/**
 * The teams the caller belongs to.
 *
 * Also resolves team ids to names for case share badges and the share-to-team
 * picker. Empty in standalone, where there is nobody to share with.
 */
export async function listTeams(): Promise<Team[]> {
  const response = await makeAuthenticatedRequest(TEAMS_BASE);
  await handleAPIResponse(response, 'Failed to list teams');
  return response.json();
}

/**
 * Create a team in the caller's enterprise; the caller becomes its team admin.
 *
 * 409 `team_name_taken` for a live duplicate. The name index is partial on
 * `deleted_at IS NULL`, so a retired team frees its own name.
 */
export async function createTeam(body: CreateTeamRequest): Promise<Team> {
  const response = await makeAuthenticatedRequest(TEAMS_BASE, {
    method: 'POST',
    headers: JSON_HEADERS,
    body: JSON.stringify(body),
  });
  await handleAPIResponse(response, 'Failed to create team');
  return response.json();
}

/** The roster, readable by the team's own members. */
export async function listTeamMembers(teamId: string): Promise<TeamMember[]> {
  const response = await makeAuthenticatedRequest(
    `${TEAMS_BASE}/${encodeURIComponent(teamId)}/members`
  );
  await handleAPIResponse(response, 'Failed to load team members');
  return response.json();
}

/**
 * Leave a team.
 *
 * The only membership write on this surface besides accepting an invitation:
 * there is no eviction, because a team is consensual in both directions. 409
 * `last_admin_cannot_leave` while other members remain; the sole member leaving
 * retires the team and closes its pending offers.
 */
export async function leaveTeam(teamId: string): Promise<void> {
  const response = await makeAuthenticatedRequest(
    `${TEAMS_BASE}/${encodeURIComponent(teamId)}/members/me`,
    { method: 'DELETE' }
  );
  await handleAPIResponse(response, 'Failed to leave the team');
}

/**
 * Offer an address a place on the team (team admin).
 *
 * Decided by email DOMAIN, before any account lookup, so this endpoint is not
 * an account-existence oracle: a personal enterprise invites nobody
 * (`enterprise_is_personal`), and an address off the enterprise's domain is
 * refused identically to one whose account is anchored elsewhere
 * (`address_outside_enterprise_domain`). There is no difference to infer.
 */
export async function inviteToTeam(
  teamId: string,
  body: InvitationCreateRequest
): Promise<Invitation> {
  const response = await makeAuthenticatedRequest(
    `${TEAMS_BASE}/${encodeURIComponent(teamId)}/invitations`,
    { method: 'POST', headers: JSON_HEADERS, body: JSON.stringify(body) }
  );
  await handleAPIResponse(response, 'Failed to send the invitation');
  return response.json();
}

/** Every offer this team has issued and what became of it (team admin). */
export async function listTeamInvitations(teamId: string): Promise<Invitation[]> {
  const response = await makeAuthenticatedRequest(
    `${TEAMS_BASE}/${encodeURIComponent(teamId)}/invitations`
  );
  await handleAPIResponse(response, 'Failed to load invitations');
  return response.json();
}

/**
 * Withdraw an offer (team admin).
 *
 * 410 `invitation_expired` if the offer had already elapsed — expiry is lazy
 * and settled through one reader, so an elapsed offer is recorded as `expired`
 * rather than as a withdrawal nobody performed.
 */
export async function revokeTeamInvitation(
  teamId: string,
  invitationId: string
): Promise<void> {
  const response = await makeAuthenticatedRequest(
    `${TEAMS_BASE}/${encodeURIComponent(teamId)}/invitations/${encodeURIComponent(invitationId)}`,
    { method: 'DELETE' }
  );
  await handleAPIResponse(response, 'Failed to withdraw the invitation');
}

/**
 * The live offers addressed to me — by account id, or by my address while the
 * offer predates my account.
 */
export async function listMyInvitations(): Promise<Invitation[]> {
  const response = await makeAuthenticatedRequest(INVITATIONS_BASE);
  await handleAPIResponse(response, 'Failed to load your invitations');
  return response.json();
}

/**
 * Consent — the only call on this API that creates a team membership.
 *
 * 410 `invitation_expired` once the offer has elapsed.
 */
export async function acceptInvitation(invitationId: string): Promise<Invitation> {
  const response = await makeAuthenticatedRequest(
    `${INVITATIONS_BASE}/${encodeURIComponent(invitationId)}/accept`,
    { method: 'POST' }
  );
  await handleAPIResponse(response, 'Failed to accept the invitation');
  return response.json();
}

/** Decline. Recorded, so the team admin sees the answer. */
export async function declineInvitation(invitationId: string): Promise<void> {
  const response = await makeAuthenticatedRequest(
    `${INVITATIONS_BASE}/${encodeURIComponent(invitationId)}`,
    { method: 'DELETE' }
  );
  await handleAPIResponse(response, 'Failed to decline the invitation');
}
