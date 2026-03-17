export type DashboardRoleValue = 'admin' | 'user';

export interface UserProfile {
  user_id: string;
  username: string;
  email: string;
  display_name: string;
  roles: DashboardRoleValue[];
  is_admin: boolean;
  is_active: boolean;
  created_at: string;
  last_active_at: string | null;
  organization_id: string | null;
}

export interface UserListResponse {
  users: UserProfile[];
  total_count: number;
}

export interface UserInviteRequest {
  email: string;
  username: string;
  role: DashboardRoleValue;
}

export interface UserRoleUpdate {
  role: DashboardRoleValue;
}
