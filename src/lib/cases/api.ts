import { makeAuthenticatedRequest, buildQueryParams } from '../knowledge/client';
import { handleAPIResponse } from '../knowledge/errors';
import type {
  CaseDetail,
  CaseListResponse,
  CaseFilters,
  CaseAnnotation,
  CaseMessagesResponse,
  CaseEvidenceResponse,
  CaseReport,
  ReportGenerationRequest,
  ReportGenerationResponse,
  ReportRecommendation,
  KnowledgeSuggestion,
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
 */
export async function searchCases(
  query: string,
  page = 0,
  pageSize = 20
): Promise<CaseListResponse> {
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

/**
 * Extract knowledge suggestion from a case.
 */
export async function extractKnowledge(caseId: string): Promise<KnowledgeSuggestion> {
  const response = await makeAuthenticatedRequest(`/api/v1/knowledge/suggestions/extract`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ case_id: caseId }),
  });
  await handleAPIResponse(response, 'Failed to extract knowledge');
  return response.json();
}

/**
 * Get knowledge suggestion for a case.
 */
export async function getCaseSuggestion(caseId: string): Promise<KnowledgeSuggestion | null> {
  const response = await makeAuthenticatedRequest(`/api/v1/knowledge/suggestions?case_id=${caseId}`);
  await handleAPIResponse(response, 'Failed to get knowledge suggestion');
  const data = await response.json();
  return data.suggestions?.[0] ?? null;
}

/**
 * Approve a knowledge suggestion.
 */
export async function approveSuggestion(suggestionId: string): Promise<void> {
  const response = await makeAuthenticatedRequest(`/api/v1/knowledge/suggestions/${suggestionId}/approve`, {
    method: 'POST',
  });
  await handleAPIResponse(response, 'Failed to approve suggestion');
}

/**
 * Reject a knowledge suggestion.
 */
export async function rejectSuggestion(suggestionId: string, reason: string): Promise<void> {
  const response = await makeAuthenticatedRequest(`/api/v1/knowledge/suggestions/${suggestionId}/reject`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ reason }),
  });
  await handleAPIResponse(response, 'Failed to reject suggestion');
}

/**
 * Update a knowledge suggestion (title/content).
 */
export async function updateSuggestion(
  suggestionId: string,
  updates: { suggested_title?: string; suggested_content?: string }
): Promise<KnowledgeSuggestion> {
  const response = await makeAuthenticatedRequest(`/api/v1/knowledge/suggestions/${suggestionId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(updates),
  });
  await handleAPIResponse(response, 'Failed to update suggestion');
  return response.json();
}

/**
 * Remediate PII in a knowledge suggestion.
 */
export async function remediatePII(suggestionId: string): Promise<KnowledgeSuggestion> {
  const response = await makeAuthenticatedRequest(`/api/v1/knowledge/suggestions/${suggestionId}/remediate-pii`, {
    method: 'POST',
  });
  await handleAPIResponse(response, 'Failed to remediate PII');
  return response.json();
}
