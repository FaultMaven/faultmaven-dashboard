// Simplified API client for faultmaven-dashboard
// This file re-exports from modular structure for backward compatibility

// Re-export everything from auth module
export { AuthManager, authManager, devLogin, ssoExchange, logoutAuth, AuthenticationError } from './auth';
export type { AuthState } from './auth';

// Re-export everything from knowledge module
export {
  uploadDocument,
  listDocuments,
  deleteDocument,
  uploadAdminDocument,
  listAdminDocuments,
  deleteAdminDocument,
} from './knowledge';

export type {
  KBDocument,
  AdminKBDocument,
  ScopeCounts,
  DocumentListResponse,
  AdminDocumentListResponse,
  UploadDocumentParams,
  UploadAdminDocumentParams,
} from './knowledge';

// Re-export conversion module
export {
  convertDocument,
  listConversions,
  getConversion,
  updateDraft,
  verifyDraft,
  deleteDraft,
} from './knowledge';

export type {
  ConversionResponse,
  ConversionDraft,
  ConversionJobSummary,
  VerifyResponse,
  QualityScore,
  ValidationResult,
} from './knowledge';

// Re-export cases module
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
  generateCaseReport,
  getReportRecommendations,
  buildCaseMarkdown,
  fetchCaseMarkdown,
} from './cases';

export type {
  CaseSummary,
  CaseSource,
  CaseDetail,
  CaseListResponse,
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
  ReportType,
  ReportGenerationRequest,
  ReportGenerationResponse,
  ReportRecommendation,
  RunbookRecommendation,
  SuggestionStatus,
  PIIScanStatus,
  KnowledgeSuggestion,
} from './cases';

// Re-export teams module (read-only team listing, ADR-013 §D4)
export { listTeams } from './teams';

// Re-export LLM configuration module
export {
  getLLMConfig,
  updateLLMConfig,
  testProviderConnection,
  getEnvConfigStatus,
} from './llm';

export type {
  LLMProvider,
  LLMConfig,
  LLMConfigUpdate,
  ProviderConnectionTestResult,
  EnvConfigStatus,
  ProviderName,
} from './llm';

// Re-export user management module
export {
  listUsers,
  updateUserRole,
  deactivateUser,
} from './users';

export type {
  UserProfile,
  UserListResponse,
  UserRoleUpdate,
  DashboardRoleValue,
} from './users';

// Re-export config for convenience
import config from '../config';
export { config };
