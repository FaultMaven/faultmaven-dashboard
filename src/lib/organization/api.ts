// Organization admin console client (/api/v1/admin/organization/*, U13c cloud).
//
// All routes are scoped server-side to the caller's OWN organization (there is
// no org id in the path). Authority (org admin) is enforced by the backend; this
// client is a convenience surface, not the authority. Cloud-only and inert until
// multi-tenancy is ready (ADR-010 P2) — the routes 503 until then, and the
// console is capability-gated off so callers never reach it pre-P2.

import { makeAuthenticatedRequest } from '../knowledge/client';
import { handleAPIResponse } from '../knowledge/errors';
import type {
  Organization,
  OrganizationMember,
  UpdateOrganizationRequest,
  InviteMemberRequest,
  OrgRole,
} from '../../types/organization';

const ORG_BASE = '/api/v1/admin/organization';

/** Get the caller's organization detail + member count. */
export async function getOrganization(): Promise<Organization> {
  const response = await makeAuthenticatedRequest(ORG_BASE);
  await handleAPIResponse(response, 'Failed to load organization');
  return response.json();
}

/** Edit the organization's name and/or description. */
export async function updateOrganization(
  body: UpdateOrganizationRequest
): Promise<Organization> {
  const response = await makeAuthenticatedRequest(ORG_BASE, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  await handleAPIResponse(response, 'Failed to update organization');
  return response.json();
}

/** List the organization's members with their role names. */
export async function listOrgMembers(): Promise<OrganizationMember[]> {
  const response = await makeAuthenticatedRequest(`${ORG_BASE}/members`);
  await handleAPIResponse(response, 'Failed to load members');
  return response.json();
}

/** v1a "invite": add an existing enterprise user by email OR username. */
export async function inviteOrgMember(
  body: InviteMemberRequest
): Promise<OrganizationMember> {
  const response = await makeAuthenticatedRequest(`${ORG_BASE}/members`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  await handleAPIResponse(response, 'Failed to add member');
  return response.json();
}

/** Change a member's role. */
export async function setOrgMemberRole(
  userId: string,
  role: OrgRole
): Promise<OrganizationMember> {
  const response = await makeAuthenticatedRequest(
    `${ORG_BASE}/members/${encodeURIComponent(userId)}`,
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role }),
    }
  );
  await handleAPIResponse(response, 'Failed to update role');
  return response.json();
}

/** Remove a member from the organization. */
export async function removeOrgMember(userId: string): Promise<void> {
  const response = await makeAuthenticatedRequest(
    `${ORG_BASE}/members/${encodeURIComponent(userId)}`,
    { method: 'DELETE' }
  );
  await handleAPIResponse(response, 'Failed to remove member');
}
