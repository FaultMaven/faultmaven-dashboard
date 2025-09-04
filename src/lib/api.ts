import config from "../config";

// ===== Enhanced TypeScript Interfaces for v3.1.0 API =====

export interface Session {
  session_id: string;
  created_at: string;
  status: 'active' | 'idle' | 'expired';
  last_activity?: string;
  metadata?: Record<string, any>;
  // Additional fields that might be returned by backend
  user_id?: string;
  session_type?: string;
  usage_type?: string;
}

// New enhanced data structures based on OpenAPI spec
export interface UploadedData {
  data_id: string;
  session_id: string;
  data_type: 'log_file' | 'error_message' | 'stack_trace' | 'metrics_data' | 'config_file' | 'documentation' | 'unknown';
  content: string;
  file_name?: string;
  file_size?: number;
  uploaded_at: string;
  processing_status: string;
  insights?: Record<string, any>;
}

export interface DataUploadResponse {
  data_id: string;
  filename?: string;
  insights?: string;
  status: string;
}

// Enhanced query request with new fields
export interface QueryRequest {
  session_id: string;
  query: string;
  priority?: "low" | "normal" | "high" | "critical";
  context?: {
    uploaded_data_ids?: string[];
    page_url?: string;
    browser_info?: string;
    page_content?: string;
    text_data?: string;
    [key: string]: any;
  };
}

// New response types based on v3.1.0 API
export enum ResponseType {
  ANSWER = "ANSWER",
  PLAN_PROPOSAL = "PLAN_PROPOSAL",
  CLARIFICATION_REQUEST = "CLARIFICATION_REQUEST",
  CONFIRMATION_REQUEST = "CONFIRMATION_REQUEST",
  SOLUTION_READY = "SOLUTION_READY",
  NEEDS_MORE_DATA = "NEEDS_MORE_DATA",
  ESCALATION_REQUIRED = "ESCALATION_REQUIRED"
}

export interface Source {
  type: 'log_analysis' | 'knowledge_base' | 'user_input' | 'system_metrics' | 'external_api' | 'previous_case';
  content: string;
  confidence?: number;
  metadata?: Record<string, any>;
}

export interface PlanStep {
  step_number: number;
  action: string;
  description: string;
  estimated_time?: string;
  dependencies?: number[];
  required_tools?: string[];
}

export interface ViewState {
  show_upload_button?: boolean;
  show_plan_actions?: boolean;
  show_confirmation_dialog?: boolean;
  highlighted_sections?: string[];
  custom_actions?: Array<{
    label: string;
    action: string;
    style?: string;
  }>;
}

// New enhanced AgentResponse based on v3.1.0 API
export interface AgentResponse {
  response_type: ResponseType;
  content: string;
  session_id: string;
  case_id?: string;
  confidence_score?: number;
  sources?: Source[];
  plan?: PlanStep;
  estimated_time_to_resolution?: string;
  next_action_hint?: string;
  view_state?: ViewState;
  metadata?: Record<string, any>;
}

// New dedicated title generation interfaces
export interface TitleGenerateRequest {
  session_id: string;
  context?: {
    last_user_message?: string;
    summary?: string;
    messages?: string;
    notes?: string;
  };
  max_words?: number; // 3-12, default 8
}

export interface TitleResponse {
  schema_version: string;
  title: string;
  view_state?: ViewState;
}

// Enhanced troubleshooting response for backward compatibility
export interface TroubleshootingResponse {
  response: string;
  findings?: Array<{
    details?: string;
    message?: string;
    [key: string]: any;
  }>;
  recommendations?: string[];
  confidence_score?: number;
  session_id: string;
}

// Enhanced knowledge base document structure with canonical document types
export type DocumentType = 'playbook' | 'troubleshooting_guide' | 'reference' | 'how_to';

export interface KnowledgeDocument {
  document_id: string;
  title: string;
  content?: string;           // only present for GET by id or search snippet
  document_type: DocumentType;
  category?: string;
  tags: string[];
  source_url?: string;
  description?: string;
  status?: string;
  created_at?: string;        // ISO UTC
  updated_at?: string;        // ISO UTC
  metadata?: Record<string, any>;
}

export interface DocumentListResponse {
  documents: KnowledgeDocument[];
  total_count: number;
  limit: number;
  offset: number;
  filters: { document_type?: string; tags?: string[] };
}

// Legacy interface for backward compatibility
export interface KbDocument extends KnowledgeDocument {
  content: string;  // Make content required for legacy compatibility
  status: string;   // Make status required for legacy compatibility
  created_at: string; // Make created_at required for legacy compatibility
  updated_at: string; // Make updated_at required for legacy compatibility
}

// New error response structure
export interface APIError {
  detail: string;
  error_type?: string;
  correlation_id?: string;
  timestamp?: string;
  context?: Record<string, any>;
}

// ===== Enhanced API Functions =====

/**
 * Create a new session with enhanced metadata support
 */
export async function createSession(metadata?: Record<string, any>): Promise<Session> {
  const url = new URL(`${config.apiUrl}/api/v1/sessions/`);
  
  const requestBody = metadata ? { metadata } : {};
  
  const response = await fetch(url.toString(), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) {
    const errorData: APIError = await response.json().catch(() => ({}));
    throw new Error(errorData.detail || `Failed to create session: ${response.status}`);
  }

  return response.json();
}

/**
 * Enhanced query processing with new response types
 */
// DEPRECATED: processQuery via agent route is removed in case-centric API. Do not use.

/**
 * Legacy troubleshooting endpoint for backward compatibility
 */
export async function troubleshoot(request: QueryRequest): Promise<TroubleshootingResponse> {
  const response = await fetch(`${config.apiUrl}/api/v1/agent/troubleshoot`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(request),
  });

  if (!response.ok) {
    const errorData: APIError = await response.json().catch(() => ({}));
    throw new Error(errorData.detail || `Failed to troubleshoot: ${response.status}`);
  }

  return response.json();
}

/**
 * Enhanced data upload with new endpoint and response structure
 */
export async function uploadData(sessionId: string, data: File | string, dataType: 'file' | 'text' | 'page'): Promise<UploadedData> {
  const formData = new FormData();
  formData.append('session_id', sessionId);
  
  if (data instanceof File) {
    formData.append('file', data);
  } else {
    // For text/page content, create a text file
    const blob = new Blob([data], { type: 'text/plain' });
    const file = new File([blob], 'content.txt', { type: 'text/plain' });
    formData.append('file', file);
  }

  const response = await fetch(`${config.apiUrl}/api/v1/data/upload`, {
    method: 'POST',
    body: formData,
  });

  if (!response.ok) {
    const errorData: APIError = await response.json().catch(() => ({}));
    throw new Error(errorData.detail || `Failed to upload data: ${response.status}`);
  }

  return response.json();
}

/**
 * Batch upload multiple files
 */
export async function batchUploadData(sessionId: string, files: File[]): Promise<UploadedData[]> {
  const formData = new FormData();
  formData.append('session_id', sessionId);
  
  files.forEach((file, index) => {
    formData.append('files', file);
  });

  const response = await fetch(`${config.apiUrl}/api/v1/data/batch-upload`, {
    method: 'POST',
    body: formData,
  });

  if (!response.ok) {
    const errorData: APIError = await response.json().catch(() => ({}));
    throw new Error(errorData.detail || `Failed to batch upload data: ${response.status}`);
  }

  return response.json();
}

/**
 * Get session data with pagination
 */
export async function getSessionData(sessionId: string, limit: number = 10, offset: number = 0): Promise<UploadedData[]> {
  const url = new URL(`${config.apiUrl}/api/v1/data/sessions/${sessionId}`);
  url.searchParams.append('limit', limit.toString());
  url.searchParams.append('offset', offset.toString());

  const response = await fetch(url.toString(), {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    const errorData: APIError = await response.json().catch(() => ({}));
    throw new Error(errorData.detail || `Failed to get session data: ${response.status}`);
  }

  const data = await response.json();
  // Ensure we always return an array
  return Array.isArray(data) ? data : [];
}

/**
 * Enhanced knowledge base document upload matching API spec
 */
export async function uploadKnowledgeDocument(
  file: File,
  title: string,
  documentType: DocumentType, // Required, no default
  category?: string,
  tags?: string,
  sourceUrl?: string,
  description?: string
): Promise<KnowledgeDocument> {
  // Fix MIME type detection for common file extensions
  // This maps file extensions to the exact MIME types expected by the backend
  const getCorrectMimeType = (fileName: string, originalType: string): string => {
    if (!fileName || typeof fileName !== 'string') {
      return originalType;
    }
    
    const extension = fileName.toLowerCase().split('.').pop();
    if (!extension) {
      return originalType;
    }
    
    // Map file extensions to correct MIME types that backend accepts
    // These MIME types come from backend error: "Allowed types: text/plain, text/markdown, etc."
    const mimeTypeMap: Record<string, string> = {
      'md': 'text/markdown',
      'markdown': 'text/markdown', 
      'txt': 'text/plain',
      'log': 'text/plain',
      'json': 'application/json',
      'csv': 'text/csv',
      'pdf': 'application/pdf',
      'doc': 'application/msword',
      'docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    };
    
    const correctedType = mimeTypeMap[extension];
    if (correctedType) {
      if (correctedType !== originalType) {
        console.log(`[API] Corrected MIME type for ${fileName}: ${originalType} → ${correctedType}`);
      }
      return correctedType;
    }
    
    // If no extension mapping found, return original type
    return originalType;
  };

  // Create a new File object with correct MIME type if needed
  const correctMimeType = getCorrectMimeType(file.name, file.type);
  const fileToUpload = correctMimeType !== file.type 
    ? new File([file], file.name, { type: correctMimeType, lastModified: file.lastModified })
    : file;

  const formData = new FormData();
  formData.append('file', fileToUpload);
  formData.append('title', title);
  formData.append('document_type', documentType);
  
  if (category) formData.append('category', category);
  if (tags) formData.append('tags', tags);  // Already comma-separated string from UI
  if (sourceUrl) formData.append('source_url', sourceUrl);
  if (description) formData.append('description', description);

  console.log(`[API] Uploading knowledge document: ${title}`);
  console.log(`[API] Original file type: ${file.type}, Corrected type: ${fileToUpload.type}`);
  console.log(`[API] File name: ${file.name}, File size: ${file.size} bytes`);

  const response = await fetch(`${config.apiUrl}/api/v1/knowledge/documents`, {
    method: 'POST',
    body: formData,
  });

  if (!response.ok) {
    const errorData: APIError = await response.json().catch(() => ({}));
    console.error('[API] Upload failed:', response.status, errorData);
    throw new Error(errorData.detail || `Upload failed: ${response.status}`);
  }

  const uploadedDocument = await response.json();
  console.log('[API] Document uploaded successfully:', uploadedDocument);
  return uploadedDocument;
}

/**
 * Enhanced knowledge base document retrieval with proper response handling
 */
export async function getKnowledgeDocuments(
  documentType?: string,
  tags?: string,
  limit: number = 50,
  offset: number = 0
): Promise<DocumentListResponse> {
  const url = new URL(`${config.apiUrl}/api/v1/knowledge/documents`);
  
  if (documentType) url.searchParams.append('document_type', documentType);
  if (tags) url.searchParams.append('tags', tags);
  url.searchParams.append('limit', limit.toString());
  url.searchParams.append('offset', offset.toString());

  console.log('[API] Fetching knowledge documents from:', url.toString());

  const response = await fetch(url.toString(), {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    const errorData: APIError = await response.json().catch(() => ({}));
    console.error('[API] Failed to fetch documents:', response.status, errorData);
    throw new Error(errorData.detail || `Failed to fetch documents: ${response.status}`);
  }

  const data = await response.json();
  console.log('[API] Received knowledge documents:', data);
  
  // Handle different possible response formats and return proper DocumentListResponse
  if (data && typeof data === 'object' && data.documents && Array.isArray(data.documents)) {
    // New API format with metadata
    const response: DocumentListResponse = {
      documents: data.documents,
      total_count: data.total_count || data.documents.length,
      limit: data.limit || limit,
      offset: data.offset || offset,
      filters: data.filters || {}
    };
    console.log(`[API] Returning ${response.documents.length} documents with metadata`);
    return response;
  } else if (Array.isArray(data)) {
    // Legacy format - just array of documents
    const response: DocumentListResponse = {
      documents: data,
      total_count: data.length,
      limit: limit,
      offset: offset,
      filters: {}
    };
    console.log(`[API] Returning ${response.documents.length} documents (legacy format)`);
    return response;
  } else {
    console.warn('[API] Unexpected response format for documents:', data);
    return {
      documents: [],
      total_count: 0,
      limit: limit,
      offset: offset,
      filters: {}
    };
  }
}

/**
 * Get individual knowledge base document by ID
 */
export async function getKnowledgeDocument(documentId: string): Promise<KnowledgeDocument> {
  const response = await fetch(`${config.apiUrl}/api/v1/knowledge/documents/${documentId}`, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    const errorData: APIError = await response.json().catch(() => ({}));
    throw new Error(errorData.detail || `Failed to get document: ${response.status}`);
  }

  return response.json();
}

/**
 * Update knowledge base document metadata
 */
export async function updateKnowledgeDocument(
  documentId: string,
  updates: {
    title?: string;
    content?: string;
    tags?: string;
    document_type?: DocumentType;
    category?: string;
    version?: string;
    description?: string;
  }
): Promise<KnowledgeDocument> {
  const response = await fetch(`${config.apiUrl}/api/v1/knowledge/documents/${documentId}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(updates),
  });

  if (!response.ok) {
    const errorData: APIError = await response.json().catch(() => ({}));
    throw new Error(errorData.detail || `Failed to update document: ${response.status}`);
  }

  return response.json();
}

/**
 * Enhanced knowledge base document deletion
 */
export async function deleteKnowledgeDocument(documentId: string): Promise<void> {
  const response = await fetch(`${config.apiUrl}/api/v1/knowledge/documents/${documentId}`, {
    method: 'DELETE',
    headers: {
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    const errorData: APIError = await response.json().catch(() => ({}));
    throw new Error(errorData.detail || `Failed to delete document: ${response.status}`);
  }
}

/**
 * Search knowledge base documents matching API spec
 */
export async function searchKnowledgeBase(
  query: string,
  limit: number = 10,
  includeMetadata: boolean = true,
  similarityThreshold: number = 0.7,
  filters?: { category?: string; document_type?: DocumentType }
): Promise<{
  query: string;
  total_results: number;
  results: Array<{
    document_id: string;
    content: string;
    metadata: {
      title: string;
      document_type: DocumentType;
      category?: string;
      tags: string[];
      priority?: number;
    };
    similarity_score: number;
  }>;
}> {
  const response = await fetch(`${config.apiUrl}/api/v1/knowledge/search`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      query,
      limit,
      include_metadata: includeMetadata,
      similarity_threshold: similarityThreshold,
      filters: filters || {}
    }),
  });

  if (!response.ok) {
    const errorData: APIError = await response.json().catch(() => ({}));
    throw new Error(errorData.detail || `Search failed: ${response.status}`);
  }

  return response.json();
}

/**
 * Get session details
 */
export async function getSession(sessionId: string): Promise<Session> {
  const response = await fetch(`${config.apiUrl}/api/v1/sessions/${sessionId}`, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    const errorData: APIError = await response.json().catch(() => ({}));
    throw new Error(errorData.detail || `Failed to get session: ${response.status}`);
  }

  return response.json();
}

/**
 * Delete a session
 */
export async function deleteSession(sessionId: string): Promise<void> {
  const response = await fetch(`${config.apiUrl}/api/v1/sessions/${sessionId}`, {
    method: 'DELETE',
    headers: {
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    const errorData: APIError = await response.json().catch(() => ({}));
    throw new Error(errorData.detail || `Failed to delete session: ${response.status}`);
  }
} 

// ===== Chat and Cases: Types and Functions required by UI =====
export interface UserCase {
  case_id: string;
  session_id?: string;
  status: string;
  title: string;
  description?: string;
  priority?: 'low' | 'medium' | 'high' | 'critical' | string;
  created_at?: string;
  updated_at?: string;
  resolved_at?: string;
  message_count?: number;
}

export interface CreateCaseRequest {
  title?: string;
  priority?: 'low' | 'medium' | 'high' | 'critical';
  metadata?: Record<string, any>;
  session_id?: string;
  initial_message?: string;
}

export async function createCase(data: CreateCaseRequest): Promise<UserCase> {
  const response = await fetch(`${config.apiUrl}/api/v1/cases`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data || {}),
    credentials: 'include'
  });
  const corr = response.headers.get('x-correlation-id') || response.headers.get('X-Correlation-ID');
  console.log('[API] createCase', { status: response.status, correlationId: corr });
  if (!response.ok) {
    const errorData: APIError = await response.json().catch(() => ({} as any));
    throw new Error(errorData.detail || `Failed to create case: ${response.status}`);
  }
  const json = await response.json().catch(() => ({} as any));
  if (json && json.case && json.case.case_id) {
    return json.case as UserCase;
  }
  if (json && json.case_id) {
    return json as UserCase;
  }
  throw new Error('Invalid CaseResponse shape from server');
}

export async function listSessionCases(sessionId: string, limit = 20, offset = 0): Promise<UserCase[]> {
  const url = new URL(`${config.apiUrl}/api/v1/sessions/${sessionId}/cases`);
  url.searchParams.append('limit', String(limit));
  url.searchParams.append('offset', String(offset));
  const response = await fetch(url.toString(), { method: 'GET', headers: { 'Content-Type': 'application/json' }, credentials: 'include' });
  if (!response.ok) {
    const errorData: APIError = await response.json().catch(() => ({}));
    throw new Error(errorData.detail || `Failed to list session cases: ${response.status}`);
  }
  const data = await response.json().catch(() => []);
  return Array.isArray(data) ? data : [];
}

export async function submitQueryToCase(caseId: string, request: QueryRequest): Promise<AgentResponse> {
  if (!request?.session_id || !request?.query) {
    throw new Error('Missing required fields: session_id and query');
  }
  const body = {
    session_id: request.session_id,
    query: request.query,
    context: request.context || {},
    priority: request.priority || 'medium'
  } as const;
  const response = await fetch(`${config.apiUrl}/api/v1/cases/${caseId}/queries`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    credentials: 'include'
  });
  const corr = response.headers.get('x-correlation-id') || response.headers.get('X-Correlation-ID');
  console.log('[API] submitQueryToCase POST', { caseId, status: response.status, location: response.headers.get('Location'), correlationId: corr, body });

  // Handle validation errors explicitly
  if (response.status === 422) {
    let detail: any = 'Validation failed (422)';
    try {
      const errJson = await response.json();
      const inner = errJson?.detail?.error?.message || errJson?.detail || errJson;
      if (typeof inner === 'string') detail = inner;
      else detail = JSON.stringify(inner);
    } catch {}
    throw new Error(`422 Unprocessable Entity: ${detail}`);
  }

  // Configuration for polling with exponential backoff
  const POLL_INITIAL_MS = Number((import.meta as any).env?.VITE_POLL_INITIAL_MS ?? 1500);
  const POLL_BACKOFF = Number((import.meta as any).env?.VITE_POLL_BACKOFF ?? 1.5);
  const POLL_MAX_MS = Number((import.meta as any).env?.VITE_POLL_MAX_MS ?? 10000);
  const POLL_MAX_TOTAL_MS = Number((import.meta as any).env?.VITE_POLL_MAX_TOTAL_MS ?? 300000); // 5 minutes

  // Handle async 202 Accepted with polling
  if (response.status === 202) {
    const location = response.headers.get('Location');
    if (!location) throw new Error('Missing Location header for async query');
    const jobUrl = new URL(location, config.apiUrl).toString();
    let delay = POLL_INITIAL_MS;
    let elapsed = 0;
    for (let i = 0; elapsed <= POLL_MAX_TOTAL_MS; i++) {
      const res = await fetch(jobUrl, { method: 'GET', credentials: 'include' });
      const lcorr = res.headers.get('x-correlation-id') || res.headers.get('X-Correlation-ID');
      if (lcorr) console.log('[API] poll job', { i, correlationId: lcorr, status: res.status });
      if (res.status >= 500) {
        throw new Error(`Server error while polling job (${res.status})`);
      }
      if (res.status === 303) {
        const finalLoc = res.headers.get('Location');
        if (!finalLoc) throw new Error('Missing final resource Location');
        const finalUrl = new URL(finalLoc, config.apiUrl).toString();
        const finalRes = await fetch(finalUrl, { method: 'GET', credentials: 'include' });
        const fcorr = finalRes.headers.get('x-correlation-id') || finalRes.headers.get('X-Correlation-ID');
        if (fcorr) console.log('[API] poll final', { correlationId: fcorr, status: finalRes.status });
        if (finalRes.status >= 500) {
          throw new Error(`Server error fetching final resource (${finalRes.status})`);
        }
        if (!finalRes.ok) throw new Error(`Final resource fetch failed: ${finalRes.status}`);
        const finalJson = await finalRes.json();
        if (finalJson && finalJson.content && finalJson.response_type) return finalJson as AgentResponse;
        if (finalJson?.response?.content && finalJson?.response?.response_type) return finalJson.response as AgentResponse;
        throw new Error('Unexpected final resource payload');
      }
      const json = await res.json().catch(() => ({}));
      if (json && json.content && json.response_type) return json as AgentResponse;
      if (json?.status === 'completed') {
        if (json?.response?.content && json?.response?.response_type) return json.response as AgentResponse;
        throw new Error('Completed without AgentResponse');
      }
      if (json?.status === 'failed') throw new Error(json?.error?.message || 'Query failed');
      await new Promise(r => setTimeout(r, delay));
      elapsed += delay;
      delay = Math.min(Math.floor(delay * POLL_BACKOFF), POLL_MAX_MS);
    }
    throw new Error(`Async query polling timed out after ${Math.round(POLL_MAX_TOTAL_MS/1000)}s`);
  }

  // Handle 201 Created
  if (response.status === 201) {
    // First, attempt to parse an immediate AgentResponse from the body (sync processing)
    try {
      const immediate = await response.clone().json().catch(() => null);
      if (immediate) {
        if (immediate && immediate.content && immediate.response_type) return immediate as AgentResponse;
        if (immediate?.response?.content && immediate?.response?.response_type) return immediate.response as AgentResponse;
      }
    } catch {}
    // If no immediate body result, and there is a Location header, poll created resource
    const createdLoc = response.headers.get('Location');
    if (createdLoc) {
      const createdUrl = new URL(createdLoc, config.apiUrl).toString();
      // Poll the created resource until it contains an AgentResponse or redirects to final
      let delay = POLL_INITIAL_MS;
      let elapsed = 0;
      for (let i = 0; elapsed <= POLL_MAX_TOTAL_MS; i++) {
        const createdRes = await fetch(createdUrl, { method: 'GET', credentials: 'include' });
        const ccorr = createdRes.headers.get('x-correlation-id') || createdRes.headers.get('X-Correlation-ID');
        if (ccorr) console.log('[API] poll created', { i, correlationId: ccorr, status: createdRes.status });
        if (createdRes.status >= 500) {
          throw new Error(`Server error on created resource (${createdRes.status})`);
        }
        if (createdRes.status === 303) {
          const finalLoc = createdRes.headers.get('Location');
          if (!finalLoc) throw new Error('Missing final resource Location');
          const finalUrl = new URL(finalLoc, config.apiUrl).toString();
          const finalRes = await fetch(finalUrl, { method: 'GET', credentials: 'include' });
          const fcorr = finalRes.headers.get('x-correlation-id') || finalRes.headers.get('X-Correlation-ID');
          if (fcorr) console.log('[API] poll final', { correlationId: fcorr, status: finalRes.status });
          if (finalRes.status >= 500) {
            throw new Error(`Server error fetching final resource (${finalRes.status})`);
          }
          if (!finalRes.ok) throw new Error(`Final resource fetch failed: ${finalRes.status}`);
          const finalJson = await finalRes.json().catch(() => ({}));
          if (finalJson && finalJson.content && finalJson.response_type) return finalJson as AgentResponse;
          if (finalJson?.response?.content && finalJson?.response?.response_type) return finalJson.response as AgentResponse;
          throw new Error('Unexpected final resource payload');
        }
        if (createdRes.status === 200) {
          const createdJson = await createdRes.json().catch(() => ({}));
          if (createdJson && createdJson.content && createdJson.response_type) return createdJson as AgentResponse;
          if (createdJson?.response?.content && createdJson?.response?.response_type) return createdJson.response as AgentResponse;
          // If the created resource returns a job envelope, continue polling
          if (createdJson?.status && createdJson?.status !== 'failed') {
            await new Promise(r => setTimeout(r, delay));
            elapsed += delay;
            delay = Math.min(Math.floor(delay * POLL_BACKOFF), POLL_MAX_MS);
            continue;
          }
          if (createdJson?.status === 'failed') throw new Error(createdJson?.error?.message || 'Query failed');
        }
        await new Promise(r => setTimeout(r, delay));
        elapsed += delay;
        delay = Math.min(Math.floor(delay * POLL_BACKOFF), POLL_MAX_MS);
      }
      throw new Error(`Created query polling timed out after ${Math.round(POLL_MAX_TOTAL_MS/1000)}s`);
    }
    // No body result and no Location — fall through to generic handling
  }

  // Fallback: expect a body with AgentResponse
  if (!response.ok) {
    const errorData: APIError = await response.json().catch(() => ({}));
    throw new Error(errorData.detail || `Failed to submit query to case: ${response.status}`);
  }
  const json = await response.json();
  return json as AgentResponse;
}

export async function uploadDataToCase(
  caseId: string,
  sessionId: string,
  file: File,
  metadata?: Record<string, any>
): Promise<UploadedData> {
  const form = new FormData();
  form.append('session_id', sessionId);
  form.append('file', file);
  if (metadata) form.append('description', JSON.stringify(metadata));
  const response = await fetch(`${config.apiUrl}/api/v1/cases/${caseId}/data`, { method: 'POST', body: form, credentials: 'include' });
  if (response.status === 202) {
    const jobLocation = response.headers.get('Location');
    if (!jobLocation) throw new Error('Missing job Location header');
    for (let i = 0; i < 20; i++) {
      const jobRes = await fetch(jobLocation, { method: 'GET' });
      const jobJson = await jobRes.json();
      if (jobJson.status === 'completed' && jobJson.result) return jobJson.result;
      if (jobJson.status === 'failed') throw new Error(jobJson.error?.message || 'Upload job failed');
      await new Promise(r => setTimeout(r, 1500));
    }
    throw new Error('Upload job polling timed out');
  }
  if (!response.ok) {
    const errorData: APIError = await response.json().catch(() => ({}));
    throw new Error(errorData.detail || `Failed to upload data to case: ${response.status}`);
  }
  return response.json();
}

export async function heartbeatSession(sessionId: string): Promise<void> {
  const response = await fetch(`${config.apiUrl}/api/v1/sessions/${sessionId}/heartbeat`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    credentials: 'include'
  });
  if (!response.ok) {
    const errorData: APIError = await response.json().catch(() => ({}));
    throw new Error(errorData.detail || `Failed to heartbeat session: ${response.status}`);
  }
}

export async function generateConversationTitle(sessionId: string, lastUserMessage?: string): Promise<{ title: string }> {
  // Deprecated: agent routes removed. Use generateCaseTitle instead.
  return { title: `chat-${new Date().toISOString()}` };
}

async function generateConversationTitleLegacy(sessionId: string): Promise<{ title: string }> {
  return { title: `chat-${new Date().toISOString()}` };
} 

// Case-scoped title generation aligned with case-centric API
export async function generateCaseTitle(
  caseId: string,
  options?: { max_words?: number; hint?: string }
): Promise<{ title: string }> {
  const body: Record<string, any> = {};
  if (options?.max_words) body.max_words = options.max_words;
  if (options?.hint) body.hint = options.hint;
  const response = await fetch(`${config.apiUrl}/api/v1/cases/${caseId}/title`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: Object.keys(body).length ? JSON.stringify(body) : undefined,
    credentials: 'include'
  });
  if (response.status === 422) {
    throw new Error('Insufficient context to generate title');
  }
  if (!response.ok) {
    const errorData: APIError = await response.json().catch(() => ({}));
    throw new Error(errorData.detail || `Failed to generate case title: ${response.status}`);
  }
  const result: TitleResponse = await response.json();
  const t = (result?.title || '').trim();
  return { title: t || `chat-${new Date().toISOString()}` };
}

// ===== Auth types for login/verification =====
export interface AuthUser {
  user_id: string;
  email: string;
  name: string;
}

export interface AuthViewState {
  session_id: string;
  user: AuthUser;
  active_case?: any;
  cases?: any[];
  messages?: any[];
  uploaded_data?: any[];
  show_case_selector?: boolean;
  show_data_upload?: boolean;
}

export interface AuthResponse {
  schema_version: string;
  success: boolean;
  view_state: AuthViewState;
}

export async function devLogin(username: string): Promise<AuthResponse> {
  const response = await fetch(`${config.apiUrl}/api/v1/auth/dev-login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username }),
    credentials: 'include'
  });
  if (!response.ok) {
    const errorData: APIError = await response.json().catch(() => ({}));
    throw new Error(errorData.detail || `Login failed: ${response.status}`);
  }
  return response.json();
}

export async function verifyAuthSession(sessionId: string): Promise<AuthResponse> {
  const response = await fetch(`${config.apiUrl}/api/v1/auth/session/${sessionId}`, {
    method: 'GET',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include'
  });
  if (!response.ok) {
    const errorData: APIError = await response.json().catch(() => ({}));
    throw new Error(errorData.detail || `Session verification failed: ${response.status}`);
  }
  return response.json();
}

export async function logoutAuth(): Promise<void> {
  const response = await fetch(`${config.apiUrl}/api/v1/auth/logout`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include'
  });
  if (!response.ok) {
    const errorData: APIError = await response.json().catch(() => ({}));
    throw new Error(errorData.detail || `Logout failed: ${response.status}`);
  }
}

// ===== Sessions listing (sidebar initial load compatibility) =====
export async function listSessions(filters?: {
  user_id?: string;
  session_type?: string;
  usage_type?: string;
  limit?: number;
  offset?: number;
}): Promise<Session[]> {
  const url = new URL(`${config.apiUrl}/api/v1/sessions/`);
  if (filters) {
    Object.entries(filters).forEach(([k, v]) => {
      if (v !== undefined) url.searchParams.append(k, String(v));
    });
  }
  const response = await fetch(url.toString(), { method: 'GET', headers: { 'Content-Type': 'application/json' } });
  if (!response.ok) {
    const errorData: APIError = await response.json().catch(() => ({}));
    throw new Error(errorData.detail || `Failed to list sessions: ${response.status}`);
  }
  const data = await response.json().catch(() => []);
  if (Array.isArray(data)) return data as Session[];
  if (data && Array.isArray(data.sessions)) return data.sessions as Session[];
  if (data && Array.isArray(data.items)) return data.items as Session[];
  return [];
}

// ===== Global cases listing for sidebar =====
export async function getUserCases(filters?: {
  status?: string;
  priority?: string;
  limit?: number;
  offset?: number;
}): Promise<UserCase[]> {
  const url = new URL(`${config.apiUrl}/api/v1/cases`);
  if (filters) {
    Object.entries(filters).forEach(([k, v]) => {
      if (v !== undefined) url.searchParams.append(k, String(v));
    });
  }
  const response = await fetch(url.toString(), { method: 'GET', headers: { 'Content-Type': 'application/json' }, credentials: 'include' });
  if (!response.ok) {
    const errorData: APIError = await response.json().catch(() => ({}));
    throw new Error(errorData.detail || `Failed to get cases: ${response.status}`);
  }
  const data = await response.json().catch(() => []);
  return Array.isArray(data) ? (data as UserCase[]) : [];
} 

export async function archiveCase(caseId: string): Promise<void> {
  const response = await fetch(`${config.apiUrl}/api/v1/cases/${caseId}/archive`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include'
  });
  if (!response.ok) {
    const errorData: APIError = await response.json().catch(() => ({}));
    throw new Error(errorData.detail || `Failed to archive case: ${response.status}`);
  }
} 

export async function deleteCase(caseId: string): Promise<void> {
  const response = await fetch(`${config.apiUrl}/api/v1/cases/${caseId}`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include'
  });
  if (!response.ok && response.status !== 204) {
    const errorData: APIError = await response.json().catch(() => ({}));
    throw new Error(errorData.detail || `Failed to delete case: ${response.status}`);
  }
} 

export interface CaseUpdateRequest {
  title?: string;
  description?: string;
  status?: string;
  priority?: 'low' | 'medium' | 'high' | 'critical';
}

export async function updateCaseTitle(caseId: string, title: string): Promise<void> {
  const response = await fetch(`${config.apiUrl}/api/v1/cases/${caseId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title } as CaseUpdateRequest),
    credentials: 'include'
  });
  const corr = response.headers.get('x-correlation-id') || response.headers.get('X-Correlation-ID');
  console.log('[API] updateCaseTitle', { caseId, status: response.status, correlationId: corr });
  if (!response.ok) {
    const errorData: APIError = await response.json().catch(() => ({}));
    throw new Error(errorData.detail || `Failed to update case: ${response.status}`);
  }
}

export async function getCaseConversation(caseId: string): Promise<any> {
  const response = await fetch(`${config.apiUrl}/api/v1/cases/${caseId}/conversation`, {
    method: 'GET',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include'
  });
  const corr = response.headers.get('x-correlation-id') || response.headers.get('X-Correlation-ID');
  console.log('[API] getCaseConversation', { caseId, status: response.status, correlationId: corr });
  if (!response.ok) {
    const errorData: APIError = await response.json().catch(() => ({}));
    throw new Error(errorData.detail || `Failed to get case conversation: ${response.status}`);
  }
  return response.json();
} 