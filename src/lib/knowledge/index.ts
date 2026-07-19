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
  ScopeCounts,
  DocumentListResponse,
  AdminDocumentListResponse,
  UploadDocumentParams,
  UploadAdminDocumentParams,
} from './types';

// Conversion functions
export {
  convertDocument,
  listConversions,
  getConversion,
  updateDraft,
  verifyDraft,
  deleteDraft,
  translateConversionError,
  createRunbookManually,
  listAllDrafts,
  scanForRunbooks,
  ConversionAPIError,
} from './conversion';

export type {
  ConversionResponse,
  ConversionDraft,
  ConversionJobSummary,
  DraftSummary,
  ConversionErrorInfo,
  VerifyResponse,
  QualityScore,
  ValidationResult,
  AnalysisResult,
  FailureModeAnalysis,
  SourceFileInfo,
} from './conversion';

// Error classes
export { APIError, NetworkError, handleAPIResponse } from './errors';

// Client utilities (for advanced use cases)
export { makeAuthenticatedRequest, buildQueryParams } from './client';
