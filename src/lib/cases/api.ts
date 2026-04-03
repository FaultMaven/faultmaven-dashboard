import { makeAuthenticatedRequest, buildQueryParams } from '../knowledge/client';
import { handleAPIResponse } from '../knowledge/errors';
import type {
  CaseDetail,
  CaseSummary,
  CaseListResponse,
  CaseFilters,
  CaseAnnotation,
  CaseMessagesResponse,
  CaseEvidenceResponse,
  CaseReport,
  ReportGenerationRequest,
  ReportGenerationResponse,
  ReportRecommendation,
} from '../../types/cases';

const CASES_BASE = '/api/v1/cases';

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
    ...(filters.status && { status: filters.status }),
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
 * Get conversation messages for a case.
 */
export async function getCaseMessages(caseId: string): Promise<CaseMessagesResponse> {
  const response = await makeAuthenticatedRequest(`${CASES_BASE}/${caseId}/messages`);
  await handleAPIResponse(response, 'Failed to get case messages');
  return response.json();
}

/**
 * Get evidence files uploaded to a case.
 */
export async function getCaseEvidence(caseId: string): Promise<CaseEvidenceResponse> {
  const response = await makeAuthenticatedRequest(`${CASES_BASE}/${caseId}/data`);
  await handleAPIResponse(response, 'Failed to get case evidence');
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

