import { makeAuthenticatedRequest, buildQueryParams } from '../knowledge/client';
import { handleAPIResponse } from '../knowledge/errors';
import { startOfLocalDay, exclusiveEndOfLocalDay } from './dateRange';
import type {
  AdminCaseListResult,
  CaseDetail,
  CaseSearchRequest,
  CaseState,
  CaseSummary,
  CaseListResponse,
  CaseFilters,
  CaseMessage,
  CaseMessagesResponse,
  CaseReport,
  CaseUIResponse,
  CaseEvidenceListResponse,
  EvidenceDetails,
  UploadedFilesResponse,
  UploadedFileDetails,
} from '../../types/cases';

const CASES_BASE = '/api/v1/cases';
const ADMIN_CASES_BASE = '/api/v1/admin/cases';

/**
 * List investigation cases with optional filters and pagination.
 *
 * `date_from`/`date_to` are CALENDAR DAYS, as a date picker produces them, and
 * they are resolved HERE into the instants contract 3.8.0 filters on, in the
 * viewer's own timezone. The server's window is HALF-OPEN — `[created_after,
 * created_before)` — so `created_before` is the first instant of the day AFTER
 * `date_to`, and one day selected at both ends is that whole day, microseconds
 * included. See `dateRange.ts` for why the obvious 23:59:59.999 is wrong.
 *
 * A day that is not a real day resolves to `undefined` and is simply not sent,
 * which is the correct reading of a half-typed date input: no bound, rather
 * than a bound the user did not mean.
 */
export async function listCases(
  filters: CaseFilters = {},
  page = 0,
  pageSize = 20
): Promise<CaseListResponse> {
  // The backend paginates by limit/offset (not page/page_size); FastAPI
  // silently drops unknown query params, so sending page/page_size returned the
  // same first slice for every page. Mirror getAdminCases and derive limit/offset.
  const createdAfter = startOfLocalDay(filters.date_from);
  const createdBefore = exclusiveEndOfLocalDay(filters.date_to);
  const params: Record<string, string | number | undefined> = {
    limit: pageSize,
    offset: page * pageSize,
    ...(filters.state && { state: filters.state }),
    ...(filters.source && { source: filters.source }),
    ...(createdAfter && { created_after: createdAfter }),
    ...(createdBefore && { created_before: createdBefore }),
    ...(filters.team_id && { team_id: filters.team_id }),
  };

  const queryString = buildQueryParams(params);
  const url = `${CASES_BASE}${queryString ? `?${queryString}` : ''}`;

  const response = await makeAuthenticatedRequest(url);
  await handleAPIResponse(response, 'Failed to list cases');
  return response.json();
}

/**
 * List cases across ALL users/orgs — the platform-admin cross-tenant view
 * (ADR-012 D9, GET /api/v1/admin/cases). Reachable for a `platform_admin` in
 * CLOUD only (see `canViewAllCases`); the backend enforces the same role.
 *
 * The response is a union discriminated on `view`, and the *deployment* decides
 * which arm arrives. ‼ The `"full"` arm is a statement about the BACKEND, not a
 * reachable client state: standalone still serves it, but this app denies
 * standalone the route, so in practice only `"metadata"` arrives.
 * `"full"` (standalone) carries complete summaries including
 * titles, `"metadata"` (cloud) carries ambient metadata with no title or
 * description keys at all — titles are content and need the audited break-glass
 * path (faultmaven#815). Callers must narrow on `view` rather than on their own
 * notion of the deployment mode, so the two cannot drift.
 *
 * Still 403s under `TENANT_PROVIDER=multi`: row-level security would scope the
 * list to the operator's own organization, so an "all tenants" answer would be
 * silently partial. The backend refuses rather than mislead, and the `detail` it
 * returns is the message worth showing.
 */
export async function getAdminCases(
  filters: CaseFilters = {},
  page = 0,
  pageSize = 20
): Promise<AdminCaseListResult> {
  // The admin endpoint paginates by limit/offset (not page/page_size).
  const params: Record<string, string | number | undefined> = {
    limit: pageSize,
    offset: page * pageSize,
    ...(filters.state && { state: filters.state }),
    ...(filters.source && { source: filters.source }),
  };

  const queryString = buildQueryParams(params);
  const url = `${ADMIN_CASES_BASE}${queryString ? `?${queryString}` : ''}`;

  const response = await makeAuthenticatedRequest(url);
  await handleAPIResponse(response, 'Failed to list all cases');
  return response.json();
}

/**
 * Get full detail for a single case.
 */
export async function getCaseDetail(caseId: string): Promise<CaseDetail> {
  const response = await makeAuthenticatedRequest(`${CASES_BASE}/${caseId}`);
  await handleAPIResponse(response, 'Failed to get case');
  return response.json();
}

/** The narrowing `POST /cases/search` accepts alongside the query. */
export interface CaseSearchOptions {
  /** Cases shared with this Team (ADR-013 §D4). */
  teamId?: string;
  /**
   * One lifecycle state, applied by the server as of contract 3.9.0.
   *
   * Composes with the query rather than thinning the result: the contract is
   * explicit that it is "applied in the same query as the text search, so it
   * constrains what the `limit` returns". Filtering the returned array here
   * instead would silently shrink a 100-match page to whatever share of it
   * happened to be `resolved`, and call that the answer.
   */
  state?: CaseState;
}

/**
 * Search cases by free text query.
 * Returns a flat array of CaseSummary (not wrapped in CaseListResponse).
 *
 * The backend `CaseSearchRequest` supports only a `limit` (max 100, default 20)
 * — it has no `offset`/`page`, so search results cannot be paginated. We fetch
 * up to `limit` matches in a single request and the caller presents them as a
 * single page of "top N matches". Real search pagination requires a backend
 * change (add an offset/cursor to `CaseSearchRequest`); do not fake it here.
 *
 * `state` is sent as of contract **3.9.0** (faultmaven-dashboard#166). Before
 * it, the field was DECLARED on `CaseSearchRequest` and read by nothing: the
 * service took `query`, `user_id`, `limit` and the id allowlists, so
 * `{"query": "db", "state": "resolved"}` answered 200 with resolved and
 * unresolved cases alike — #51 restated one layer down. This client's
 * workaround was to withhold the field and grey the chips out, which was
 * honest but left the control dead. 3.9.0 passes
 * `state=search_request.state` through to the repository, so the field now
 * does what its name says and the workaround is gone.
 *
 * ⚠️ The narrowing options are an OBJECT, not two more positionals. `teamId`
 * and `state` are both strings on the wire, so `searchCases(q, 100, undefined,
 * 'resolved')` and its transposition are a pair a reader cannot tell apart at
 * the call site.
 */
export async function searchCases(
  query: string,
  limit = 100,
  { teamId, state }: CaseSearchOptions = {}
): Promise<CaseSummary[]> {
  // Typed against the GENERATED contract, not an inline literal. This is the
  // one endpoint already bitten by the client and the server disagreeing about
  // a field both of them named, and a body built from a literal is what let
  // that pass every gate. Excess-property checking rejects a key the pinned
  // contract does not declare, so renaming `state` upstream fails `tsc` HERE
  // rather than becoming another silently-dropped filter — which is the whole
  // reason to spend a type on a four-key object.
  // (The rest of this module is still hand-typed — faultmaven-dashboard#165.)
  //
  // ‼ The optional keys are written OUT, not conditionally spread. The obvious
  // `...(state && { state })` compiles clean against a contract with no such
  // field at all: TypeScript does not excess-property-check spread operands,
  // so the guard silently becomes decoration. Measured — renaming `state` to
  // `lifecycle_state` in `api.generated.ts` produced ZERO errors in the spread
  // form and an immediate one in this form. `JSON.stringify` omits `undefined`
  // values, so the bytes on the wire are identical either way; only the
  // compiler can tell them apart.
  //
  // ‼ `|| undefined` is NOT redundant, and dropping it is how the first cut of
  // this went wrong. The spread form it replaced was `...(teamId && {...})`,
  // which omitted an EMPTY STRING; a bare `team_id: teamId` sends `""`. Today
  // the backend's `if search_request.team_id:` treats that as no filter, so
  // nothing breaks — but that is Python falsiness absorbing a value we should
  // not have sent, exactly the "`if x:` fails open" shape this codebase has
  // been bitten by, and the contract types the field `string | null` with no
  // mention of `""`. Send the field or do not; do not send a blank one.
  const body: CaseSearchRequest = {
    query,
    limit,
    team_id: teamId || undefined,
    state: state || undefined,
  };

  const response = await makeAuthenticatedRequest(`${CASES_BASE}/search`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  await handleAPIResponse(response, 'Failed to search cases');
  return response.json();
}

/**
 * Share a case with a Team (ADR-013 §D4). Owner-only and the Team must be one
 * the caller belongs to; the backend enforces both (403 otherwise). Idempotent —
 * re-sharing an already-shared case is a no-op. Cloud-only: standalone has no
 * teams, so the backend returns a clear "not available".
 */
export async function shareCaseWithTeam(caseId: string, teamId: string): Promise<void> {
  const response = await makeAuthenticatedRequest(`${CASES_BASE}/${caseId}/team-shares`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ team_id: teamId }),
  });
  await handleAPIResponse(response, 'Failed to share case with team');
}

/**
 * Remove a case's share to a Team (ADR-013 §D4). Owner-only. No body is
 * returned (204); a 404 means the case was not shared with that Team.
 */
export async function unshareCaseFromTeam(caseId: string, teamId: string): Promise<void> {
  const response = await makeAuthenticatedRequest(
    `${CASES_BASE}/${caseId}/team-shares/${teamId}`,
    { method: 'DELETE' }
  );
  await handleAPIResponse(response, 'Failed to unshare case from team');
}

/**
 * Get the full conversation transcript for a case.
 *
 * The backend `/messages` endpoint paginates and caps each request at
 * `limit<=100`, so a single call only ever returns the first page (default 50).
 * For a long investigation that silently truncated the transcript. This pages
 * through every chunk (oldest-first) and returns the complete, ordered set.
 */
export async function getCaseMessages(caseId: string): Promise<CaseMessagesResponse> {
  const pageSize = 100; // backend per-request cap (le=100)
  const messages: CaseMessage[] = [];
  let totalCount = 0;

  for (let offset = 0; ; offset += pageSize) {
    const queryString = buildQueryParams({ limit: pageSize, offset });
    const response = await makeAuthenticatedRequest(
      `${CASES_BASE}/${caseId}/messages?${queryString}`
    );
    await handleAPIResponse(response, 'Failed to get case messages');
    const page: CaseMessagesResponse = await response.json();

    messages.push(...page.messages);
    totalCount = page.total_count;

    // Stop on the last page (fewer rows than requested) or once we've collected
    // the advertised total. The short-page guard also prevents an infinite loop
    // if total_count is ever stale/larger than the real message count.
    if (page.messages.length < pageSize || messages.length >= totalCount) {
      break;
    }
  }

  return {
    messages,
    total_count: totalCount,
    retrieved_count: messages.length,
    has_more: false,
  };
}

/**
 * Get uploaded files for a case with evidence linkage counts.
 */
export async function getUploadedFiles(caseId: string): Promise<UploadedFilesResponse> {
  const response = await makeAuthenticatedRequest(`${CASES_BASE}/${caseId}/uploaded-files`);
  await handleAPIResponse(response, 'Failed to get uploaded files');
  return response.json();
}

/**
 * Get a single uploaded file's details, including derived evidence and hypothesis linkage.
 */
export async function getUploadedFileDetails(
  caseId: string,
  fileId: string
): Promise<UploadedFileDetails> {
  const response = await makeAuthenticatedRequest(
    `${CASES_BASE}/${caseId}/uploaded-files/${fileId}`
  );
  await handleAPIResponse(response, 'Failed to get uploaded file details');
  return response.json();
}

/**
 * Get all evidence records for a case in a single round-trip, each with
 * source-file reference, related hypotheses, and the verbatim extract.
 */
export async function getCaseEvidenceList(caseId: string): Promise<CaseEvidenceListResponse> {
  const response = await makeAuthenticatedRequest(`${CASES_BASE}/${caseId}/evidence`);
  await handleAPIResponse(response, 'Failed to list case evidence');
  return response.json();
}

/**
 * Get a single evidence record with full detail (extract + hypothesis stances).
 */
export async function getEvidenceDetails(
  caseId: string,
  evidenceId: string
): Promise<EvidenceDetails> {
  const response = await makeAuthenticatedRequest(
    `${CASES_BASE}/${caseId}/evidence/${evidenceId}`
  );
  await handleAPIResponse(response, 'Failed to get evidence details');
  return response.json();
}

/**
 * Get the phase-adaptive case UI snapshot (inquiry / investigating / resolved).
 * Used to surface investigation-time data such as active hypotheses.
 */
export async function getCaseUI(caseId: string): Promise<CaseUIResponse> {
  const response = await makeAuthenticatedRequest(`${CASES_BASE}/${caseId}/ui`);
  await handleAPIResponse(response, 'Failed to get case UI snapshot');
  return response.json();
}

/**
 * Get reports generated for a case.
 */
export async function getCaseReports(caseId: string): Promise<CaseReport[]> {
  const response = await makeAuthenticatedRequest(`${CASES_BASE}/${caseId}/reports`);
  await handleAPIResponse(response, 'Failed to get case reports');
  return response.json();
}

/**
 * Get the download URL for a case report.
 */
export function getCaseReportDownloadUrl(caseId: string, reportId: string): string {
  return `${CASES_BASE}/${caseId}/reports/${reportId}/download`;
}

