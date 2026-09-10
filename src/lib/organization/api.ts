// Billing-organization console client — cloud `/api/v1/admin/organization*`
// (cloud contract 2.0.0).
//
// Every route is scoped server-side to the caller's OWN organization: there is
// no organization id in any path, and the cloud module resolves it per request
// from the account's membership rather than from a token claim. Authority is
// the organization's management role, enforced by the backend; this client is a
// convenience surface, not the authority.
//
// An organization bills; it does not isolate and it does not share (ADR-017
// D2). Isolation is the enterprise, which the request's own bound context
// already carries, and sharing is the team.

import { makeAuthenticatedRequest } from '../knowledge/client';
import { handleAPIResponse } from '../knowledge/errors';
import type {
  Organization,
  OrganizationMember,
  UpdateOrganizationRequest,
  AddMemberRequest,
  OrgManagementRole,
} from '../../types/organization';

const ORG_BASE = '/api/v1/admin/organization';

/**
 * The caller's billing organization, or `null` when they are in none.
 *
 * **404 is the normal answer**, not an error: an account is in an organization
 * only once somebody pays for it (ADR-017 D5), which today is no beta account
 * at all. Cloud 2.0.0 documents the 404 for exactly this, so it is translated
 * here into the absence it means — a console that surfaced it as a failure
 * would report "something went wrong" to every user of the product.
 *
 * Every other status still throws.
 */
export async function getOrganization(): Promise<Organization | null> {
  const response = await makeAuthenticatedRequest(ORG_BASE);
  if (response.status === 404) return null;
  await handleAPIResponse(response, 'Failed to load the billing organization');
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
  await handleAPIResponse(response, 'Failed to update the organization');
  return response.json();
}

/**
 * The organization's members and their management roles, or `[]` when the
 * caller is in no organization — the same 404 `getOrganization` answers, and
 * the same reason for translating it.
 */
export async function listOrgMembers(): Promise<OrganizationMember[]> {
  const response = await makeAuthenticatedRequest(`${ORG_BASE}/members`);
  if (response.status === 404) return [];
  await handleAPIResponse(response, 'Failed to load the organization members');
  return response.json();
}

/**
 * Add an existing account of the same enterprise to the organization.
 *
 * A billing act: it changes what is metered for that account and what its plan
 * allows, and nothing about what it can see.
 */
export async function addOrgMember(body: AddMemberRequest): Promise<OrganizationMember> {
  const response = await makeAuthenticatedRequest(`${ORG_BASE}/members`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  await handleAPIResponse(response, 'Failed to add the member');
  return response.json();
}

/** Change a member's management role. */
export async function setOrgMemberRole(
  userId: string,
  role: OrgManagementRole
): Promise<OrganizationMember> {
  const response = await makeAuthenticatedRequest(
    `${ORG_BASE}/members/${encodeURIComponent(userId)}`,
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role }),
    }
  );
  await handleAPIResponse(response, 'Failed to update the role');
  return response.json();
}

/** Remove a member from the organization. */
export async function removeOrgMember(userId: string): Promise<void> {
  const response = await makeAuthenticatedRequest(
    `${ORG_BASE}/members/${encodeURIComponent(userId)}`,
    { method: 'DELETE' }
  );
  await handleAPIResponse(response, 'Failed to remove the member');
}
