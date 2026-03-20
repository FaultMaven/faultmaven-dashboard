// Simplified API client for faultmaven-dashboard
// This file re-exports from modular structure for backward compatibility

// Re-export everything from auth module
export { AuthManager, authManager, devLogin, logoutAuth, AuthenticationError } from './auth';
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
  DocumentListResponse,
  AdminDocumentListResponse,
  UploadDocumentParams,
  UploadAdminDocumentParams,
} from './knowledge';

// Re-export cases module
export {
  listCases,
  getCaseDetail,
  searchCases,
  annotateCase,
  archiveCase,
  unarchiveCase,
  getCaseMessages,
  getCaseEvidence,
  getCaseReports,
  getCaseReportDownloadUrl,
} from './cases';

export type {
  CaseSummary,
  CaseDetail,
  CaseListResponse,
  CaseFilters,
  CaseAnnotation,
  CaseMessagesResponse,
  CaseEvidenceResponse,
  CaseEvidenceFile,
  CaseReport,
  CaseMessage,
  InvestigationStage,
} from './cases';

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
  inviteUser,
  updateUserRole,
  removeUser,
} from './users';

export type {
  UserProfile,
  UserListResponse,
  UserInviteRequest,
  UserRoleUpdate,
  DashboardRoleValue,
} from './users';

// Re-export config for convenience
import config from '../config';
export { config };
