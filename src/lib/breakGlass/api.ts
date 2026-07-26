import { makeAuthenticatedRequest, buildQueryParams } from '../knowledge/client';
import { handleAPIResponse } from '../knowledge/errors';
import type {
  AdminCaseContentResponse,
  AdminCaseMessagesResponse,
  BreakGlassGrant,
  BreakGlassGrantListResponse,
} from '../../types/cases';

const GRANTS_BASE = '/api/v1/admin/grants';
const ADMIN_CASES_BASE = '/api/v1/admin/cases';

/**
 * The operator break-glass surface (ADR-012 D9, faultmaven#815).
 *
 * In cloud, reading a tenant's case *content* — title, description, transcript
 * — is not standing access. It requires a grant that names one case, carries a
 * written justification, and lapses on a TTL. In standalone the same endpoints
 * serve the content under standing access, recorded but not gated, because the
 * operator and the data controller are the same party.
 *
 * Which of those happened is read off the response's `access` discriminator, not
 * inferred from this app's notion of the deployment — the same anti-drift rule
 * the `view` discriminator on the operator case list follows.
 */

/**
 * Mint a break-glass grant over one case.
 *
 * `organizationId` comes from the operator case list rather than being looked up
 * from the case: under multi-tenant cloud the case row is unreadable until the
 * request has rebound its RLS scope to that organization. A wrong pair is not a
 * security problem — the subsequent open simply 404s.
 *
 * There is no extend operation, deliberately. Needing longer means requesting a
 * new grant with a fresh reason; the backend pins `expires_at` at the database.
 */
export async function requestBreakGlassGrant(params: {
  caseId: string;
  organizationId: string;
  reason: string;
  ttlMinutes?: number;
}): Promise<BreakGlassGrant> {
  const response = await makeAuthenticatedRequest(GRANTS_BASE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      case_id: params.caseId,
      organization_id: params.organizationId,
      reason: params.reason,
      ...(params.ttlMinutes !== undefined && { ttl_minutes: params.ttlMinutes }),
    }),
  });
  await handleAPIResponse(response, 'Failed to request break-glass access');
  return response.json();
}

/**
 * List break-glass grants.
 *
 * Not scoped to the calling operator, by design: who holds access to a tenant's
 * content, and until when, is the governance question this surface answers.
 */
export async function listBreakGlassGrants(
  filters: { caseId?: string; organizationId?: string; liveOnly?: boolean } = {}
): Promise<BreakGlassGrantListResponse> {
  const queryString = buildQueryParams({
    ...(filters.caseId && { case_id: filters.caseId }),
    ...(filters.organizationId && { organization_id: filters.organizationId }),
    ...(filters.liveOnly && { live_only: 'true' }),
  });
  const response = await makeAuthenticatedRequest(
    `${GRANTS_BASE}${queryString ? `?${queryString}` : ''}`
  );
  await handleAPIResponse(response, 'Failed to list break-glass grants');
  return response.json();
}

/**
 * End a grant before its TTL lapses.
 *
 * Any operator may revoke any grant: shortening access is the safe direction,
 * and requiring ownership would let a grant outlive the only person able to
 * withdraw it.
 */
export async function revokeBreakGlassGrant(grantId: string): Promise<BreakGlassGrant> {
  const response = await makeAuthenticatedRequest(`${GRANTS_BASE}/${grantId}/revoke`, {
    method: 'POST',
  });
  await handleAPIResponse(response, 'Failed to revoke break-glass grant');
  return response.json();
}

/**
 * Open one case's content as an operator.
 *
 * A separate endpoint from `GET /cases/{id}`, which gates on owner ∪
 * shared-to-my-teams with no operator arm — that is why every title link in the
 * standalone All Cases view 404s today (faultmaven#846). This is the audited
 * path that actually answers.
 *
 * Throws in cloud when no live grant covers the case; the thrown message is the
 * backend's, and is the one worth showing.
 */
export async function openAdminCaseContent(caseId: string): Promise<AdminCaseContentResponse> {
  const response = await makeAuthenticatedRequest(`${ADMIN_CASES_BASE}/${caseId}`);
  await handleAPIResponse(response, 'Failed to open case content');
  return response.json();
}

/**
 * Open one case's transcript as an operator. Same gate as the content read — a
 * transcript is content by any reading of D9.
 */
export async function openAdminCaseTranscript(
  caseId: string
): Promise<AdminCaseMessagesResponse> {
  const response = await makeAuthenticatedRequest(`${ADMIN_CASES_BASE}/${caseId}/messages`);
  await handleAPIResponse(response, 'Failed to open case transcript');
  return response.json();
}
