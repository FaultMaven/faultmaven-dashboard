// Team admin console client (/api/v1/admin/teams/*, U13b cloud).
//
// The management counterpart to the read-only `listTeams()` in ./api.ts (which
// hits `GET /teams` for the caller's own teams). These `/admin/teams` routes let
// an org admin create / rename / delete teams and manage membership across the
// whole organization. Authority (org admin) is enforced by the backend. Cloud-
// only and inert until multi-tenancy is ready (ADR-010 P2) — the routes 503
// until then, and the console is capability-gated off so callers never reach it.

import { makeAuthenticatedRequest } from '../knowledge/client';
import { handleAPIResponse } from '../knowledge/errors';
import type { Team } from '../../types/cases';
import type {
  TeamMember,
  CreateTeamRequest,
  UpdateTeamRequest,
} from '../../types/teams';

const ADMIN_TEAMS_BASE = '/api/v1/admin/teams';

/** List every team in the caller's organization (admin view). */
export async function listAdminTeams(): Promise<Team[]> {
  const response = await makeAuthenticatedRequest(ADMIN_TEAMS_BASE);
  await handleAPIResponse(response, 'Failed to load teams');
  return response.json();
}

/** Create a team in the caller's organization. */
export async function createTeam(body: CreateTeamRequest): Promise<Team> {
  const response = await makeAuthenticatedRequest(ADMIN_TEAMS_BASE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  await handleAPIResponse(response, 'Failed to create team');
  return response.json();
}

/** Rename a team or edit its description. */
export async function updateTeam(
  teamId: string,
  body: UpdateTeamRequest
): Promise<Team> {
  const response = await makeAuthenticatedRequest(
    `${ADMIN_TEAMS_BASE}/${encodeURIComponent(teamId)}`,
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }
  );
  await handleAPIResponse(response, 'Failed to update team');
  return response.json();
}

/** Delete a team (frees its name and clears its shares/members). */
export async function deleteTeam(teamId: string): Promise<void> {
  const response = await makeAuthenticatedRequest(
    `${ADMIN_TEAMS_BASE}/${encodeURIComponent(teamId)}`,
    { method: 'DELETE' }
  );
  await handleAPIResponse(response, 'Failed to delete team');
}

/** List the members of a team. */
export async function listTeamMembers(teamId: string): Promise<TeamMember[]> {
  const response = await makeAuthenticatedRequest(
    `${ADMIN_TEAMS_BASE}/${encodeURIComponent(teamId)}/members`
  );
  await handleAPIResponse(response, 'Failed to load team members');
  return response.json();
}

/** Add an existing organization member to the team (idempotent). */
export async function addTeamMember(
  teamId: string,
  userId: string
): Promise<void> {
  const response = await makeAuthenticatedRequest(
    `${ADMIN_TEAMS_BASE}/${encodeURIComponent(teamId)}/members`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: userId }),
    }
  );
  await handleAPIResponse(response, 'Failed to add team member');
}

/** Remove a member from the team (idempotent). */
export async function removeTeamMember(
  teamId: string,
  userId: string
): Promise<void> {
  const response = await makeAuthenticatedRequest(
    `${ADMIN_TEAMS_BASE}/${encodeURIComponent(teamId)}/members/${encodeURIComponent(userId)}`,
    { method: 'DELETE' }
  );
  await handleAPIResponse(response, 'Failed to remove team member');
}
