/**
 * Case UI Types
 *
 * Re-exports from OpenAPI generated types with convenient type aliases
 * Source: faultmaven's committed docs/reference/api/openapi.json, which CI
 * gates against the running app (fm#880).
 * To regenerate: pnpm generate:api-types
 *
 * Do NOT regenerate from a live server. Generating against whatever build
 * happened to be running is how this repo and the copilot ended up with
 * different names for the same schema.
 */

import { components } from './api.generated';

// ==================== Type Aliases from API Contract ====================

export type CaseState = 'inquiry' | 'investigating' | 'resolved' | 'closed';

// Inquiry Phase Types
export type CaseUIResponse_Inquiry = components['schemas']['CaseUIResponse_Inquiry'];
export type InquiryData = components['schemas']['InquiryResponseData'];

// Investigating Phase Types
export type CaseUIResponse_Investigating = components['schemas']['CaseUIResponse_Investigating'];
export type InvestigationProgress = components['schemas']['InvestigationProgressSummary'];
export type ProblemVerification = components['schemas']['ProblemVerificationData'];
export type WorkingConclusion = components['schemas']['WorkingConclusionSummary'];
// `InvestigationStrategy` alias removed — it pointed at the
// `InvestigationStrategy` enum, which reached the contract only through the
// full `Case` graph. fm#1002 retired the replay API, whose snapshot route was
// the one place `response_model=Case` was declared, so the enum and 57 other
// schemas left the published spec with it. It still exists server-side in
// `modules/case/domain/models.py`; it is simply no longer published, and the
// alias had no consumer. (The copilot dropped its own differently-targeted
// `InvestigationStrategy` alias earlier — see its case.ts.)

// Resolved Phase Types
export type CaseUIResponse_Resolved = components['schemas']['CaseUIResponse_Resolved'];
export type RootCause = components['schemas']['RootCauseSummary'];
export type Solution = components['schemas']['SolutionSummary'];

// Union type for all UI responses (discriminated by status)
export type CaseUIResponse =
  | CaseUIResponse_Inquiry
  | CaseUIResponse_Investigating
  | CaseUIResponse_Resolved;

// Uploaded File Types
export type UploadedFileMetadata = components['schemas']['UploadedFileMetadata'];
export type UploadedFileDetailsResponse = components['schemas']['UploadedFileDetailsResponse'];
export type DerivedEvidenceSummary = components['schemas']['DerivedEvidenceSummary'];

// Evidence Types
export type EvidenceDetailsResponse = components['schemas']['EvidenceDetailsResponse'];
export type SourceFileReference = components['schemas']['SourceFileReference'];
export type RelatedHypothesis = components['schemas']['RelatedHypothesis'];

// ==================== Type Guards ====================

export function isCaseInquiry(
  caseData: CaseUIResponse
): caseData is CaseUIResponse_Inquiry {
  return caseData.state === 'inquiry';
}

export function isCaseInvestigating(
  caseData: CaseUIResponse
): caseData is CaseUIResponse_Investigating {
  return caseData.state === 'investigating';
}

export function isCaseResolved(
  caseData: CaseUIResponse
): caseData is CaseUIResponse_Resolved {
  return caseData.state === 'resolved';
}
