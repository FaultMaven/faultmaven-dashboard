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

// Re-export config for convenience
import config from '../config';
export { config };
