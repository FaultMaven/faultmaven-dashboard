// Knowledge Base API functions

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

// ===== Personal Knowledge Base =====

/**
 * Upload a document to the personal knowledge base
 *
 * @param params - Upload parameters
 * @returns Uploaded document
 * @throws {AuthenticationError} If not authenticated
 * @throws {APIError} If upload fails
 */
export async function uploadDocument(params: UploadDocumentParams): Promise<KBDocument> {
  const formData = new FormData();
  formData.append('file', params.file);
  formData.append('title', params.title);
  formData.append('document_type', params.document_type);

  if (params.tags) formData.append('tags', params.tags);
  if (params.source_url) formData.append('source_url', params.source_url);
  if (params.description) formData.append('description', params.description);

  const response = await makeAuthenticatedRequest('/api/v1/documents/upload', {
    method: 'POST',
    body: formData,
  });

  await handleAPIResponse(response, 'Upload failed');
  return await response.json();
}

/**
 * List documents from the personal knowledge base
 *
 * @param params - List parameters (limit, offset, document_type)
 * @returns Document list response
 * @throws {AuthenticationError} If not authenticated
 * @throws {APIError} If request fails
 */
export async function listDocuments(params?: {
  limit?: number;
  offset?: number;
  document_type?: string;
}): Promise<DocumentListResponse> {
  const queryString = params ? buildQueryParams(params as Record<string, string | number>) : '';
  const url = `/api/v1/documents${queryString ? `?${queryString}` : ''}`;

  const response = await makeAuthenticatedRequest(url, {
    method: 'GET',
  });

  await handleAPIResponse(response, 'Failed to list documents');
  return await response.json();
}

/**
 * Delete a document from the personal knowledge base
 *
 * @param documentId - ID of document to delete
 * @throws {AuthenticationError} If not authenticated
 * @throws {APIError} If deletion fails
 */
export async function deleteDocument(documentId: string): Promise<void> {
  const response = await makeAuthenticatedRequest(`/api/v1/documents/${documentId}`, {
    method: 'DELETE',
  });

  await handleAPIResponse(response, 'Failed to delete document');
}

// ===== Admin Knowledge Base =====

/**
 * Upload a document to the admin (system-wide) knowledge base
 *
 * @param params - Upload parameters
 * @returns Uploaded document
 * @throws {AuthenticationError} If not authenticated
 * @throws {APIError} If upload fails
 */
export async function uploadAdminDocument(params: UploadAdminDocumentParams): Promise<AdminKBDocument> {
  const formData = new FormData();
  formData.append('file', params.file);
  formData.append('document_type', params.document_type);
  formData.append('title', params.title);

  if (params.category) formData.append('category', params.category);
  if (params.tags) formData.append('tags', params.tags);
  if (params.source_url) formData.append('source_url', params.source_url);
  if (params.description) formData.append('description', params.description);

  const response = await makeAuthenticatedRequest('/api/v1/admin/kb/documents', {
    method: 'POST',
    body: formData,
  });

  await handleAPIResponse(response, 'Admin document upload failed');
  return await response.json();
}

/**
 * List admin documents
 *
 * @param params - List parameters (limit, offset, document_type)
 * @returns Admin document list response
 * @throws {AuthenticationError} If not authenticated
 * @throws {APIError} If request fails
 */
export async function listAdminDocuments(params?: {
  limit?: number;
  offset?: number;
  document_type?: string;
}): Promise<AdminDocumentListResponse> {
  const queryString = params ? buildQueryParams(params as Record<string, string | number>) : '';
  const url = `/api/v1/admin/kb/documents${queryString ? `?${queryString}` : ''}`;

  const response = await makeAuthenticatedRequest(url, {
    method: 'GET',
  });

  await handleAPIResponse(response, 'Failed to list admin documents');
  return await response.json();
}

/**
 * Delete an admin document
 *
 * @param documentId - ID of document to delete
 * @throws {AuthenticationError} If not authenticated
 * @throws {APIError} If deletion fails
 */
export async function deleteAdminDocument(documentId: string): Promise<void> {
  const response = await makeAuthenticatedRequest(`/api/v1/admin/kb/documents/${documentId}`, {
    method: 'DELETE',
  });

  await handleAPIResponse(response, 'Failed to delete admin document');
}
