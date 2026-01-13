// Knowledge Base API module exports

// KB functions
export {
  uploadDocument,
  listDocuments,
  deleteDocument,
  uploadAdminDocument,
  listAdminDocuments,
  deleteAdminDocument,
} from './kb';

// Types
export type {
  KBDocument,
  AdminKBDocument,
  DocumentListResponse,
  AdminDocumentListResponse,
  UploadDocumentParams,
  UploadAdminDocumentParams,
} from './types';

// Error classes
export { APIError, NetworkError, handleAPIResponse } from './errors';

// Client utilities (for advanced use cases)
export { makeAuthenticatedRequest, buildQueryParams } from './client';
