// Billing-organization console DTOs — cloud `GET/PATCH /api/v1/admin/organization*`
// at cloud contract 2.0.0.
//
// An organization answers ONE question: who pays for these accounts (ADR-017
// D5). It carries the plan, the metering and the payer's admin, and it decides
// NOTHING about visibility — two accounts in the same organization with no
// common team see nothing of each other's. Isolation is the enterprise (D1/D2);
// sharing is the team (D4), on its own page.
//
// Hand-written rather than generated: this repository generates its client from
// the CORE contract, and these four shapes belong to the cloud module's own
// contract. `enterprise_id` is on the two response shapes because cloud 2.0.0
// publishes it there, named separately from `organization_id` so the two tiers
// are never read as one.

/**
 * An organization's MANAGEMENT roles.
 *
 * These are the organization's own vocabulary for who may administer members
 * and payment — nothing more. They gated data visibility once; under ADR-017 D5
 * they no longer do, which they never should have.
 */
export type OrgManagementRole = 'admin' | 'member' | 'viewer';

export const ORG_MANAGEMENT_ROLES: OrgManagementRole[] = ['admin', 'member', 'viewer'];

export interface Organization {
  /** The billing subject. */
  organization_id: string;
  /** The enterprise this organization belongs to — the isolation tenant (D1). */
  enterprise_id: string;
  name: string;
  slug: string;
  description?: string | null;
  member_count: number;
}

export interface OrganizationMember {
  user_id: string;
  /** The organization this membership bills to. */
  organization_id: string;
  /** The enterprise both the member and the organization are anchored to. */
  enterprise_id: string;
  /** Management role; null if the stored role id is unknown to the backend. */
  role: OrgManagementRole | null;
  /** ISO-8601 timestamp. */
  joined_at: string;
}

export interface UpdateOrganizationRequest {
  name?: string;
  description?: string;
}

/** Add an EXISTING account of the same enterprise to the organization. */
export interface AddMemberRequest {
  email?: string;
  username?: string;
  role: OrgManagementRole;
}

export interface SetMemberRoleRequest {
  role: OrgManagementRole;
}
