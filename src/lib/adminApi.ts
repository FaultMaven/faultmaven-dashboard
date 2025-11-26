// Admin API client for FaultMaven Dashboard
import config from "../config";
import { authManager, AuthenticationError } from "./api";

export interface AdminKBDocument {
  document_id: string;
  user_id: string;
  title: string;
  content: string;
  document_type: string;
  tags: string[];
  metadata: Record<string, any>;
  created_at: string;
  updated_at: string;
}

export interface AdminDocumentListResponse {
  documents: AdminKBDocument[];
  total_count: number;
  limit: number;
  offset: number;
}

export interface UploadAdminDocumentParams {
  file: File;
  title: string;
  document_type: string;
  category?: string;
  tags?: string;
  source_url?: string;
  description?: string;
}

export async function uploadAdminDocument(params: UploadAdminDocumentParams): Promise<AdminKBDocument> {
  const token = await authManager.getAccessToken();
  if (!token) {
    throw new AuthenticationError('Not authenticated');
  }

  const authState = await authManager.getAuthState();
  if (!authState) {
    throw new AuthenticationError('Not authenticated');
  }

  const formData = new FormData();
  formData.append('file', params.file);
  formData.append('title', params.title);
  formData.append('document_type', params.document_type);

  if (params.category) {
    formData.append('category', params.category);
  }
  if (params.tags) {
    formData.append('tags', params.tags);
  }
  if (params.source_url) {
    formData.append('source_url', params.source_url);
  }
  if (params.description) {
    formData.append('description', params.description);
  }

  const response = await fetch(config.apiUrl + '/api/v1/admin/kb/documents', {
    method: 'POST',
    headers: {
      'Authorization': 'Bearer ' + token,
      'X-User-ID': authState.user.user_id,
      'X-User-Roles': authState.user.roles?.join(',') || '',
    },
    body: formData,
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: 'Upload failed' }));
    throw new Error(error.detail || error.message || 'Upload failed');
  }

  return await response.json();
}

export async function listAdminDocuments(params?: {
  limit?: number;
  offset?: number;
  document_type?: string;
}): Promise<AdminDocumentListResponse> {
  const token = await authManager.getAccessToken();
  if (!token) {
    throw new AuthenticationError('Not authenticated');
  }

  const authState = await authManager.getAuthState();
  if (!authState) {
    throw new AuthenticationError('Not authenticated');
  }

  const queryParams = new URLSearchParams();
  if (params?.limit) queryParams.set('limit', params.limit.toString());
  if (params?.offset) queryParams.set('offset', params.offset.toString());
  if (params?.document_type) queryParams.set('document_type', params.document_type);

  const url = config.apiUrl + '/api/v1/admin/kb/documents?' + queryParams.toString();

  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'Authorization': 'Bearer ' + token,
      'X-User-ID': authState.user.user_id,
      'X-User-Roles': authState.user.roles?.join(',') || '',
    },
  });

  if (!response.ok) {
    throw new Error('Failed to list admin documents');
  }

  return await response.json();
}

export async function deleteAdminDocument(documentId: string): Promise<void> {
  const token = await authManager.getAccessToken();
  if (!token) {
    throw new AuthenticationError('Not authenticated');
  }

  const authState = await authManager.getAuthState();
  if (!authState) {
    throw new AuthenticationError('Not authenticated');
  }

  const response = await fetch(config.apiUrl + '/api/v1/admin/kb/documents/' + documentId, {
    method: 'DELETE',
    headers: {
      'Authorization': 'Bearer ' + token,
      'X-User-ID': authState.user.user_id,
      'X-User-Roles': authState.user.roles?.join(',') || '',
    },
  });

  if (!response.ok) {
    throw new Error('Failed to delete admin document');
  }
}
