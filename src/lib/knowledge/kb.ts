// Knowledge Base API functions
// All KB endpoints live under /api/v1/knowledge/documents.
// There is no user/admin URL split — all documents are in one unified KB.
// Write operations (upload, delete) require admin privileges on the backend.

import { makeAuthenticatedRequest, buildQueryParams } from './client';
import { APIError, handleAPIResponse } from './errors';
import {
  IDEMPOTENCY_KEY_REUSE,
  KB_INGEST_OUTCOME_UNKNOWN,
  KB_REQUEST_IN_PROGRESS,
  KEY_REUSE_MESSAGE,
  stillProcessingMessage,
} from './submissionKey';
import type {
  KBDocument,
  KBDocumentUploadResult,
  KBDocumentUpdateResult,
  DocumentListResponse,
  AdminDocumentListResponse,
  UploadDocumentParams,
  UploadAdminDocumentParams,
} from './types';

const KB_BASE = '/api/v1/knowledge/documents';

/**
 * Upload a document to the knowledge base.
 *
 * Answers with a RECEIPT, not a document: `{document_id, status, metadata}`,
 * where `title` and `created_at` sit NESTED under `metadata`. Typed as what
 * the route actually sends rather than as `KBDocument` — the route is `-> dict`
 * upstream with no `response_model`, so nothing but this declaration stands
 * between a caller and `doc.title === undefined` (faultmaven-dashboard#165).
 *
 * Any authenticated user may upload at their own scope; `global` — the platform
 * tier every tenant reads — requires the platform-admin role, which the backend
 * enforces on the SCOPE rather than on the route (FaultMaven/faultmaven#1377).
 *
 * `idempotencyKey` is the submission's (`submissionKey.ts`): a send under a key
 * core already answered replays that 201 instead of publishing again (#2433).
 */
export async function uploadDocument(
  params: UploadDocumentParams,
  idempotencyKey: string,
): Promise<KBDocumentUploadResult> {
  const formData = new FormData();
  formData.append('file', params.file);
  formData.append('title', params.title);
  formData.append('document_type', params.document_type);
  formData.append('scope', params.scope);
  if (params.team_id) formData.append('team_id', params.team_id);

  if (params.category) formData.append('category', params.category);
  if (params.tags) formData.append('tags', params.tags);
  if (params.source_url) formData.append('source_url', params.source_url);
  if (params.description) formData.append('description', params.description);

  const response = await makeAuthenticatedRequest(KB_BASE, {
    method: 'POST',
    headers: { 'Idempotency-Key': idempotencyKey },
    body: formData,
  });

  await handleAPIResponse(response, 'Upload failed');
  return await response.json();
}

/**
 * The sentence an upload failure shows. Core's own detail for the keyed-retry
 * refusals names `Idempotency-Key`, which a Dashboard user cannot act on.
 */
export function describeUploadError(error: unknown): string {
  if (error instanceof APIError) {
    if (error.errorCode === KB_REQUEST_IN_PROGRESS) return stillProcessingMessage('upload', error.retryAfter);
    if (error.errorCode === IDEMPOTENCY_KEY_REUSE) return KEY_REUSE_MESSAGE;
    if (error.errorCode === KB_INGEST_OUTCOME_UNKNOWN) {
      return 'The runbook may have been published. Submit it again unchanged from this tab, without reloading, to find out; it will not be published twice.';
    }
  }
  return error instanceof Error ? error.message : 'Upload failed';
}

/**
 * List knowledge base documents.
 * No admin required for listing.
 */
export async function listDocuments(params?: {
  limit?: number;
  offset?: number;
  document_type?: string;
  scope?: string;
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
 * Update a document's content (and optionally metadata).
 * Triggers re-embedding in ChromaDB so vectors match the new content.
 *
 * Answers with the UPDATED FIELDS, not a document — no `scope`, `owner_id`,
 * `created_at` or `verification_*`. See `KBDocumentUpdateResult`.
 */
export async function updateDocument(
  documentId: string,
  updates: { content?: string; title?: string; tags?: string },
): Promise<KBDocumentUpdateResult> {
  const response = await makeAuthenticatedRequest(`${KB_BASE}/${documentId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(updates),
  });

  await handleAPIResponse(response, 'Failed to update document');
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

export async function uploadAdminDocument(
  params: UploadAdminDocumentParams,
  idempotencyKey: string,
): Promise<KBDocumentUploadResult> {
  return uploadDocument(params as UploadDocumentParams, idempotencyKey);
}

export async function listAdminDocuments(params?: {
  limit?: number;
  offset?: number;
  document_type?: string;
  scope?: string;
}): Promise<AdminDocumentListResponse> {
  return listDocuments(params) as Promise<AdminDocumentListResponse>;
}

export async function deleteAdminDocument(documentId: string): Promise<void> {
  return deleteDocument(documentId);
}
