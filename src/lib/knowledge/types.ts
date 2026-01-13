// API types and interfaces

/**
 * Knowledge Base document interface
 * Represents both user and admin knowledge base documents
 */
export interface KBDocument {
  document_id: string;
  user_id: string;
  title: string;
  content: string;
  document_type: string;
  tags: string[];
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

/**
 * Type alias for admin KB documents
 * Structurally identical to KBDocument, used for semantic clarity in admin-scoped contexts
 */
export type AdminKBDocument = KBDocument;

/**
 * Response from document list endpoints
 */
export interface DocumentListResponse {
  documents: KBDocument[];
  total_count: number;
  limit: number;
  offset: number;
}

/**
 * Response from admin document list endpoints
 */
export interface AdminDocumentListResponse {
  documents: AdminKBDocument[];
  total_count: number;
  limit: number;
  offset: number;
}

/**
 * Parameters for uploading a document to personal KB
 */
export interface UploadDocumentParams {
  file: File;
  title: string;
  document_type: string;
  tags?: string;
  source_url?: string;
  description?: string;
}

/**
 * Parameters for uploading a document to admin KB
 */
export interface UploadAdminDocumentParams {
  file: File;
  title: string;
  document_type: string;
  category?: string;
  tags?: string;
  source_url?: string;
  description?: string;
}
