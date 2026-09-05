import { makeAuthenticatedRequest, buildQueryParams } from '../knowledge/client';
import { handleAPIResponse } from '../knowledge/errors';
import type { UserListResponse, UserRoleUpdate } from '../../types/users';

const USERS_BASE = '/api/v1/admin/users';

/**
 * List all users on the platform (`GET /api/v1/admin/users`).
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
 * Set a user's admin membership to match the Dashboard's two-value role model
 * (`admin` / `user`), against the real backend RBAC endpoints:
 *   - promote → `POST /admin/users/{id}/roles` with `{role:'admin'}`
 *   - demote  → `DELETE /admin/users/{id}/roles/admin`
 *
 * Both write the ORGANIZATION-SCOPED role axis (`admin | member | viewer`) and
 * only that axis: roles on other axes — `platform_admin`, the base `user`
 * marker — are preserved, so neither call can strip a deployment operator's
 * cross-tenant reach (faultmaven#706). The Dashboard only distinguishes admin
 * from non-admin, so a demote drops `admin` and, when that empties the org
 * axis, the backend settles the user at the minimum-privilege `viewer`.
 *
 * Both writes revoke the target's JWTs server-side. The caller cannot change
 * their own role (403), and cannot address a user outside their own
 * organization (404, indistinguishable from an id that names nobody).
 */
export async function updateUserRole(
  userId: string,
  update: UserRoleUpdate
): Promise<void> {
  if (update.role === 'admin') {
    const response = await makeAuthenticatedRequest(`${USERS_BASE}/${userId}/roles`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role: 'admin' }),
    });
    await handleAPIResponse(response, 'Failed to update user role');
    return;
  }

  const response = await makeAuthenticatedRequest(`${USERS_BASE}/${userId}/roles/admin`, {
    method: 'DELETE',
  });
  await handleAPIResponse(response, 'Failed to update user role');
}

/**
 * Deactivate a user (`POST /admin/users/{id}/deactivate`): sets `is_active=false`
 * and revokes all their JWT tokens. This is the platform's "remove access"
 * action — provisioning/removal proper moves to the IdP/SCIM (D3). Admins cannot
 * deactivate themselves (backend 403).
 */
export async function deactivateUser(userId: string): Promise<void> {
  const response = await makeAuthenticatedRequest(`${USERS_BASE}/${userId}/deactivate`, {
    method: 'POST',
  });
  await handleAPIResponse(response, 'Failed to deactivate user');
}
