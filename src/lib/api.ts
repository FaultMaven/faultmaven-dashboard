// Simplified API client for FaultMaven Dashboard
import config from "../config";

// Use the global browser object provided by storage adapter
declare global {
  interface Window {
    browser?: {
      storage: {
        local: {
          get(keys: string[]): Promise<Record<string, unknown>>;
          set(items: Record<string, unknown>): Promise<void>;
          remove(keys: string[]): Promise<void>;
        };
      };
    };
  }
}

const browser = typeof window !== 'undefined' ? window.browser : undefined;

// ===== Authentication =====

export interface AuthState {
  access_token: string;
  token_type: 'bearer';
  expires_at: number;
  user: {
    user_id: string;
    username: string;
    email: string;
    display_name: string;
    is_dev_user: boolean;
    is_active: boolean;
    roles?: string[];
    is_admin?: boolean;
  };
}

class AuthManager {
  async saveAuthState(authState: AuthState): Promise<void> {
    if (browser?.storage) {
      await browser.storage.local.set({ authState });
    }
  }

  async getAuthState(): Promise<AuthState | null> {
    try {
      if (browser?.storage) {
        const result = (await browser.storage.local.get(['authState'])) as { authState?: AuthState };
        const authState = result.authState;

        if (!authState) return null;

        // Check if token is expired
        if (Date.now() >= authState.expires_at) {
          await this.clearAuthState();
          return null;
        }

        return authState;
      }
    } catch (error: unknown) {
      console.error('[AuthManager] Failed to get auth state:', error);
    }
    return null;
  }

  async clearAuthState(): Promise<void> {
    if (browser?.storage) {
      await browser.storage.local.remove(['authState']);
    }
  }

  async getAccessToken(): Promise<string | null> {
    const authState = await this.getAuthState();
    return authState?.access_token || null;
  }
}

export const authManager = new AuthManager();

// ===== API Functions =====

export class AuthenticationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AuthenticationError';
  }
}

/**
 * Development login (no password required)
 */
export async function devLogin(username: string): Promise<AuthState> {
  const response = await fetch(`${config.apiUrl}/api/v1/auth/dev-login`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ username }),
  });

  if (!response.ok) {
    throw new AuthenticationError('Login failed');
  }

  const authState = await response.json();
  await authManager.saveAuthState(authState);
  return authState;
}

/**
 * Logout and clear auth state
 */
export async function logoutAuth(): Promise<void> {
  try {
    const token = await authManager.getAccessToken();
    if (token) {
      await fetch(`${config.apiUrl}/v1/auth/logout`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });
    }
  } catch (error) {
    console.error('Logout error:', error);
  } finally {
    await authManager.clearAuthState();
  }
}

// ===== Knowledge Base API =====

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

export interface AdminKBDocument {
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
  documents: KBDocument[];
  total_count: number;
  limit: number;
  offset: number;
}

export interface AdminDocumentListResponse {
  documents: AdminKBDocument[];
  total_count: number;
  limit: number;
  offset: number;
}

export interface UploadDocumentParams {
  file: File;
  title: string;
  document_type: string;
  tags?: string;
  source_url?: string;
  description?: string;
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

/**
 * Upload a document to the personal knowledge base
 */
export async function uploadDocument(params: UploadDocumentParams): Promise<KBDocument> {
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

  if (params.tags) {
    formData.append('tags', params.tags);
  }
  if (params.source_url) {
    formData.append('source_url', params.source_url);
  }
  if (params.description) {
    formData.append('description', params.description);
  }

  const response = await fetch(`${config.apiUrl}/api/v1/documents/upload`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'X-User-ID': authState.user.user_id,
    },
    body: formData,
  });

  if (!response.ok) {
    const error = (await response.json().catch(() => ({ detail: 'Upload failed' }))) as { detail?: string };
    throw new Error(error.detail || 'Upload failed');
  }

  return await response.json();
}

/**
 * List documents from the personal knowledge base
 */
export async function listDocuments(params?: {
  limit?: number;
  offset?: number;
  document_type?: string;
}): Promise<DocumentListResponse> {
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

  const url = `${config.apiUrl}/api/v1/documents?${queryParams.toString()}`;

  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${token}`,
      'X-User-ID': authState.user.user_id,
    },
  });

  if (!response.ok) {
    throw new Error('Failed to list documents');
  }

  return await response.json();
}

/**
 * Delete a document from the personal knowledge base
 */
export async function deleteDocument(documentId: string): Promise<void> {
  const token = await authManager.getAccessToken();
  if (!token) {
    throw new AuthenticationError('Not authenticated');
  }

  const authState = await authManager.getAuthState();
  if (!authState) {
    throw new AuthenticationError('Not authenticated');
  }

  const response = await fetch(`${config.apiUrl}/api/v1/documents/${documentId}`, {
    method: 'DELETE',
    headers: {
      'Authorization': `Bearer ${token}`,
      'X-User-ID': authState.user.user_id,
    },
  });

  if (!response.ok) {
    throw new Error('Failed to delete document');
  }
}

/**
 * Upload a document to the admin (system-wide) knowledge base
 */
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
  if (params.category) formData.append('category', params.category);
  if (params.tags) formData.append('tags', params.tags);
  if (params.source_url) formData.append('source_url', params.source_url);
  if (params.description) formData.append('description', params.description);

  const response = await fetch(`${config.apiUrl}/api/v1/admin/kb/documents`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'X-User-ID': authState.user.user_id,
      'X-User-Roles': authState.user.roles?.join(',') || '',
    },
    body: formData,
  });

  if (!response.ok) {
    const error = (await response.json().catch(() => ({ detail: 'Upload failed' }))) as { detail?: string; message?: string };
    throw new Error(error.detail || error.message || 'Upload failed');
  }

  return await response.json();
}

/**
 * List admin documents
 */
export async function listAdminDocuments(params?: { limit?: number; offset?: number; document_type?: string }): Promise<AdminDocumentListResponse> {
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

  const url = `${config.apiUrl}/api/v1/admin/kb/documents?${queryParams.toString()}`;

  const response = await fetch(url, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
      'X-User-ID': authState.user.user_id,
      'X-User-Roles': authState.user.roles?.join(',') || '',
    },
  });

  if (!response.ok) {
    throw new Error('Failed to list admin documents');
  }

  return await response.json();
}

/**
 * Delete an admin document
 */
export async function deleteAdminDocument(documentId: string): Promise<void> {
  const token = await authManager.getAccessToken();
  if (!token) {
    throw new AuthenticationError('Not authenticated');
  }

  const authState = await authManager.getAuthState();
  if (!authState) {
    throw new AuthenticationError('Not authenticated');
  }

  const response = await fetch(`${config.apiUrl}/api/v1/admin/kb/documents/${documentId}`, {
    method: 'DELETE',
    headers: {
      Authorization: `Bearer ${token}`,
      'X-User-ID': authState.user.user_id,
      'X-User-Roles': authState.user.roles?.join(',') || '',
    },
  });

  if (!response.ok) {
    throw new Error('Failed to delete admin document');
  }
}

// Export for use in pages
export { config };
