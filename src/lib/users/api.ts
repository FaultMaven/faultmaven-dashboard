import { makeAuthenticatedRequest, buildQueryParams } from '../knowledge/client';
import { handleAPIResponse } from '../knowledge/errors';
import type {
  UserProfile,
  UserListResponse,
  UserInviteRequest,
  UserRoleUpdate,
} from '../../types/users';

// [PENDING: backend endpoint] — All user management endpoints require new
// backend implementation. Currently only available via CLI scripts.
// See dashboard-phase1-specification.md §9 Backend Gaps.
const USERS_BASE = '/api/v1/admin/users';

/**
 * List all users on the platform.
 *
 * [PENDING: backend endpoint]
 */
export async function listUsers(
  page = 0,
  pageSize = 50,
  search?: string
): Promise<UserListResponse> {
  // The backend admin-users endpoint paginates by limit/offset (mirrors the
  // case list). FastAPI silently drops unknown params, so the old page/page_size
  // returned the same first slice for every page.
  const params: Record<string, string | number | undefined> = {
    limit: pageSize,
    offset: page * pageSize,
    ...(search && { search }),
  };

  const queryString = buildQueryParams(params);
  const url = `${USERS_BASE}${queryString ? `?${queryString}` : ''}`;

  const response = await makeAuthenticatedRequest(url);
  await handleAPIResponse(response, 'Failed to list users');
  return response.json();
}

/**
 * Invite a new user to the platform.
 *
 * [PENDING: backend endpoint]
 */
export async function inviteUser(request: UserInviteRequest): Promise<UserProfile> {
  const response = await makeAuthenticatedRequest(USERS_BASE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
  });
  await handleAPIResponse(response, 'Failed to invite user');
  return response.json();
}

/**
 * Update a user's role.
 *
 * [PENDING: backend endpoint]
 */
export async function updateUserRole(
  userId: string,
  update: UserRoleUpdate
): Promise<void> {
  const response = await makeAuthenticatedRequest(`${USERS_BASE}/${userId}/role`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(update),
  });
  await handleAPIResponse(response, 'Failed to update user role');
}

/**
 * Remove a user from the platform.
 *
 * [PENDING: backend endpoint]
 */
export async function removeUser(userId: string): Promise<void> {
  const response = await makeAuthenticatedRequest(`${USERS_BASE}/${userId}`, {
    method: 'DELETE',
  });
  await handleAPIResponse(response, 'Failed to remove user');
}
