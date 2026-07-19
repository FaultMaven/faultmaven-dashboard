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

export type SourceType = 'document' | 'case';

export interface ConversionDraft {
  draft_id: string;
  runbook_id: string;
  title: string;
  scope: string;
  status: 'draft' | 'verified' | 'deleted';
  source_type: SourceType;
  case_id: string | null;
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

export interface DraftSummary {
  conversion_id: string;
  draft_id: string;
  runbook_id: string;
  title: string;
  scope: string;
  status: 'draft' | 'verified';
  source_type: SourceType;
  case_id: string | null;
  validation_passed: boolean;
  quality_score: number | null;
  quality_details: QualityScore | null;
  created_at: string;
  verified_at: string | null;
}

// =============================================================================
// Error Translation (error_code → user-friendly message + guidance)
// =============================================================================

export interface ConversionErrorInfo {
  title: string;
  message: string;
  action: string;
}

const ERROR_TRANSLATIONS: Record<string, ConversionErrorInfo> = {
  FILE_TOO_LARGE: {
    title: 'File too large',
    message: 'The uploaded file exceeds the maximum size limit.',
    action: 'Reduce the file size to under 10 MB, or split it into smaller files.',
  },
  UNSUPPORTED_FORMAT: {
    title: 'Unsupported file type',
    message: 'This file format cannot be converted.',
    action: 'Upload a PDF, DOCX, TXT, Markdown, or HTML file.',
  },
  FILE_CORRUPT: {
    title: 'File cannot be read',
    message: 'The file appears to be corrupt or is not the format it claims to be.',
    action: 'Re-export the file from its source application and try again.',
  },
  FILE_EMPTY: {
    title: 'Empty file',
    message: 'The uploaded file contains no data.',
    action: 'Check the file and upload a non-empty document.',
  },
  ENCODING_ERROR: {
    title: 'Cannot read text',
    message: 'The file encoding is not supported.',
    action: 'Re-save the file as UTF-8 and try again.',
  },
  DOCUMENT_TOO_LONG: {
    title: 'Document too long',
    message: 'The document exceeds the 30,000-token processing limit.',
    action: 'Split the document into smaller, focused chapters and convert each one separately.',
  },
  DOCUMENT_TOO_SHORT: {
    title: 'Not enough content',
    message: 'The document is too short to produce a useful runbook.',
    action: 'Provide a document with more detailed troubleshooting content.',
  },
  NOT_ACTIONABLE: {
    title: 'No troubleshooting content',
    message: 'The document does not contain diagnostic procedures or error resolution steps.',
    action: 'Upload a troubleshooting guide, incident report, postmortem, or vendor documentation.',
  },
  NO_FAILURE_MODES: {
    title: 'No failure modes found',
    message: 'The AI could not identify specific failure modes in this document.',
    action: 'The document may be too general. Upload content with specific error scenarios and resolution steps.',
  },
  NO_TECHNICAL_CONTENT: {
    title: 'No technical content detected',
    message: 'The document does not contain recognizable technical signals like error messages, commands, or log patterns.',
    action: 'Upload a document that contains troubleshooting procedures, error descriptions, or diagnostic commands.',
  },
  ALREADY_A_RUNBOOK: {
    title: 'Already a runbook',
    message: 'This document appears to already be a FaultMaven runbook.',
    action: 'Use the Upload feature instead to add it directly to the knowledge base.',
  },
  LLM_UNAVAILABLE: {
    title: 'AI provider not available',
    message: 'No LLM provider is configured for document conversion.',
    action: 'Configure a provider in Dashboard > LLM Settings, or set CHAT_PROVIDER in your .env file.',
  },
  LLM_PARSE_ERROR: {
    title: 'AI response error',
    message: 'The AI returned an unexpected response that could not be processed.',
    action: 'Try again. If the problem persists, try a different document or check your LLM provider.',
  },
  LLM_GENERATION_FAILED: {
    title: 'Conversion failed',
    message: 'An error occurred during the conversion process.',
    action: 'Try again. If the problem persists, check the API logs for details.',
  },
};

/**
 * Translate a backend error response into a user-friendly message.
 */
export function translateConversionError(
  errorBody: { detail?: string; error_code?: string } | null,
  fallbackMessage: string,
): ConversionErrorInfo {
  if (errorBody?.error_code && errorBody.error_code in ERROR_TRANSLATIONS) {
    return ERROR_TRANSLATIONS[errorBody.error_code];
  }
  return {
    title: 'Conversion failed',
    message: errorBody?.detail || fallbackMessage,
    action: 'Try again with a different document.',
  };
}

// =============================================================================
// API Functions
// =============================================================================

/**
 * Error thrown by conversion API with structured error code.
 */
export class ConversionAPIError extends Error {
  constructor(
    message: string,
    public statusCode: number,
    public errorCode: string,
    public errorInfo: ConversionErrorInfo,
  ) {
    super(message);
    this.name = 'ConversionAPIError';
  }
}

/**
 * Upload a document and convert it to runbook drafts.
 */
export async function convertDocument(
  file: File,
  scope: string,
): Promise<ConversionResponse> {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('scope', scope);

  const response = await makeAuthenticatedRequest(`${CONVERT_BASE}/convert`, {
    method: 'POST',
    body: formData,
  });

  if (!response.ok) {
    let errorBody: { detail?: string; error_code?: string } | null = null;
    try {
      errorBody = await response.json();
    } catch {
      // not JSON
    }
    const info = translateConversionError(errorBody, 'Document conversion failed');
    throw new ConversionAPIError(
      info.message,
      response.status,
      errorBody?.error_code || 'UNKNOWN',
      info,
    );
  }

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
 * List all non-deleted drafts across all conversion jobs.
 */
export async function listAllDrafts(): Promise<DraftSummary[]> {
  const response = await makeAuthenticatedRequest(`${CONVERT_BASE}/drafts`);

  await handleAPIResponse(response, 'Failed to list drafts');
  return await response.json();
}

export interface ScanResult {
  discovered: number;
  skipped: number;
  errors: string[];
  drafts: Array<{
    draft_id: string;
    title: string;
    runbook_id: string;
    scope: string;
    validation_passed: boolean;
    quality_score: number;
    file_path: string;
  }>;
}

/**
 * Scan data/knowledge/ for runbook files not tracked in the database.
 */
export async function scanForRunbooks(): Promise<ScanResult> {
  const response = await makeAuthenticatedRequest(`${CONVERT_BASE}/scan`, {
    method: 'POST',
  });

  await handleAPIResponse(response, 'Failed to scan for runbooks');
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
 * Batch verify and ingest multiple drafts.
 */
export interface BatchDraftRef {
  conversion_id: string;
  draft_id: string;
}

export interface BatchVerifyItemResult {
  conversion_id: string;
  draft_id: string;
  status: 'verified' | 'failed' | 'skipped';
  error: string | null;
  knowledge_item_id: string | null;
}

export interface BatchVerifyResponse {
  total: number;
  verified: number;
  failed: number;
  skipped: number;
  results: BatchVerifyItemResult[];
}

export async function verifyBatch(
  draftIds: BatchDraftRef[],
): Promise<BatchVerifyResponse> {
  const response = await makeAuthenticatedRequest(
    `${CONVERT_BASE}/drafts/verify-batch`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ draft_ids: draftIds }),
    },
  );
  await handleAPIResponse(response, 'Batch verification failed');
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

/**
 * Create a runbook manually from template fields (no LLM).
 */
export async function createRunbookManually(data: {
  title: string;
  domain: string;
  service: string;
  symptom_class: string[];
  severity: string;
  scope: string;
  tags: string[];
  difficulty: string;
  symptom_recognition: string;
  applicability: string;
  diagnostic_steps: string;
  causes: string;
  prevention: string;
}): Promise<{ conversion_id: string; draft: ConversionDraft }> {
  const response = await makeAuthenticatedRequest(
    `${CONVERT_BASE}/runbooks/create`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    },
  );

  await handleAPIResponse(response, 'Failed to create runbook');
  return await response.json();
}

/**
 * Get the conversion job and drafts for a specific case.
 * Returns null if no conversion exists for this case.
 */
export async function getCaseRunbookDraft(
  caseId: string,
): Promise<ConversionResponse | null> {
  const response = await makeAuthenticatedRequest(
    `${CONVERT_BASE}/conversions/by-case/${caseId}`,
  );

  if (response.status === 404) return null;
  await handleAPIResponse(response, 'Failed to get case runbook');
  return await response.json();
}
