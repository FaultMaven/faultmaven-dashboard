import { makeAuthenticatedRequest } from '../knowledge/client';
import { handleAPIResponse } from '../knowledge/errors';
import type { Team } from '../../types/cases';

const TEAMS_BASE = '/api/v1/teams';

/**
 * List the Teams the current user belongs to (ADR-013 §D4).
 *
 * Read-only — team management is the Cloud admin surface. Returns an empty
 * array in standalone, where team sharing is unwired. Used to resolve team ids
 * to names (case share badges) and to populate the share-to-team picker.
 */
export async function listTeams(): Promise<Team[]> {
  const response = await makeAuthenticatedRequest(TEAMS_BASE);
  await handleAPIResponse(response, 'Failed to list teams');
  return response.json();
}
