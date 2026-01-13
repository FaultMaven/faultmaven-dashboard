# faultmaven-dashboard - Refactoring Plan (Post Phase 1-2)
**Date:** 2026-01-13 (Revised)
**Status:** Phase 1-2 Complete, Phases 3-6 Optional
**Repository:** `/home/swhouse/product/faultmaven-dashboard`
**Commits:** 83d406d, c87ab22, e8784fc

---

## Executive Summary

This plan outlines **optional** improvements for the faultmaven-dashboard codebase. Phase 1-2 critical fixes have been completed. The remaining phases are quality-of-life enhancements that can be prioritized based on team needs.

**✅ Phase 1-2 Completed:**
- Fixed default API port (8090 → 8000)
- Updated documentation to remove "API Gateway" references
- Consolidated duplicate type definitions
- Applied consistent code formatting

**Current Health:** 7.5/10 - Functional and well-organized
**Target Health (if all phases completed):** 9/10

**Recommendation:** Review optional improvements and prioritize based on development velocity and team capacity.

---

## Completed Work (Phase 1-2)

### Configuration Fixes (✅ Complete)
**Commits:** 83d406d, c87ab22

1. **Updated `src/config.ts`:**
   - Changed default port from `8090` to `8000`
   - Updated comment: "local API Gateway" → "local FaultMaven API (monolithic backend)"

2. **Updated `.env.example`:**
   - Clarified port guide: 8000 (current), 8090 (deprecated)
   - Removed microservices terminology

3. **Updated `README.md` and `CLAUDE.md`:**
   - Fixed all port references (8090 → 8000)
   - Removed references to deprecated faultmaven-deploy repository
   - Added cross-references to backend documentation

4. **Consolidated Types in `src/lib/api.ts`:**
   - Eliminated duplicate `AdminKBDocument` interface
   - Replaced with type alias: `export type AdminKBDocument = KBDocument;`
   - Added JSDoc comments for clarity

5. **Applied Code Formatting:**
   - Consistent formatting across all source files
   - Fixed linter warnings
   - Updated ESLint configuration

**Result:** All critical configuration issues resolved, documentation synchronized.

---

## Optional Improvements (Phases 3-6)

### Phase 3: API Client Modularization (Optional)

**Priority:** MEDIUM
**Effort:** 1-2 days
**Risk:** MEDIUM (requires import path changes)

#### Current State
- `src/lib/api.ts` is 410 lines
- Mixes authentication, KB API, and browser declarations
- Single monolithic file

#### Proposed Structure
```
src/lib/
├── api/
│   ├── client.ts       # Shared fetch wrapper (~80 lines)
│   ├── kb.ts           # KB endpoints (~150 lines)
│   └── index.ts        # Public exports
├── auth/
│   ├── AuthManager.ts  # AuthManager class (~70 lines)
│   ├── functions.ts    # devLogin, logoutAuth (~40 lines)
│   ├── types.ts        # AuthState, interfaces (~20 lines)
│   └── index.ts        # Public exports
└── types/
    └── browser.d.ts    # Global browser declarations
```

#### Benefits
- Clearer module boundaries
- Easier to locate specific functionality
- Better testability (mock individual modules)
- Reduced file size (< 200 lines per file)

#### Breaking Changes
- Import paths change (internal only, no external API changes)
- Requires comprehensive testing

#### Recommendation
**Defer unless:** Team is actively adding new API endpoints or experiencing navigation difficulty in current api.ts file.

---

### Phase 4: Type System Investigation (Optional)

**Priority:** LOW
**Effort:** 4-6 hours
**Risk:** LOW (investigation only)

#### Issue: Unclear api.generated.ts Usage
**Location:** `src/types/api.generated.ts` (50,641 tokens)

#### Questions to Answer
1. Is this file actually auto-generated? From what source?
2. Why does `case.ts` import from it but `api.ts` doesn't?
3. Should we use generated types in `api.ts` for consistency?
4. If unused, can it be removed to reduce bundle size?

#### Investigation Steps
1. Search for OpenAPI spec files in repository
2. Check `package.json` for generation scripts
3. Review `src/types/case.ts` usage
4. Determine if manual `api.ts` types should be replaced with generated types

#### Recommendation
**Defer unless:** Team is experiencing type drift issues or planning OpenAPI spec integration.

---

### Phase 5: Error Handling Enhancement (Optional)

**Priority:** LOW
**Effort:** 4-6 hours
**Risk:** LOW (additive changes)

#### Current State
- Only `AuthenticationError` custom error class
- Generic `Error` used throughout API functions
- No structured error response handling

#### Proposed Enhancement
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
}

export class AuthenticationError extends APIError {
  constructor(message: string) {
    super(message, 401, 'AUTH_ERROR');
    this.name = 'AuthenticationError';
  }
}

export class NetworkError extends Error {
  constructor(message: string, public cause?: Error) {
    super(message);
    this.name = 'NetworkError';
  }
}
```

#### Benefits
- Better error diagnostics
- Retry logic can use `isRetryable` property
- User-friendly error messages separate from technical details

#### Recommendation
**Defer unless:** Team needs better error diagnostics for production troubleshooting.

---

### Phase 6: Testing & Documentation (Optional)

**Priority:** MEDIUM
**Effort:** 2-3 days
**Risk:** NONE (tests don't affect runtime)

#### Current State
- Only 2 tests (`src/test/App.test.tsx`)
- Coverage: ~10%
- Minimal JSDoc comments

#### Proposed Improvements

**Testing:**
- Unit tests for `AuthManager`
- Unit tests for API functions
- Unit tests for hooks (`useKBList`)
- Component tests for major components
- Integration tests for auth flow
- **Target:** 70%+ coverage

**Documentation:**
- JSDoc comments for all public APIs
- Usage examples in README
- Module-level README files
- API client usage guide

#### Recommendation
**Consider if:** Team wants to improve developer onboarding or reduce regression risk.

---

## Implementation Priority Matrix

| Phase | Priority | Effort | Risk | Impact | Recommend When |
|-------|----------|--------|------|--------|----------------|
| **3** | Medium | 1-2 days | Medium | Medium | Actively adding many new endpoints |
| **4** | Low | 4-6 hrs | Low | Low | Planning OpenAPI integration |
| **5** | Low | 4-6 hrs | Low | Low | Need better error diagnostics |
| **6** | Medium | 2-3 days | None | High | Onboarding new developers |

---

## Recommendation

### Immediate Action (This Sprint)
✅ **None required** - Phase 1-2 is complete, codebase is functional and well-organized.

### Consider For Future Sprints

1. **If adding many new features:** Phase 3 (API modularization)
2. **If onboarding new developers:** Phase 6 (testing & docs)
3. **If planning OpenAPI integration:** Phase 4 (type system investigation)
4. **If production errors are hard to debug:** Phase 5 (error handling)

### Do Not Proceed If
- Team bandwidth is limited
- Current codebase is working well
- No immediate pain points

---

## Questions for Team

Before proceeding with any optional phase:

1. **Pain Points:** What specific problems are developers encountering?
2. **Development Velocity:** Is the current structure slowing down feature development?
3. **Error Diagnostics:** Are production errors hard to debug with current error handling?
4. **Onboarding:** Are new developers struggling to understand the codebase?
5. **Testing:** Is lack of tests causing regressions?

**Only proceed with phases that address actual pain points.**

---

## Summary

**Status:** ✅ Phase 1-2 complete, codebase healthy
**Next Steps:** Review optional phases, prioritize based on team needs
**Timeline:** Defer until specific pain points emerge
**Risk:** LOW - all remaining work is optional enhancement
