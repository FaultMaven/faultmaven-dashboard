import { makeAuthenticatedRequest, buildQueryParams } from '../knowledge/client';
import { handleAPIResponse } from '../knowledge/errors';
import type {
  CaseDetail,
  CaseSummary,
  CaseListResponse,
  CaseFilters,
  CaseAnnotation,
  CaseMessage,
  CaseMessagesResponse,
  CaseReport,
  CaseUIResponse,
  CaseEvidenceListResponse,
  EvidenceDetails,
  ReportGenerationRequest,
  ReportGenerationResponse,
  ReportRecommendation,
  UploadedFilesResponse,
  UploadedFileDetails,
} from '../../types/cases';

const CASES_BASE = '/api/v1/cases';
const ADMIN_CASES_BASE = '/api/v1/admin/cases';

/**
 * List investigation cases with optional filters and pagination.
 */
export async function listCases(
  filters: CaseFilters = {},
  page = 0,
  pageSize = 20
): Promise<CaseListResponse> {
  const params: Record<string, string | number | undefined> = {
    page,
    page_size: pageSize,
    ...(filters.state && { state: filters.state }),
    ...(filters.source && { source: filters.source }),
    ...(filters.date_from && { date_from: filters.date_from }),
    ...(filters.date_to && { date_to: filters.date_to }),
    ...(filters.include_archived && { include_archived: 'true' }),
  };

  const queryString = buildQueryParams(params);
  const url = `${CASES_BASE}${queryString ? `?${queryString}` : ''}`;

  const response = await makeAuthenticatedRequest(url);
  await handleAPIResponse(response, 'Failed to list cases');
  return response.json();
}

/**
 * List cases across ALL users/orgs — the platform-admin cross-tenant view
 * (ADR-012 D9, GET /api/v1/admin/cases). Only reachable for an admin on a
 * standalone deployment (see `canViewAllCases`); the backend enforces the same
 * and returns 403 in cloud until an audited break-glass path exists.
 */
export async function getAdminCases(
  filters: CaseFilters = {},
  page = 0,
  pageSize = 20
): Promise<CaseListResponse> {
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

/**
 * Search cases by free text query.
 * Returns a flat array of CaseSummary (not wrapped in CaseListResponse).
 */
export async function searchCases(
  query: string,
  page = 0,
  pageSize = 20
): Promise<CaseSummary[]> {
  const response = await makeAuthenticatedRequest(`${CASES_BASE}/search`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, page, page_size: pageSize }),
  });
  await handleAPIResponse(response, 'Failed to search cases');
  return response.json();
}

/**
 * Annotate a case with resolution notes or update its status.
 */
export async function annotateCase(
  caseId: string,
  annotation: CaseAnnotation
): Promise<void> {
  const response = await makeAuthenticatedRequest(`${CASES_BASE}/${caseId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(annotation),
  });
  await handleAPIResponse(response, 'Failed to update case');
}

/**
 * Archive a terminal case. Hides it from the default list view.
 * Non-destructive and reversible via unarchiveCase().
 */
export async function archiveCase(caseId: string): Promise<void> {
  const response = await makeAuthenticatedRequest(`${CASES_BASE}/${caseId}/archive`, {
    method: 'POST',
  });
  await handleAPIResponse(response, 'Failed to archive case');
}

/**
 * Unarchive a case. Restores it to the default list view.
 */
export async function unarchiveCase(caseId: string): Promise<void> {
  const response = await makeAuthenticatedRequest(`${CASES_BASE}/${caseId}/unarchive`, {
    method: 'POST',
  });
  await handleAPIResponse(response, 'Failed to unarchive case');
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

  return { messages, total_count: totalCount, retrieved_count: messages.length };
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

/**
 * Generate reports for a case.
 */
export async function generateCaseReport(
  caseId: string,
  request: ReportGenerationRequest
): Promise<ReportGenerationResponse> {
  const response = await makeAuthenticatedRequest(`${CASES_BASE}/${caseId}/reports`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
  });
  await handleAPIResponse(response, 'Failed to generate report');
  return response.json();
}

/**
 * Get report recommendations for a case.
 */
export async function getReportRecommendations(caseId: string): Promise<ReportRecommendation> {
  const response = await makeAuthenticatedRequest(`${CASES_BASE}/${caseId}/report-recommendations`);
  await handleAPIResponse(response, 'Failed to get report recommendations');
  return response.json();
}

