import config from '../config';
import { authManager, AuthenticationError } from './api';

export type DocumentScope = 'user' | 'admin';

export interface BaseKBDocument {
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

export interface DocumentListResponse {
  documents: BaseKBDocument[];
  total_count: number;
  limit: number;
  offset: number;
}

export interface UploadUserDocumentParams {
  file: File;
  title: string;
  document_type: string;
  tags?: string;
  source_url?: string;
  description?: string;
}

export interface UploadAdminDocumentParams extends UploadUserDocumentParams {
  category?: string;
}

type UploadParams = UploadUserDocumentParams | UploadAdminDocumentParams;

function buildUrl(path: string) {
  return `${config.apiUrl}${path}`;
}

async function ensureAuth(scope: DocumentScope) {
  const token = await authManager.getAccessToken();
  if (!token) throw new AuthenticationError('Not authenticated');
  const authState = await authManager.getAuthState();
  if (!authState) throw new AuthenticationError('Not authenticated');
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    'X-User-ID': authState.user.user_id,
  };
  if (scope === 'admin') {
    headers['X-User-Roles'] = authState.user.roles?.join(',') || '';
  }
  return { headers, authState };
}

export async function uploadDocument(scope: DocumentScope, params: UploadParams): Promise<BaseKBDocument> {
  const { headers } = await ensureAuth(scope);
  const formData = new FormData();
  formData.append('file', params.file);
  formData.append('title', params.title);
  formData.append('document_type', params.document_type);
  if (params.tags) formData.append('tags', params.tags);
  if ('category' in params && params.category) formData.append('category', params.category);
  if (params.source_url) formData.append('source_url', params.source_url);
  if (params.description) formData.append('description', params.description);

  const path = scope === 'admin' ? '/api/v1/admin/kb/documents' : '/api/v1/documents/upload';

  const response = await fetch(buildUrl(path), {
    method: 'POST',
    headers,
    body: formData,
  });

  if (!response.ok) {
    const error = (await response.json().catch(() => ({ detail: 'Upload failed' }))) as { detail?: string; message?: string };
    throw new Error(error.detail || error.message || 'Upload failed');
  }

  return response.json();
}

export async function listDocuments(scope: DocumentScope, params?: { limit?: number; offset?: number; document_type?: string }): Promise<DocumentListResponse> {
  const { headers } = await ensureAuth(scope);
  const queryParams = new URLSearchParams();
  if (params?.limit) queryParams.set('limit', params.limit.toString());
  if (params?.offset) queryParams.set('offset', params.offset.toString());
  if (params?.document_type) queryParams.set('document_type', params.document_type);

  const basePath = scope === 'admin' ? '/api/v1/admin/kb/documents' : '/api/v1/documents';
  const url = `${buildUrl(basePath)}?${queryParams.toString()}`;

  const response = await fetch(url, {
    method: 'GET',
    headers,
  });

  if (!response.ok) {
    throw new Error('Failed to list documents');
  }

  return response.json();
}

export async function deleteDocument(scope: DocumentScope, documentId: string): Promise<void> {
  const { headers } = await ensureAuth(scope);
  const path = scope === 'admin' ? `/api/v1/admin/kb/documents/${documentId}` : `/api/v1/documents/${documentId}`;

  const response = await fetch(buildUrl(path), {
    method: 'DELETE',
    headers,
  });

  if (!response.ok) {
    throw new Error('Failed to delete document');
  }
}
