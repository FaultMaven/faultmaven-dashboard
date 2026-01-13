# FaultMaven Dashboard - Comprehensive Refactoring Report
**Date:** 2026-01-13
**Architect:** Solutions Architect Agent
**Repository:** `/home/swhouse/product/faultmaven-dashboard`

---

## Executive Summary

This report provides a comprehensive analysis of the faultmaven-dashboard codebase, identifying issues across configuration, architecture, code organization, type safety, and testing. The codebase is functional but has several opportunities for improvement in maintainability, type safety, and developer experience.

**Key Findings:**
- **Critical**: Outdated default API port configuration (8090 vs 8000)
- **High Priority**: 412-line monolithic API client needs modularization
- **Medium Priority**: Duplicate type definitions and limited test coverage
- **Low Priority**: Missing error handling utilities and documentation gaps

**Overall Health:** 7/10 - Functional and well-structured but needs refinement

---

## 1. Issue Analysis

### 1.1 Critical Issues (Severity: HIGH)

#### Issue #1: Outdated Default API Port Configuration
**Location:** `/home/swhouse/product/faultmaven-dashboard/src/config.ts:43`
```typescript
apiUrl: runtimeEnv?.API_URL || import.meta.env.VITE_API_URL || "http://127.0.0.1:8090",
```

**Problem:**
- Default port `8090` references deprecated API Gateway (microservices architecture)
- Current architecture uses monolithic API on port `8000`
- Comment on line 31 also mentions "local API Gateway" (outdated)
- `.env.example` correctly uses port `8000`, creating inconsistency

**Impact:**
- Developers without `.env` file will connect to wrong port
- Confusing onboarding experience
- Documentation-code mismatch

**Recommendation:** Change default to `http://127.0.0.1:8000`
**Risk Level:** LOW (only affects default fallback, not existing deployments)

#### Issue #2: Outdated Architecture Comments
**Location:** `/home/swhouse/product/faultmaven-dashboard/src/config.ts:31`
```typescript
// 3. Default: http://127.0.0.1:8090 - local API Gateway
```

**Problem:** References "API Gateway" which is legacy terminology from microservices era

**Recommendation:** Update to "local FaultMaven API" or "local monolithic API"
**Risk Level:** LOW (documentation only)

---

### 1.2 High Priority Issues (Severity: MEDIUM)

#### Issue #3: Monolithic API Client (412 lines)
**Location:** `/home/swhouse/product/faultmaven-dashboard/src/lib/api.ts`

**Problem:**
The `api.ts` file mixes multiple concerns in a single 412-line file:
1. **Authentication Logic** (lines 21-131)
   - `AuthState` interface
   - `AuthManager` class
   - `devLogin()`, `logoutAuth()` functions

2. **Knowledge Base API** (lines 133-409)
   - User KB functions: `uploadDocument()`, `listDocuments()`, `deleteDocument()`
   - Admin KB functions: `uploadAdminDocument()`, `listAdminDocuments()`, `deleteAdminDocument()`
   - Duplicate interfaces: `KBDocument` vs `AdminKBDocument` (identical definitions)

3. **Global Browser API Declaration** (lines 4-19)

**Impact:**
- Difficult to navigate (412 lines)
- Poor separation of concerns
- Harder to test in isolation
- Duplicate code between user/admin KB functions

**Recommended Structure:**
```
src/lib/
├── api/
│   ├── client.ts           # Shared fetch wrapper, error handling
│   ├── kb.ts               # Knowledge Base API (user + admin)
│   └── index.ts            # Public API exports
├── auth/
│   ├── AuthManager.ts      # AuthManager class
│   ├── auth-functions.ts   # devLogin, logoutAuth
│   ├── types.ts            # AuthState, AuthenticationError
│   └── index.ts            # Public auth exports
└── types/
    └── browser.d.ts        # Global browser API declarations
```

**Benefits:**
- Clear module boundaries (auth vs KB vs core client)
- Easier to locate and modify specific functionality
- Better testability (mock individual modules)
- Reduced file size (< 200 lines per file)

**Risk Level:** MEDIUM (requires careful refactoring, extensive testing)

---

#### Issue #4: Duplicate Type Definitions
**Location:** `/home/swhouse/product/faultmaven-dashboard/src/lib/api.ts:135-157`

**Problem:**
```typescript
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
```

These interfaces are **identical** - no structural differences.

**Impact:**
- Code duplication
- Maintenance burden (must update both)
- False sense of type differentiation
- Confusing for developers

**Recommendation:**
```typescript
// Option 1: Single interface with branded type
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

export type UserKBDocument = KBDocument;
export type AdminKBDocument = KBDocument;

// Option 2: If future differentiation needed, use discriminated union
export type KBDocumentScope = 'user' | 'admin';
export interface KBDocument {
  scope: KBDocumentScope;
  document_id: string;
  // ... rest of fields
}
```

**Risk Level:** LOW (type alias doesn't change runtime behavior)

---

#### Issue #5: Unclear api.generated.ts Origin
**Location:** `/home/swhouse/product/faultmaven-dashboard/src/types/api.generated.ts`

**Problem:**
- File header claims "auto-generated by openapi-typescript"
- No clear generation script in `package.json`
- File contains 50,641 tokens (very large)
- Unclear if it's actually auto-generated or manually maintained
- Used by `case.ts` but not by main API client

**Analysis:**
```typescript
// src/types/case.ts imports from it
import { components } from './api.generated';

// But src/lib/api.ts does NOT use it
// All types are manually defined in api.ts
```

**Impact:**
- Potential drift between generated types and API client types
- Unclear source of truth for API contracts
- Large file size (parsing performance)

**Questions to Answer:**
1. Is this actually generated? If so, from where?
2. Should `lib/api.ts` use these types instead of manual definitions?
3. If not used, can it be removed?

**Recommendation:**
1. Check for OpenAPI spec file: `find . -name "*.yaml" -o -name "*.json" | grep -i openapi`
2. If generated, document generation command in README
3. Consider using generated types in `lib/api.ts` for consistency
4. If unused (except by case.ts), evaluate if case.ts should be part of dashboard

**Risk Level:** MEDIUM (requires investigation, potential breaking changes)

---

### 1.3 Medium Priority Issues (Severity: LOW-MEDIUM)

#### Issue #6: Limited Error Handling Utilities
**Current State:**
- Only `AuthenticationError` custom error class
- API errors use generic `Error` or inline error handling
- No centralized error response type

**Problem:**
```typescript
// Repeated pattern across all API functions
if (!response.ok) {
  throw new Error('Failed to list documents');
}
```

No structured error information:
- HTTP status code
- Error code/type from backend
- User-friendly vs developer messages
- Retry-ability

**Recommendation:**
```typescript
// src/lib/api/errors.ts
export class APIError extends Error {
  constructor(
    message: string,
    public statusCode: number,
    public errorCode?: string,
    public details?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'APIError';
  }

  get isRetryable(): boolean {
    return this.statusCode >= 500 || this.statusCode === 429;
  }

  get isClientError(): boolean {
    return this.statusCode >= 400 && this.statusCode < 500;
  }
}

export class AuthenticationError extends APIError {
  constructor(message: string, statusCode = 401) {
    super(message, statusCode, 'AUTH_ERROR');
    this.name = 'AuthenticationError';
  }
}

export class NetworkError extends Error {
  constructor(message: string, public cause?: Error) {
    super(message);
    this.name = 'NetworkError';
  }
}

// Helper function
export async function handleAPIResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ detail: 'Unknown error' }));
    throw new APIError(
      errorData.detail || errorData.message || 'Request failed',
      response.status,
      errorData.code
    );
  }
  return await response.json();
}
```

**Risk Level:** LOW (additive change, improves error handling)

---

#### Issue #7: No Request Deduplication or Caching
**Current State:**
- Every API call is a fresh network request
- No in-memory caching
- No request deduplication (multiple components calling same endpoint)

**Problem:**
```typescript
// If 3 components mount simultaneously and call listDocuments()
// 3 separate network requests are made
const response1 = await listDocuments({ limit: 20, offset: 0 });
const response2 = await listDocuments({ limit: 20, offset: 0 });
const response3 = await listDocuments({ limit: 20, offset: 0 });
```

**Impact:**
- Unnecessary network requests
- Slower page loads
- Higher backend load
- Poor user experience

**Recommendation:**
```typescript
// src/lib/api/request-cache.ts
class RequestCache {
  private pending = new Map<string, Promise<unknown>>();
  private cache = new Map<string, { data: unknown; expires: number }>();

  async fetch<T>(
    key: string,
    fetcher: () => Promise<T>,
    ttl = 5000 // 5 second default
  ): Promise<T> {
    // Check cache
    const cached = this.cache.get(key);
    if (cached && Date.now() < cached.expires) {
      return cached.data as T;
    }

    // Check pending
    const pending = this.pending.get(key);
    if (pending) {
      return pending as Promise<T>;
    }

    // Execute
    const promise = fetcher();
    this.pending.set(key, promise);

    try {
      const data = await promise;
      this.cache.set(key, { data, expires: Date.now() + ttl });
      return data;
    } finally {
      this.pending.delete(key);
    }
  }

  invalidate(pattern: string | RegExp) {
    // Invalidate cache entries matching pattern
  }
}

export const requestCache = new RequestCache();
```

**Note:** Consider using a library like `react-query` or `swr` for more sophisticated caching

**Risk Level:** LOW (optional enhancement, doesn't change existing behavior)

---

#### Issue #8: Minimal Test Coverage
**Current State:**
- Only 1 test file: `src/test/App.test.tsx` (2 smoke tests)
- No component tests
- No integration tests for API client
- No hook tests

**Test Coverage Gaps:**
| Module | Current Coverage | Recommended Coverage |
|--------|------------------|---------------------|
| `lib/api.ts` | 0% | 80%+ (critical path) |
| `lib/auth/` | 0% | 90%+ (auth is critical) |
| `hooks/useKBList.ts` | 0% | 80%+ |
| `context/AuthContext.tsx` | 0% | 80%+ |
| `components/` | 0% | 60%+ (UI components) |
| `pages/` | ~5% | 40%+ (integration tests) |

**Recommendation:**
1. **Unit Tests** for:
   - `AuthManager` class (get, save, clear, token expiry)
   - API client functions (mock fetch responses)
   - `useKBList` hook (pagination, search, delete)
   - `debounce` utility

2. **Integration Tests** for:
   - `AuthContext` (login flow, token refresh, logout)
   - KB upload/list/delete workflows
   - Protected route navigation

3. **Component Tests** for:
   - `UploadModal` (form validation, file selection)
   - `DocumentList` (rendering, pagination)
   - `ConfirmDialog` (confirm/cancel actions)

**Testing Strategy:**
```typescript
// Example: src/lib/auth/__tests__/AuthManager.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AuthManager } from '../AuthManager';

describe('AuthManager', () => {
  let authManager: AuthManager;

  beforeEach(() => {
    authManager = new AuthManager();
    // Mock window.browser.storage
    vi.stubGlobal('browser', {
      storage: {
        local: {
          get: vi.fn(),
          set: vi.fn(),
          remove: vi.fn(),
        },
      },
    });
  });

  it('should save auth state to browser storage', async () => {
    const authState = {
      access_token: 'test-token',
      token_type: 'bearer',
      expires_at: Date.now() + 3600000,
      user: { /* ... */ },
    };

    await authManager.saveAuthState(authState);
    expect(browser.storage.local.set).toHaveBeenCalledWith({ authState });
  });

  it('should return null for expired tokens', async () => {
    const expiredState = {
      access_token: 'expired-token',
      expires_at: Date.now() - 1000, // Expired
      // ...
    };
    vi.mocked(browser.storage.local.get).mockResolvedValue({ authState: expiredState });

    const result = await authManager.getAuthState();
    expect(result).toBeNull();
  });
});
```

**Risk Level:** N/A (testing is always beneficial, no production risk)

---

#### Issue #9: Missing JSDoc Documentation
**Current State:**
- Minimal inline documentation
- Only 3 functions have JSDoc comments (upload functions)
- No parameter descriptions
- No usage examples

**Recommendation:**
```typescript
/**
 * Uploads a document to the user's personal knowledge base.
 *
 * @param params - Upload parameters
 * @param params.file - File to upload (max 10MB)
 * @param params.title - Document title (required)
 * @param params.document_type - Document type (e.g., 'guide', 'runbook', 'postmortem')
 * @param params.tags - Comma-separated tags (optional)
 * @param params.source_url - Original source URL (optional)
 * @param params.description - Document description (optional)
 *
 * @returns Promise resolving to the created document
 *
 * @throws {AuthenticationError} If user is not authenticated
 * @throws {APIError} If upload fails (network, validation, storage)
 *
 * @example
 * ```typescript
 * const file = new File(['content'], 'guide.txt', { type: 'text/plain' });
 * const document = await uploadDocument({
 *   file,
 *   title: 'Deployment Guide',
 *   document_type: 'guide',
 *   tags: 'deployment,kubernetes',
 * });
 * console.log('Uploaded:', document.document_id);
 * ```
 */
export async function uploadDocument(params: UploadDocumentParams): Promise<KBDocument> {
  // ...
}
```

**Priority Areas:**
1. Public API functions (all exports from `lib/api.ts`)
2. Custom hooks (`useKBList`, `useAuth`)
3. Context providers (`AuthProvider`)
4. Complex utility functions

**Risk Level:** N/A (documentation improvement)

---

### 1.4 Low Priority Issues (Severity: LOW)

#### Issue #10: Inconsistent Error Message Patterns
**Location:** Various API functions

**Problem:**
```typescript
// Pattern 1: Generic message
throw new Error('Failed to list documents');

// Pattern 2: Extract from response
const error = await response.json().catch(() => ({ detail: 'Upload failed' }));
throw new Error(error.detail || 'Upload failed');

// Pattern 3: Ternary with fallback
const message = error instanceof Error ? error.message : 'Upload failed';
```

**Recommendation:** Standardize using `handleAPIResponse()` helper (see Issue #6)

---

#### Issue #11: Trailing Empty Lines
**Observation:** Many files have 10+ trailing empty lines
- `src/context/AuthContext.tsx` - 10 empty lines
- `src/hooks/useKBList.ts` - 10 empty lines
- `src/utils/debounce.ts` - 10 empty lines

**Recommendation:** Configure ESLint/Prettier to enforce max 1-2 trailing newlines

**Risk Level:** N/A (formatting only)

---

## 2. Refactoring Plan

### Phase 1: Critical Fixes (Immediate, Low Risk)
**Timeline:** 1-2 hours
**Risk:** LOW

1. **Fix config.ts default port** (Issue #1)
   - Change line 43: `8090` → `8000`
   - Update comment line 31: "local API Gateway" → "local FaultMaven API"
   - Verify `.env.example` consistency
   - Test: Confirm default works without `.env` file

2. **Update outdated comments** (Issue #2)
   - Search for "API Gateway" references
   - Replace with "FaultMaven API" or "monolithic API"

3. **Verify .env.example consistency**
   - Ensure all VITE_* variables documented
   - Check comment accuracy

**Deliverable:** PR with config fixes, updated comments
**Testing:** Manual verification, existing tests should pass

---

### Phase 2: Type Consolidation (Short-term, Low Risk)
**Timeline:** 2-4 hours
**Risk:** LOW

1. **Consolidate duplicate types** (Issue #4)
   - Merge `KBDocument` and `AdminKBDocument`
   - Create type aliases for clarity
   - Update all imports

2. **Investigate api.generated.ts** (Issue #5)
   - Determine if actually generated
   - Document generation process if exists
   - Evaluate usage in `lib/api.ts`

**Deliverable:** PR with type consolidation
**Testing:** TypeScript compilation, existing tests pass

---

### Phase 3: API Client Modularization (Medium-term, Medium Risk)
**Timeline:** 1-2 days
**Risk:** MEDIUM

1. **Plan module structure** (Issue #3)
   ```
   src/lib/
   ├── api/
   │   ├── client.ts          # Shared fetch, errors
   │   ├── kb.ts              # KB endpoints
   │   └── index.ts           # Exports
   ├── auth/
   │   ├── AuthManager.ts     # Class
   │   ├── functions.ts       # devLogin, logout
   │   ├── types.ts           # Interfaces
   │   └── index.ts           # Exports
   └── types/
       └── browser.d.ts       # Global declarations
   ```

2. **Extract auth module**
   - Create `lib/auth/` directory
   - Move `AuthManager` to `AuthManager.ts`
   - Move auth functions to `functions.ts`
   - Move `AuthState` interface to `types.ts`
   - Update imports across codebase

3. **Extract KB API module**
   - Create `lib/api/kb.ts`
   - Move KB functions (user + admin)
   - Create shared `makeAuthenticatedRequest()` helper

4. **Create API client base**
   - Create `lib/api/client.ts`
   - Implement `handleAPIResponse()` helper
   - Implement error classes (Issue #6)

5. **Update all imports**
   - Update `AuthContext.tsx`
   - Update `hooks/useKBList.ts`
   - Update `pages/*.tsx`

**Deliverable:** PR with modular structure
**Testing:**
- All existing tests pass
- Add unit tests for new modules
- Manual testing of KB upload/list/delete

**Rollback Plan:** Revert PR, original `api.ts` still works

---

### Phase 4: Error Handling Enhancement (Medium-term, Low Risk)
**Timeline:** 4-6 hours
**Risk:** LOW (additive changes)

1. **Implement error classes** (Issue #6)
   - Create `lib/api/errors.ts`
   - Implement `APIError`, `NetworkError`, `AuthenticationError`
   - Implement `handleAPIResponse()` helper

2. **Update API client to use structured errors**
   - Replace generic `Error` with `APIError`
   - Add proper error context (status codes, error codes)

3. **Add error boundary improvements**
   - Update `ErrorBoundary` component to handle API errors
   - Display user-friendly messages

**Deliverable:** PR with enhanced error handling
**Testing:**
- Test error scenarios (401, 403, 404, 500)
- Verify error messages are user-friendly
- Check error boundaries catch errors

---

### Phase 5: Testing Infrastructure (Long-term, No Risk)
**Timeline:** 2-3 days
**Risk:** N/A (testing only)

1. **Add test utilities** (Issue #8)
   - Create `test/helpers.ts` with mock factories
   - Add `renderWithAuth()` helper for component tests
   - Add `mockAPI()` helper for API mocks

2. **Write unit tests**
   - `AuthManager` class (8-10 tests)
   - API functions (15-20 tests)
   - `useKBList` hook (8-10 tests)
   - `debounce` utility (4-5 tests)

3. **Write integration tests**
   - Auth flow (login → protected route → logout)
   - KB workflow (upload → list → delete)
   - Admin KB workflow

4. **Write component tests**
   - `UploadModal` (validation, submission)
   - `DocumentList` (rendering, interactions)
   - `ConfirmDialog` (confirm/cancel)

**Deliverable:** PR with comprehensive test suite
**Testing:** Aim for 70%+ coverage

---

### Phase 6: Documentation & Polish (Long-term, No Risk)
**Timeline:** 1-2 days
**Risk:** N/A (documentation only)

1. **Add JSDoc comments** (Issue #9)
   - Document all public API functions
   - Document hooks
   - Document context providers

2. **Update docs/ files**
   - Review `docs/KB_MANAGEMENT_UI_DESIGN.md` for accuracy
   - Update `docs/QUICK_REFERENCE.md`
   - Create `docs/API_CLIENT.md` usage guide

3. **Add module READMEs**
   - `src/lib/auth/README.md` - Auth module usage
   - `src/lib/api/README.md` - API client usage
   - `src/hooks/README.md` - Custom hooks guide

4. **Configure linting rules**
   - ESLint rule for trailing newlines
   - JSDoc coverage requirements

**Deliverable:** PR with documentation improvements

---

## 3. Implementation Details

### 3.1 Modular API Client Structure

#### Proposed File: `src/lib/api/client.ts`
```typescript
/**
 * Core API client with shared fetch logic and error handling
 */
import config from '../../config';
import { APIError, AuthenticationError, NetworkError } from './errors';
import { authManager } from '../auth';

export interface RequestOptions extends RequestInit {
  requireAuth?: boolean;
  includeUserId?: boolean;
  includeRoles?: boolean;
}

/**
 * Makes an authenticated API request with automatic token injection
 */
export async function makeAPIRequest<T>(
  endpoint: string,
  options: RequestOptions = {}
): Promise<T> {
  const {
    requireAuth = true,
    includeUserId = false,
    includeRoles = false,
    headers = {},
    ...fetchOptions
  } = options;

  // Build headers
  const requestHeaders: HeadersInit = { ...headers };

  if (requireAuth) {
    const token = await authManager.getAccessToken();
    if (!token) {
      throw new AuthenticationError('Not authenticated');
    }
    requestHeaders.Authorization = `Bearer ${token}`;

    if (includeUserId || includeRoles) {
      const authState = await authManager.getAuthState();
      if (!authState) {
        throw new AuthenticationError('Not authenticated');
      }

      if (includeUserId) {
        requestHeaders['X-User-ID'] = authState.user.user_id;
      }
      if (includeRoles) {
        requestHeaders['X-User-Roles'] = authState.user.roles?.join(',') || '';
      }
    }
  }

  // Make request
  try {
    const response = await fetch(`${config.apiUrl}${endpoint}`, {
      ...fetchOptions,
      headers: requestHeaders,
    });

    return await handleAPIResponse<T>(response);
  } catch (error) {
    if (error instanceof APIError || error instanceof AuthenticationError) {
      throw error;
    }
    // Network or other errors
    throw new NetworkError('Network request failed', error as Error);
  }
}

/**
 * Handles API response and extracts data or throws structured error
 */
export async function handleAPIResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({
      detail: `HTTP ${response.status}: ${response.statusText}`,
    }));

    if (response.status === 401) {
      throw new AuthenticationError(
        errorData.detail || 'Authentication required',
        response.status
      );
    }

    throw new APIError(
      errorData.detail || errorData.message || 'Request failed',
      response.status,
      errorData.code,
      errorData
    );
  }

  return await response.json();
}
```

---

#### Proposed File: `src/lib/api/errors.ts`
```typescript
/**
 * Structured API error classes
 */

export class APIError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
    public readonly errorCode?: string,
    public readonly details?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'APIError';
  }

  get isRetryable(): boolean {
    return this.statusCode >= 500 || this.statusCode === 429;
  }

  get isClientError(): boolean {
    return this.statusCode >= 400 && this.statusCode < 500;
  }

  toJSON() {
    return {
      name: this.name,
      message: this.message,
      statusCode: this.statusCode,
      errorCode: this.errorCode,
      details: this.details,
    };
  }
}

export class AuthenticationError extends APIError {
  constructor(message: string, statusCode = 401) {
    super(message, statusCode, 'AUTH_ERROR');
    this.name = 'AuthenticationError';
  }
}

export class NetworkError extends Error {
  constructor(message: string, public readonly cause?: Error) {
    super(message);
    this.name = 'NetworkError';
  }

  toJSON() {
    return {
      name: this.name,
      message: this.message,
      cause: this.cause?.message,
    };
  }
}
```

---

#### Proposed File: `src/lib/api/kb.ts`
```typescript
/**
 * Knowledge Base API client
 */
import { makeAPIRequest } from './client';

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

export interface DocumentListResponse {
  documents: KBDocument[];
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

/**
 * Upload a document to the personal knowledge base
 */
export async function uploadDocument(params: UploadDocumentParams): Promise<KBDocument> {
  const formData = new FormData();
  formData.append('file', params.file);
  formData.append('title', params.title);
  formData.append('document_type', params.document_type);

  if (params.tags) formData.append('tags', params.tags);
  if (params.source_url) formData.append('source_url', params.source_url);
  if (params.description) formData.append('description', params.description);

  return makeAPIRequest<KBDocument>('/api/v1/documents/upload', {
    method: 'POST',
    body: formData,
    requireAuth: true,
    includeUserId: true,
  });
}

/**
 * List documents from the personal knowledge base
 */
export async function listDocuments(params?: {
  limit?: number;
  offset?: number;
  document_type?: string;
}): Promise<DocumentListResponse> {
  const queryParams = new URLSearchParams();
  if (params?.limit) queryParams.set('limit', params.limit.toString());
  if (params?.offset) queryParams.set('offset', params.offset.toString());
  if (params?.document_type) queryParams.set('document_type', params.document_type);

  const endpoint = `/api/v1/documents?${queryParams.toString()}`;

  return makeAPIRequest<DocumentListResponse>(endpoint, {
    method: 'GET',
    requireAuth: true,
    includeUserId: true,
  });
}

/**
 * Delete a document from the personal knowledge base
 */
export async function deleteDocument(documentId: string): Promise<void> {
  await makeAPIRequest<void>(`/api/v1/documents/${documentId}`, {
    method: 'DELETE',
    requireAuth: true,
    includeUserId: true,
  });
}

// Admin KB functions (similar pattern)
export async function uploadAdminDocument(params: UploadDocumentParams): Promise<KBDocument> {
  const formData = new FormData();
  // ... build formData

  return makeAPIRequest<KBDocument>('/api/v1/admin/kb/documents', {
    method: 'POST',
    body: formData,
    requireAuth: true,
    includeUserId: true,
    includeRoles: true,
  });
}

export async function listAdminDocuments(params?: {
  limit?: number;
  offset?: number;
  document_type?: string;
}): Promise<DocumentListResponse> {
  const queryParams = new URLSearchParams();
  if (params?.limit) queryParams.set('limit', params.limit.toString());
  if (params?.offset) queryParams.set('offset', params.offset.toString());
  if (params?.document_type) queryParams.set('document_type', params.document_type);

  return makeAPIRequest<DocumentListResponse>(
    `/api/v1/admin/kb/documents?${queryParams.toString()}`,
    {
      method: 'GET',
      requireAuth: true,
      includeUserId: true,
      includeRoles: true,
    }
  );
}

export async function deleteAdminDocument(documentId: string): Promise<void> {
  await makeAPIRequest<void>(`/api/v1/admin/kb/documents/${documentId}`, {
    method: 'DELETE',
    requireAuth: true,
    includeUserId: true,
    includeRoles: true,
  });
}
```

---

#### Proposed File: `src/lib/auth/AuthManager.ts`
```typescript
/**
 * Authentication state manager
 */
import { AuthState } from './types';

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

export class AuthManager {
  /**
   * Save authentication state to browser storage
   */
  async saveAuthState(authState: AuthState): Promise<void> {
    if (browser?.storage) {
      await browser.storage.local.set({ authState });
    }
  }

  /**
   * Retrieve authentication state from browser storage
   * Returns null if not found or expired
   */
  async getAuthState(): Promise<AuthState | null> {
    try {
      if (browser?.storage) {
        const result = (await browser.storage.local.get(['authState'])) as {
          authState?: AuthState;
        };
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

  /**
   * Clear authentication state from browser storage
   */
  async clearAuthState(): Promise<void> {
    if (browser?.storage) {
      await browser.storage.local.remove(['authState']);
    }
  }

  /**
   * Get access token from auth state
   * Returns null if not authenticated or token expired
   */
  async getAccessToken(): Promise<string | null> {
    const authState = await this.getAuthState();
    return authState?.access_token || null;
  }
}

export const authManager = new AuthManager();
```

---

### 3.2 Type Consolidation

#### Proposed Changes to `src/lib/api/kb.ts`
```typescript
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
 * Type alias for user KB documents
 * Semantically identical to KBDocument, used for clarity in user-scoped contexts
 */
export type UserKBDocument = KBDocument;

/**
 * Type alias for admin KB documents
 * Semantically identical to KBDocument, used for clarity in admin-scoped contexts
 */
export type AdminKBDocument = KBDocument;

// If future differentiation is needed:
// export type KBDocumentScope = 'user' | 'admin';
// export interface KBDocument {
//   scope: KBDocumentScope;
//   document_id: string;
//   // ... rest
// }
```

---

### 3.3 Testing Strategy

#### Test Utilities: `src/test/helpers.ts`
```typescript
import { render, RenderOptions } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { AuthProvider } from '../context/AuthContext';
import { vi } from 'vitest';
import type { AuthState } from '../lib/api';

/**
 * Render component with AuthContext and Router
 */
export function renderWithAuth(
  ui: React.ReactElement,
  authState: AuthState | null = null,
  options?: Omit<RenderOptions, 'wrapper'>
) {
  // Mock authManager if authState provided
  if (authState) {
    vi.mock('../lib/api', () => ({
      authManager: {
        getAuthState: vi.fn().mockResolvedValue(authState),
        saveAuthState: vi.fn(),
        clearAuthState: vi.fn(),
        getAccessToken: vi.fn().mockResolvedValue(authState.access_token),
      },
    }));
  }

  return render(ui, {
    wrapper: ({ children }) => (
      <BrowserRouter>
        <AuthProvider>{children}</AuthProvider>
      </BrowserRouter>
    ),
    ...options,
  });
}

/**
 * Mock API responses
 */
export function mockAPISuccess<T>(data: T) {
  return Promise.resolve({
    ok: true,
    status: 200,
    json: async () => data,
  } as Response);
}

export function mockAPIError(status: number, message: string) {
  return Promise.resolve({
    ok: false,
    status,
    statusText: 'Error',
    json: async () => ({ detail: message }),
  } as Response);
}

/**
 * Factory for test auth state
 */
export function createMockAuthState(overrides?: Partial<AuthState>): AuthState {
  return {
    access_token: 'test-token',
    token_type: 'bearer',
    expires_at: Date.now() + 3600000,
    user: {
      user_id: 'test-user-id',
      username: 'testuser',
      email: 'test@example.com',
      display_name: 'Test User',
      is_dev_user: true,
      is_active: true,
      roles: [],
    },
    ...overrides,
  };
}

/**
 * Factory for test KB document
 */
export function createMockDocument(overrides?: Partial<KBDocument>): KBDocument {
  return {
    document_id: 'doc-123',
    user_id: 'user-123',
    title: 'Test Document',
    content: 'Test content',
    document_type: 'guide',
    tags: ['test'],
    metadata: {},
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  };
}
```

---

## 4. Files Modified Summary

### Phase 1: Critical Fixes
| File | Type | Lines Changed | Description |
|------|------|---------------|-------------|
| `src/config.ts` | Modified | 2 | Update default port 8090→8000, update comment |
| `.env.example` | Reviewed | 0 | Verified consistency (already correct) |

### Phase 2: Type Consolidation
| File | Type | Lines Changed | Description |
|------|------|---------------|-------------|
| `src/lib/api.ts` | Modified | -12 | Remove `AdminKBDocument` interface, add type alias |
| `src/hooks/useKBList.ts` | Modified | 1 | Update import statement |
| `src/pages/AdminKBPage.tsx` | Modified | 1 | Update import statement |

### Phase 3: Modularization
| File | Type | Lines Changed | Description |
|------|------|---------------|-------------|
| `src/lib/api.ts` | Deleted | -412 | Replaced with modular structure |
| `src/lib/api/client.ts` | Created | +80 | Core API client |
| `src/lib/api/errors.ts` | Created | +50 | Error classes |
| `src/lib/api/kb.ts` | Created | +150 | KB endpoints |
| `src/lib/api/index.ts` | Created | +20 | Public exports |
| `src/lib/auth/AuthManager.ts` | Created | +70 | Auth manager class |
| `src/lib/auth/functions.ts` | Created | +40 | Login/logout functions |
| `src/lib/auth/types.ts` | Created | +20 | Auth interfaces |
| `src/lib/auth/index.ts` | Created | +10 | Public exports |
| `src/lib/types/browser.d.ts` | Created | +15 | Global type declarations |
| `src/context/AuthContext.tsx` | Modified | 2 | Update imports |
| `src/hooks/useKBList.ts` | Modified | 2 | Update imports |
| `src/pages/*.tsx` | Modified | 6 | Update imports (3 files) |

### Phase 4: Error Handling
| File | Type | Lines Changed | Description |
|------|------|---------------|-------------|
| `src/lib/api/errors.ts` | Enhanced | +30 | Add APIError, NetworkError |
| `src/lib/api/client.ts` | Modified | +20 | Use structured errors |
| `src/lib/api/kb.ts` | Modified | +10 | Error handling |
| `src/components/ErrorBoundary.tsx` | Modified | +20 | Handle API errors |

### Phase 5: Testing
| File | Type | Lines Changed | Description |
|------|------|---------------|-------------|
| `src/test/helpers.ts` | Created | +100 | Test utilities |
| `src/lib/auth/__tests__/AuthManager.test.ts` | Created | +150 | Auth tests |
| `src/lib/api/__tests__/kb.test.ts` | Created | +200 | KB API tests |
| `src/hooks/__tests__/useKBList.test.ts` | Created | +150 | Hook tests |
| `src/components/__tests__/*.test.tsx` | Created | +400 | Component tests |

### Phase 6: Documentation
| File | Type | Lines Changed | Description |
|------|------|---------------|-------------|
| `src/lib/api/kb.ts` | Modified | +100 | JSDoc comments |
| `src/lib/auth/AuthManager.ts` | Modified | +50 | JSDoc comments |
| `docs/API_CLIENT.md` | Created | +200 | API client guide |
| `src/lib/auth/README.md` | Created | +100 | Auth module docs |
| `src/lib/api/README.md` | Created | +150 | API module docs |

---

## 5. Breaking Changes

### No Breaking Changes in Phase 1-2
Phase 1 (config fixes) and Phase 2 (type consolidation) have **zero breaking changes**:
- Config change only affects default fallback (not existing configs)
- Type consolidation uses type aliases (no runtime changes)

### Potential Breaking Changes in Phase 3
Phase 3 (modularization) changes import paths:

**Before:**
```typescript
import { devLogin, logoutAuth, uploadDocument, authManager } from '../lib/api';
```

**After:**
```typescript
import { devLogin, logoutAuth } from '../lib/auth';
import { uploadDocument } from '../lib/api';
import { authManager } from '../lib/auth';
```

**Mitigation:**
- All imports are internal (no external API consumers)
- Can provide backward-compatible re-exports in `lib/api.ts`:
  ```typescript
  // src/lib/api.ts (deprecated, for backward compatibility)
  export * from './api';
  export * from './auth';
  ```

---

## 6. Testing Recommendations

### Manual Testing Checklist

After each phase, perform the following manual tests:

#### Auth Flow
- [ ] Login with dev account
- [ ] Navigate to protected route (KB page)
- [ ] Token expiry handling (set expires_at to past)
- [ ] Logout
- [ ] Redirect to login after logout

#### KB Management (User Scope)
- [ ] Upload document (all file types: .txt, .log, .json, .csv, .md)
- [ ] List documents (pagination)
- [ ] Search documents (by title, tags)
- [ ] Delete document
- [ ] Error handling (upload oversized file)

#### KB Management (Admin Scope)
- [ ] Login as admin user
- [ ] Access admin KB page
- [ ] Upload admin document
- [ ] List admin documents
- [ ] Delete admin document

#### Error Scenarios
- [ ] Network error (disconnect network during upload)
- [ ] 401 Unauthorized (clear auth token manually)
- [ ] 403 Forbidden (non-admin access admin endpoint)
- [ ] 500 Server Error (backend error)

### Automated Testing

Run tests after each phase:
```bash
# Unit tests
pnpm test

# With coverage
pnpm test:coverage

# UI mode for debugging
pnpm test:ui
```

**Coverage Goals:**
- Phase 3: 60%+ overall coverage
- Phase 5: 70%+ overall coverage
- Critical paths (auth, API client): 80%+

---

## 7. Risk Assessment

| Phase | Risk Level | Impact | Mitigation |
|-------|-----------|--------|------------|
| Phase 1: Config Fixes | LOW | Minimal (default fallback only) | Test without .env file |
| Phase 2: Type Consolidation | LOW | Zero runtime impact | TypeScript compilation |
| Phase 3: Modularization | MEDIUM | Import path changes | Comprehensive testing, backward-compat exports |
| Phase 4: Error Handling | LOW | Additive changes only | Test error scenarios |
| Phase 5: Testing | NONE | Testing only | N/A |
| Phase 6: Documentation | NONE | Documentation only | N/A |

### Rollback Strategy

For each phase:
1. **Git Branch:** Create feature branch for each phase
2. **PR Review:** Require approval before merge
3. **Revert Plan:** If issues arise, revert PR immediately
4. **Backup:** Original `api.ts` preserved in git history

**Critical Rollback Triggers:**
- Tests fail in CI/CD
- Manual testing reveals bugs
- Performance regression
- TypeScript compilation errors

---

## 8. Performance Considerations

### Current Performance
- No caching (every request is fresh)
- No request deduplication
- No pagination optimization

### Future Enhancements (Post-Refactoring)
1. **React Query or SWR** - Advanced caching, background refetch
2. **Request Deduplication** - Prevent duplicate simultaneous requests
3. **Optimistic Updates** - Update UI before API response
4. **Virtual Scrolling** - For large document lists
5. **Service Worker Caching** - Offline support

**Note:** These are **optional enhancements**, not required for refactoring

---

## 9. Security Considerations

### Current Security Posture
- ✅ Proper JWT token handling
- ✅ Token expiry checking
- ✅ HTTPS enforcement (in production via Nginx)
- ✅ No hardcoded secrets
- ⚠️ No CSRF protection (not needed for JWT)
- ⚠️ No rate limiting (backend responsibility)

### Recommendations
1. **Content Security Policy (CSP)** - Add CSP headers in Nginx
2. **Input Sanitization** - Already using DOMPurify for markdown rendering
3. **File Upload Validation** - Already enforcing file size/type limits
4. **HTTPS Only** - Already enforced in production

**No security vulnerabilities identified**

---

## 10. Next Steps & Prioritization

### Immediate Actions (This Week)
1. **Execute Phase 1** (Critical Fixes) - 1-2 hours
   - Fix config.ts default port
   - Update comments
   - Create PR and merge

2. **Execute Phase 2** (Type Consolidation) - 2-4 hours
   - Consolidate duplicate types
   - Investigate api.generated.ts
   - Create PR and merge

### Short-term (Next 2 Weeks)
3. **Execute Phase 3** (Modularization) - 1-2 days
   - Refactor lib/api.ts into modules
   - Update all imports
   - Comprehensive testing
   - Create PR and merge

4. **Execute Phase 4** (Error Handling) - 4-6 hours
   - Implement error classes
   - Update API client
   - Create PR and merge

### Medium-term (Next Month)
5. **Execute Phase 5** (Testing) - 2-3 days
   - Add test utilities
   - Write unit tests
   - Write integration tests
   - Aim for 70%+ coverage

6. **Execute Phase 6** (Documentation) - 1-2 days
   - JSDoc comments
   - Update docs/ files
   - Module READMEs

### Long-term (Future Considerations)
- Evaluate React Query or SWR for caching
- Implement request deduplication
- Add performance monitoring
- Consider micro-frontend architecture (if needed)

---

## 11. Conclusion

The faultmaven-dashboard codebase is **functional and well-structured** but has several opportunities for improvement in **maintainability, type safety, and developer experience**.

**Key Strengths:**
- Clean component architecture
- Good use of React hooks
- Type safety with TypeScript
- Proper authentication flow
- Responsive UI with Tailwind CSS

**Key Weaknesses:**
- Outdated default configuration
- Monolithic API client (412 lines)
- Duplicate type definitions
- Limited test coverage
- Missing error handling utilities

**Recommended Approach:**
1. Start with **low-risk, high-impact** fixes (Phase 1-2)
2. Gradually refactor **high-risk areas** with comprehensive testing (Phase 3)
3. Add **defensive layers** (error handling, testing)
4. Polish with **documentation and best practices**

**Timeline:**
- **Week 1:** Phases 1-2 (config + types)
- **Week 2-3:** Phases 3-4 (modularization + errors)
- **Week 4-5:** Phases 5-6 (testing + docs)

**Success Criteria:**
- ✅ All existing functionality preserved
- ✅ Improved code organization (< 200 lines per file)
- ✅ Better type safety (no duplicate types)
- ✅ Enhanced error handling (structured errors)
- ✅ Increased test coverage (70%+)
- ✅ Clear documentation (JSDoc + guides)

---

## Appendix A: File Structure Comparison

### Current Structure
```
src/
├── components/          # 8 files, ~500 lines
├── context/             # 1 file, AuthContext.tsx
├── hooks/               # 1 file, useKBList.ts
├── lib/
│   ├── api.ts           # 412 lines (monolithic)
│   └── storage.ts       # 48 lines
├── pages/               # 3 files, ~671 lines
├── test/                # 2 files
├── types/
│   ├── api.generated.ts # 50,641 tokens (massive)
│   └── case.ts          # 65 lines
├── utils/
│   └── debounce.ts      # 8 lines
├── App.tsx
├── config.ts
└── main.tsx
```

### Proposed Structure
```
src/
├── components/          # 8 files, ~500 lines (unchanged)
├── context/             # 1 file, AuthContext.tsx (minimal import changes)
├── hooks/               # 1 file, useKBList.ts (minimal import changes)
│   └── __tests__/       # New: hook tests
├── lib/
│   ├── api/
│   │   ├── client.ts    # 80 lines - Core API client
│   │   ├── errors.ts    # 50 lines - Error classes
│   │   ├── kb.ts        # 150 lines - KB endpoints
│   │   ├── index.ts     # 20 lines - Public exports
│   │   ├── README.md    # New: API client guide
│   │   └── __tests__/   # New: API tests
│   ├── auth/
│   │   ├── AuthManager.ts    # 70 lines - Auth manager
│   │   ├── functions.ts      # 40 lines - Login/logout
│   │   ├── types.ts          # 20 lines - Auth interfaces
│   │   ├── index.ts          # 10 lines - Public exports
│   │   ├── README.md         # New: Auth module guide
│   │   └── __tests__/        # New: Auth tests
│   ├── types/
│   │   └── browser.d.ts      # 15 lines - Global declarations
│   └── storage.ts            # 48 lines (unchanged)
├── pages/               # 3 files, ~671 lines (minimal import changes)
├── test/
│   ├── helpers.ts       # New: Test utilities
│   ├── setup.ts         # Existing
│   └── App.test.tsx     # Existing
├── types/
│   ├── api.generated.ts # Review/document generation process
│   └── case.ts          # 65 lines (unchanged)
├── utils/
│   ├── debounce.ts      # 8 lines (unchanged)
│   └── __tests__/       # New: utility tests
├── App.tsx              # Minimal import changes
├── config.ts            # Fix default port
└── main.tsx             # Unchanged
```

**Benefits:**
- Clear module boundaries
- Smaller, focused files (< 200 lines each)
- Better testability (isolated modules)
- Easier navigation
- Scalable structure

---

## Appendix B: Import Path Changes

### Before (Current)
```typescript
// In components/pages
import { devLogin, logoutAuth, uploadDocument, listDocuments, authManager } from '../lib/api';
import type { AuthState, KBDocument } from '../lib/api';
```

### After (Phase 3)
```typescript
// In components/pages
import { devLogin, logoutAuth, authManager } from '../lib/auth';
import { uploadDocument, listDocuments } from '../lib/api';
import type { AuthState } from '../lib/auth';
import type { KBDocument } from '../lib/api';
```

### Backward Compatibility (Optional)
```typescript
// src/lib/api.ts (deprecated, for backward compatibility)
export * from './api';
export * from './auth';

// Allows existing code to continue using:
// import { devLogin, uploadDocument } from '../lib/api';
```

---

## Appendix C: Testing Examples

### Unit Test: AuthManager
```typescript
// src/lib/auth/__tests__/AuthManager.test.ts
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { AuthManager } from '../AuthManager';
import { createMockAuthState } from '../../../test/helpers';

describe('AuthManager', () => {
  let authManager: AuthManager;
  let mockStorage: any;

  beforeEach(() => {
    // Setup mock browser.storage
    mockStorage = {
      get: vi.fn().mockResolvedValue({}),
      set: vi.fn().mockResolvedValue(undefined),
      remove: vi.fn().mockResolvedValue(undefined),
    };

    vi.stubGlobal('browser', {
      storage: { local: mockStorage },
    });

    authManager = new AuthManager();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe('saveAuthState', () => {
    it('should save auth state to browser storage', async () => {
      const authState = createMockAuthState();

      await authManager.saveAuthState(authState);

      expect(mockStorage.set).toHaveBeenCalledWith({ authState });
    });
  });

  describe('getAuthState', () => {
    it('should return auth state if valid', async () => {
      const authState = createMockAuthState();
      mockStorage.get.mockResolvedValue({ authState });

      const result = await authManager.getAuthState();

      expect(result).toEqual(authState);
    });

    it('should return null for expired tokens', async () => {
      const expiredState = createMockAuthState({
        expires_at: Date.now() - 1000, // Expired 1 second ago
      });
      mockStorage.get.mockResolvedValue({ authState: expiredState });

      const result = await authManager.getAuthState();

      expect(result).toBeNull();
      expect(mockStorage.remove).toHaveBeenCalledWith(['authState']);
    });

    it('should return null if no auth state found', async () => {
      mockStorage.get.mockResolvedValue({});

      const result = await authManager.getAuthState();

      expect(result).toBeNull();
    });
  });

  describe('clearAuthState', () => {
    it('should remove auth state from storage', async () => {
      await authManager.clearAuthState();

      expect(mockStorage.remove).toHaveBeenCalledWith(['authState']);
    });
  });

  describe('getAccessToken', () => {
    it('should return access token from valid auth state', async () => {
      const authState = createMockAuthState({ access_token: 'test-token-123' });
      mockStorage.get.mockResolvedValue({ authState });

      const token = await authManager.getAccessToken();

      expect(token).toBe('test-token-123');
    });

    it('should return null if no auth state', async () => {
      mockStorage.get.mockResolvedValue({});

      const token = await authManager.getAccessToken();

      expect(token).toBeNull();
    });
  });
});
```

### Integration Test: KB Upload Flow
```typescript
// src/lib/api/__tests__/kb.integration.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { uploadDocument, listDocuments } from '../kb';
import { authManager } from '../../auth';
import { createMockAuthState, createMockDocument } from '../../../test/helpers';

describe('KB API Integration', () => {
  beforeEach(() => {
    // Mock fetch
    global.fetch = vi.fn();

    // Mock authManager
    vi.spyOn(authManager, 'getAccessToken').mockResolvedValue('test-token');
    vi.spyOn(authManager, 'getAuthState').mockResolvedValue(createMockAuthState());
  });

  describe('uploadDocument', () => {
    it('should upload document and return created document', async () => {
      const file = new File(['content'], 'test.txt', { type: 'text/plain' });
      const mockResponse = createMockDocument({ title: 'test.txt' });

      (global.fetch as any).mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => mockResponse,
      });

      const result = await uploadDocument({
        file,
        title: 'Test Document',
        document_type: 'guide',
      });

      expect(result).toEqual(mockResponse);
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/v1/documents/upload'),
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            Authorization: 'Bearer test-token',
          }),
        })
      );
    });

    it('should throw AuthenticationError if not authenticated', async () => {
      vi.spyOn(authManager, 'getAccessToken').mockResolvedValue(null);

      const file = new File(['content'], 'test.txt', { type: 'text/plain' });

      await expect(
        uploadDocument({
          file,
          title: 'Test Document',
          document_type: 'guide',
        })
      ).rejects.toThrow('Not authenticated');
    });
  });

  describe('listDocuments', () => {
    it('should list documents with pagination', async () => {
      const mockResponse = {
        documents: [createMockDocument()],
        total_count: 1,
        limit: 20,
        offset: 0,
      };

      (global.fetch as any).mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => mockResponse,
      });

      const result = await listDocuments({ limit: 20, offset: 0 });

      expect(result).toEqual(mockResponse);
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/v1/documents?limit=20&offset=0'),
        expect.any(Object)
      );
    });
  });
});
```

---

**End of Report**

Generated by: Solutions Architect Agent
Date: 2026-01-13
Version: 1.0
