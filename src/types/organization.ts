// Organization admin console DTOs (GET/PATCH /api/v1/admin/organization/*).
//
// The management surface an org admin uses to view their organization and
// manage its membership + roles (ADR-013; U13c cloud API). Cloud-only and inert
// until multi-tenancy is ready (ADR-010 P2).

/** Org membership roles (the three system roles seeded by core migration 029). */
export type OrgRole = 'admin' | 'member' | 'viewer';

export const ORG_ROLES: OrgRole[] = ['admin', 'member', 'viewer'];

export interface Organization {
  organization_id: string;
  name: string;
  slug: string;
  description?: string | null;
  member_count: number;
}

export interface OrganizationMember {
  user_id: string;
  /** Role name; null if the stored role id is unknown to the backend. */
  role: OrgRole | null;
  /** ISO-8601 timestamp. */
  joined_at: string;
}

export interface UpdateOrganizationRequest {
  name?: string;
  description?: string;
}

/** v1a "invite": add an EXISTING enterprise user by email OR username. */
export interface InviteMemberRequest {
  email?: string;
  username?: string;
  role: OrgRole;
}

export interface SetMemberRoleRequest {
  role: OrgRole;
}
