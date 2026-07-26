import { makeAuthenticatedRequest, buildQueryParams } from '../knowledge/client';
import { handleAPIResponse } from '../knowledge/errors';
import type {
  AdminCaseContentResponse,
  AdminCaseMessagesResponse,
  BreakGlassGrant,
  CaseMessage,
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
 *
 * Pages through every chunk, exactly as the owner-facing `getCaseMessages`
 * does. The endpoint defaults to 50 messages and caps a request at 100, so a
 * single unparameterised call would silently hand an operator the first 50
 * turns of a long investigation while the owner sees all of them — which would
 * break the very guarantee the shared `TranscriptView` exists to hold. Reviewing
 * a truncated transcript is worse than being refused one: it looks complete.
 *
 * The envelope (`access`, `grant`) comes from the first page; every page is
 * gated identically, so it cannot differ between them.
 */
export async function openAdminCaseTranscript(
  caseId: string
): Promise<AdminCaseMessagesResponse> {
  const pageSize = 100; // backend per-request cap (le=100)
  const messages: CaseMessage[] = [];
  let envelope: AdminCaseMessagesResponse | null = null;
  let totalCount = 0;

  for (let offset = 0; ; offset += pageSize) {
    const queryString = buildQueryParams({ limit: pageSize, offset });
    const response = await makeAuthenticatedRequest(
      `${ADMIN_CASES_BASE}/${caseId}/messages?${queryString}`
    );
    await handleAPIResponse(response, 'Failed to open case transcript');
    const page: AdminCaseMessagesResponse = await response.json();

    envelope ??= page;
    messages.push(...page.messages.messages);
    totalCount = page.messages.total_count;

    // Stop on a short page or once the advertised total is collected. The
    // short-page guard also prevents an infinite loop if `total_count` is ever
    // stale or larger than the real message count.
    if (page.messages.messages.length < pageSize || messages.length >= totalCount) {
      break;
    }
  }

  return {
    access: envelope!.access,
    grant: envelope!.grant,
    messages: {
      messages,
      total_count: totalCount,
      retrieved_count: messages.length,
      has_more: false,
    },
  };
}
