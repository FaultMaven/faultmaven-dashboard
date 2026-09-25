export {
  listCases,
  getAdminCases,
  getCaseDetail,
  searchCases,
  shareCaseWithTeam,
  unshareCaseFromTeam,
  getCaseMessages,
  getUploadedFiles,
  getUploadedFileDetails,
  getCaseEvidenceList,
  getEvidenceDetails,
  getCaseUI,
  getCaseReports,
  getCaseReportDownloadUrl,
} from './api';

/**
 * Exported beside `searchCases` so a caller can NAME its options rather than
 * reaching past this barrel into `./api` — the deep import this codebase
 * otherwise polices.
 */
export type { CaseSearchOptions } from './api';

export { buildCaseMarkdown, fetchCaseMarkdown } from './exportMarkdown';

export type {
  CaseSummary,
  CaseSource,
  CaseDetail,
  CaseListResponse,
  AdminCaseMetadata,
  AdminCaseListResult,
  AdminCaseContentResponse,
  AdminCaseMessagesResponse,
  BreakGlassGrant,
  BreakGlassGrantRequest,
  OperatorContentAccess,
  CaseFilters,
  Team,
  CaseMessagesResponse,
  UploadedFile,
  UploadedFilesResponse,
  UploadedFileDetails,
  DerivedEvidence,
  HypothesisState,
  HypothesisSummary,
  CaseUIStatus,
  CaseUIResponse,
  SourceFileReference,
  RelatedHypothesis,
  EvidenceDetails,
  CaseEvidenceListResponse,
  CaseReport,
  CaseMessage,
  InvestigationStage,
  SuggestionStatus,
  PIIScanStatus,
  KnowledgeSuggestion,
} from '../../types/cases';
