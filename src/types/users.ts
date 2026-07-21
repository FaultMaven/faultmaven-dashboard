/**
 * User-management types — sourced from the OpenAPI-generated contract.
 *
 * The admin user-management surface (`GET /api/v1/admin/users`) returns
 * `AdminUserListResponse` / `AdminUserListItem`. The previous hand-written
 * `UserProfile` drifted from that shape (`total_count` vs `total`,
 * `display_name` vs `full_name`, an `is_admin` boolean instead of `roles`,
 * `last_active_at` vs `last_login_at`, plus a `username` the endpoint never
 * sends), which broke the user count, the names/roles columns, and threw in the
 * search box on the missing `username`. These now alias the generated schema.
 */
import type { components } from './api.generated';

export type DashboardRoleValue = 'admin' | 'user';

/** A row in the admin user list — the real backend shape. */
export type UserProfile = components['schemas']['AdminUserListItem'];

/** Paginated admin user list (`total` / `limit` / `offset`). */
export type UserListResponse = components['schemas']['AdminUserListResponse'];

// ==================== Frontend-only request DTOs ====================
// No generated counterpart — these are dashboard-originated write payloads.

export interface UserInviteRequest {
  email: string;
  username: string;
  role: DashboardRoleValue;
}

export interface UserRoleUpdate {
  role: DashboardRoleValue;
}
