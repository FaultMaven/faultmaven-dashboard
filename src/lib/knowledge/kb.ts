// Knowledge Base API functions
// All KB endpoints live under /api/v1/knowledge/documents.
// There is no user/admin URL split — all documents are in one unified KB.
// Write operations (upload, delete) require admin privileges on the backend.

import { makeAuthenticatedRequest, buildQueryParams } from './client';
import { handleAPIResponse } from './errors';
import type {
  KBDocument,
  AdminKBDocument,
  DocumentListResponse,
  AdminDocumentListResponse,
  UploadDocumentParams,
  UploadAdminDocumentParams,
} from './types';

const KB_BASE = '/api/v1/knowledge/documents';

/**
 * Upload a document to the knowledge base.
 * Requires admin privileges on the backend.
 */
export async function uploadDocument(params: UploadDocumentParams): Promise<KBDocument> {
  const formData = new FormData();
  formData.append('file', params.file);
  formData.append('title', params.title);
  formData.append('document_type', params.document_type);

  if (params.tags) formData.append('tags', params.tags);
  if (params.source_url) formData.append('source_url', params.source_url);
  if (params.description) formData.append('description', params.description);

  const response = await makeAuthenticatedRequest(KB_BASE, {
    method: 'POST',
    body: formData,
  });

  await handleAPIResponse(response, 'Upload failed');
  return await response.json();
}

/**
 * List knowledge base documents.
 * No admin required for listing.
 */
export async function listDocuments(params?: {
  limit?: number;
  offset?: number;
  document_type?: string;
}): Promise<DocumentListResponse> {
  const queryString = params ? buildQueryParams(params as Record<string, string | number>) : '';
  const url = `${KB_BASE}${queryString ? `?${queryString}` : ''}`;

  const response = await makeAuthenticatedRequest(url, {
    method: 'GET',
  });

  await handleAPIResponse(response, 'Failed to list documents');
  return await response.json();
}

/**
 * Get a single document by ID (includes content).
 */
export async function getDocument(documentId: string): Promise<KBDocument> {
  const response = await makeAuthenticatedRequest(`${KB_BASE}/${documentId}`, {
    method: 'GET',
  });

  await handleAPIResponse(response, 'Failed to get document');
  return await response.json();
}

/**
 * Delete (archive) a document from the knowledge base.
 * Requires admin privileges on the backend.
 */
export async function deleteDocument(documentId: string): Promise<void> {
  const response = await makeAuthenticatedRequest(`${KB_BASE}/${documentId}`, {
    method: 'DELETE',
  });

  await handleAPIResponse(response, 'Failed to delete document');
}

// ===== Admin aliases (same endpoint, kept for backward compat with useKBList scope) =====

export async function uploadAdminDocument(params: UploadAdminDocumentParams): Promise<AdminKBDocument> {
  return uploadDocument(params as UploadDocumentParams) as Promise<AdminKBDocument>;
}

export async function listAdminDocuments(params?: {
  limit?: number;
  offset?: number;
  document_type?: string;
}): Promise<AdminDocumentListResponse> {
  return listDocuments(params) as Promise<AdminDocumentListResponse>;
}

export async function deleteAdminDocument(documentId: string): Promise<void> {
  return deleteDocument(documentId);
}
