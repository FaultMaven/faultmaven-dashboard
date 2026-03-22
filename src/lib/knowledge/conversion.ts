// Document-to-Runbook Conversion API client

import { makeAuthenticatedRequest } from './client';
import { handleAPIResponse } from './errors';

const CONVERT_BASE = '/api/v1/knowledge';

// =============================================================================
// Types
// =============================================================================

export interface SourceFileInfo {
  filename: string;
  size_bytes: number;
  content_type: string;
  retained_path: string;
}

export interface SourceAssessment {
  content_type: string;
  actionability_rating: string;
  missing_information: string[];
}

export interface FailureModeAnalysis {
  id: string;
  title: string;
  domain: string;
  service: string;
  symptom_class: string[];
  severity: string;
  symptoms_summary: string;
  resolution_summary: string;
}

export interface AnalysisResult {
  is_actionable: boolean;
  failure_modes: FailureModeAnalysis[];
  source_assessment: SourceAssessment;
}

export interface ValidationResult {
  passed: boolean;
  errors: string[];
  warnings: string[];
}

export interface QualityScore {
  overall: number;
  grade: string;
  completeness: number;
  clarity: number;
  actionability: number;
  comprehensiveness: number;
}

export interface ConversionDraft {
  draft_id: string;
  runbook_id: string;
  title: string;
  scope: string;
  status: 'draft' | 'verified' | 'deleted';
  validation: ValidationResult;
  quality_score: QualityScore;
  file_path: string;
  content_preview: string;
  content: string | null;
  quality_warning: string | null;
}

export interface ConversionResponse {
  conversion_id: string;
  status: 'processing' | 'completed' | 'partial' | 'failed';
  source_file: SourceFileInfo;
  analysis: AnalysisResult;
  drafts: ConversionDraft[];
  warnings: string[];
  created_at: string;
}

export interface VerifyResponse {
  draft_id: string;
  runbook_id: string;
  status: string;
  knowledge_item_id: string;
  ingested: boolean;
  ingested_at: string | null;
  collection: string;
  chunks_created: number;
}

export interface ConversionJobSummary {
  conversion_id: string;
  status: string;
  source_filename: string;
  failure_modes_detected: number;
  scope: string;
  created_at: string;
}

// =============================================================================
// API Functions
// =============================================================================

/**
 * Upload a document and convert it to runbook drafts.
 */
export async function convertDocument(
  file: File,
  scope: string,
  teamId?: string,
): Promise<ConversionResponse> {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('scope', scope);
  if (teamId) formData.append('team_id', teamId);

  const response = await makeAuthenticatedRequest(`${CONVERT_BASE}/convert`, {
    method: 'POST',
    body: formData,
  });

  await handleAPIResponse(response, 'Document conversion failed');
  return await response.json();
}

/**
 * List user's conversion jobs.
 */
export async function listConversions(
  limit = 20,
  offset = 0,
): Promise<ConversionJobSummary[]> {
  const response = await makeAuthenticatedRequest(
    `${CONVERT_BASE}/conversions?limit=${limit}&offset=${offset}`,
  );

  await handleAPIResponse(response, 'Failed to list conversions');
  return await response.json();
}

/**
 * Get conversion job details with all drafts.
 */
export async function getConversion(conversionId: string): Promise<ConversionResponse> {
  const response = await makeAuthenticatedRequest(
    `${CONVERT_BASE}/conversions/${conversionId}`,
  );

  await handleAPIResponse(response, 'Failed to get conversion');
  return await response.json();
}

/**
 * Update draft content. Re-runs validation and quality scoring.
 */
export async function updateDraft(
  conversionId: string,
  draftId: string,
  content: string,
): Promise<ConversionDraft> {
  const response = await makeAuthenticatedRequest(
    `${CONVERT_BASE}/conversions/${conversionId}/drafts/${draftId}`,
    {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content }),
    },
  );

  await handleAPIResponse(response, 'Failed to update draft');
  return await response.json();
}

/**
 * Promote draft to verified and trigger ingestion.
 */
export async function verifyDraft(
  conversionId: string,
  draftId: string,
): Promise<VerifyResponse> {
  const response = await makeAuthenticatedRequest(
    `${CONVERT_BASE}/conversions/${conversionId}/drafts/${draftId}/verify`,
    { method: 'POST' },
  );

  await handleAPIResponse(response, 'Failed to verify draft');
  return await response.json();
}

/**
 * Delete a conversion draft.
 */
export async function deleteDraft(
  conversionId: string,
  draftId: string,
): Promise<void> {
  const response = await makeAuthenticatedRequest(
    `${CONVERT_BASE}/conversions/${conversionId}/drafts/${draftId}`,
    { method: 'DELETE' },
  );

  await handleAPIResponse(response, 'Failed to delete draft');
}
