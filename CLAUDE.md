# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository Overview

This is the **FaultMaven Dashboard** - a web application for managing Knowledge Base content. It provides a clean interface for uploading, organizing, and searching runbooks, post-mortems, and documentation that powers the FaultMaven AI assistant.

**Key Technologies**: Vite 6.0+, React 19+, React Router 7+, TypeScript, Tailwind CSS, Vitest

## Common Commands

### Development
```bash
pnpm install               # Install dependencies
pnpm dev                   # Start development server (localhost:5173)
pnpm lint                  # ESLint (flat config)
pnpm test                  # Vitest + RTL
pnpm build                 # TypeScript + Vite build
```

## Configuration

### Environment Variables
All configuration is done via environment variables (set before build):

```bash
cp .env.example .env.local
# Edit .env.local
```

**Available Variables (common):**
- `VITE_API_URL` - Backend API endpoint (default: `http://127.0.0.1:8090`)
- `VITE_MAX_FILE_SIZE_MB` - Max file upload size in MB (default: `10`)

**Port Reference:**
- `8090` - FaultMaven API (monolithic backend)
- `3333` - Dashboard (Docker/production)
- `5173` - Dashboard (Vite development server)

**Notes**
- Config is parsed in `src/config.ts`.
- VITE_* are build-time; restart dev server or rebuild after changes.

## High-Level Architecture

### Web Application Architecture
The dashboard is a standard React single-page application:

```
src/
├── main.tsx                  # Application entry point
├── App.tsx                   # Root component with routing
├── index.css                 # Global styles
├── pages/                    # Page components
│   ├── LoginPage.tsx         # Authentication page
│   ├── KBPage.tsx            # Personal KB management
│   ├── AdminKBPage.tsx       # Global KB management (system-wide)
│   ├── CaseListPage.tsx      # Paginated case list with filters
│   ├── CaseDetailPage.tsx    # Case detail with tabs + annotation
│   ├── AdminCaseListPage.tsx # Cross-tenant "All Cases" list (platform_admin; metadata-only in cloud)
│   ├── UserManagementPage.tsx # Platform admin user management
│   ├── LLMConfigPage.tsx     # LLM provider configuration
│   ├── OAuthAuthorizePage.tsx # OAuth flow for copilot extension
│   └── SSOCallbackPage.tsx   # Cloud SSO callback (completion-code exchange)
├── components/               # Reusable UI components
│   ├── PageHeader.tsx        # Top navigation bar
│   ├── CaseTabs.tsx          # Tab container (Transcript, Issue, Report, Hypotheses, Evidence) — all tabs shown for every case
│   ├── ReportTab.tsx         # View-only display of auto-generated terminal summaries
│   ├── IssueTab.tsx          # Structured investigation outcome with case metadata
│   ├── DocumentCard.tsx      # Expandable document card with content preview
│   ├── DraftEditor.tsx       # Runbook draft editor with validation/quality display
│   ├── CaseStatusBadge.tsx   # Status badge with phase colors
│   ├── CaseTable.tsx         # Shared case list table (Title/[Owner]/Status/Progress/Last Activity/[actions]) — used by CaseListPage + AdminCaseListPage (view=full)
│   ├── AdminCaseMetadataTable.tsx # Cloud operator table (Case ID/Owner/Status/Progress/Last Activity) — no title column, no content link (ADR-012 D9)
│   ├── MilestoneProgress.tsx # Milestone progress indicator
│   ├── ConfirmDialog.tsx     # Reusable confirmation modal
│   ├── UploadModal.tsx       # File upload modal for KB
├── context/                  # AuthContext (global auth state)
├── hooks/                    # Custom hooks (useKBList for KB paging/search/delete)
└── lib/                      # Core logic
    ├── api.ts                # Barrel re-exports from modular API clients
    ├── auth/                 # Auth (AuthManager, login/logout, token storage)
    ├── cases/                # Cases API (CRUD, reports, knowledge suggestions)
    ├── knowledge/            # KB API (upload, list, delete, client utilities)
    ├── llm/                  # LLM config API
    ├── users/                # User management API
    ├── storage.ts            # LocalStorage adapter
    ├── config.ts             # Configuration
    └── utils/                # Helper utilities
```

### Key Patterns

1. **Vite**: Fast build tool with HMR for development
2. **React Router**: Client-side routing for SPA
3. **AuthContext**: Global auth state for protected routes
4. **Custom Hooks**: `useKBList` for KB pagination/search/delete
5. **API Integration**: RESTful communication with FaultMaven backend
6. **Tailwind CSS**: Utility-first CSS framework
7. **TypeScript Strict**: Type safety throughout

### API Integration

The dashboard communicates with the FaultMaven backend through modular API clients (`lib/cases/`, `lib/knowledge/`, etc.), barrel-exported via `lib/api.ts`:

- **Authentication**: `devLogin()`, `ssoExchange()`, `logoutAuth()`, AuthContext powered
- **Knowledge Base**: Upload, list (paginated), delete documents (user + admin scopes)
- **Cases**: List, detail, search (title + case ID), annotate, archive, messages, evidence list/detail (`GET /cases/{id}/evidence`, `GET /cases/{id}/evidence/{evidence_id}`), uploaded files list/detail, phase-adaptive UI snapshot (`GET /cases/{id}/ui`), reports
- **Reports**: `generateCaseReport()`, `getReportRecommendations()`, `getCaseReports()`

**API Endpoint Configuration:**

- Self-hosted: `http://localhost:8090`
- Enterprise: `https://api.faultmaven.ai`

### Application Flow

1. **Login**: User signs in; AuthContext stores token/state via storage adapter
2. **Routing**: React Router manages navigation between pages
3. **KB Management**: Upload, paginate, client-side search, delete documents
4. **Case Management**: Browse/search cases (by title or ID), view detail with tabbed content, generate reports
5. **Protected Routes**: Admin routes require admin privileges

### Component Architecture

- **LoginPage**: Authentication interface with FaultMaven branding. Standalone: passwordless username form. Cloud: single Sign In button that hands off to the backend-advertised hosted-login URL (`oauth.hosted_login_url` from `/auth/config`), forwarding the ProtectedRoute-saved destination as `return_to`.
- **SSOCallbackPage**: Cloud hosted-login return leg (route `/auth/sso/callback`, public — it IS the login). The backend redirects here with a single-use completion `code` (+ optional same-origin `return_to`) or a sanitized `error` slug; the page POSTs `{code}` to `/api/v1/auth/sso/exchange`, stores the standard token response exactly like a LoginPage sign-in, and forwards to `return_to` → saved destination → `/kb`. Error slugs map to friendly messages with a "Back to sign in" link; raw query content is never echoed.
- **KBPage**: User knowledge base management (3-tier tabs: personal/team/global)
- **AdminKBPage**: Organization KB management (admin only)
- **CaseListPage**: Paginated case table with status/date/search filters. Search matches title and case ID via `POST /cases/search`. Renders rows via the shared `CaseTable` component.
- **AdminCaseListPage**: Cross-tenant "All Cases" list (ADR-012 D9) — every user's cases on the server (Copilot- and Slack-agent-originated). Backed by `GET /api/v1/admin/cases`; state/source filters only. Gated by `canViewAllCases(isAdmin)` → **`platform_admin` in both deployments** (route `/admin/cases` + nav item). The response is a union **discriminated on `view`**, and the page narrows on it rather than on the deployment mode, so rendered columns cannot drift from served policy: `view: "full"` (standalone) renders `CaseTable` with titles; `view: "metadata"` (cloud) renders `AdminCaseMetadataTable` — ids/org/state/timestamps/counts, **no title or description** (user free text is content and needs the audited break-glass path, faultmaven#815). The endpoint still 403s under `TENANT_PROVIDER=multi` (RLS would make the list silently partial); the page shows that refusal *instead of* a table.
- **CaseDetailPage**: Case header (title, description, status badge, milestone progress, case ID, created date) + tabbed content + resolution notes (terminal cases only). Archive button shown for terminal cases (subtle styling).
- **ReportTab**: View-only display of auto-generated terminal summaries (resolution or closure). Formatted markdown rendering with download. No manual generate button.
- **IssueTab**: Structured view of investigation outcome (problem, milestones, root cause, solutions, resolution notes). Shown for all cases.
- **TranscriptTab**: Single-column conversation view (no chat-style left/right bubbles). Each message has a role-coloured left-border accent (`fm-accent` for FaultMaven, `fm-border` for You) and an inline `You · Turn N` / `FaultMaven · Turn N` header. Turns are separated by a horizontal rule for scanability.
- **HypothesesTab**: Renders `active_hypotheses` from `GET /cases/{id}/ui` for INVESTIGATING cases — status symbol (✓ validated / ✗ refuted / ● active / ◌ inconclusive / ○ captured-or-retired), likelihood %, evidence count, and statement. For terminal cases the `/ui` endpoint does not surface hypothesis details; falls back to a count-only note.
- **EvidenceTab**: Evidence-first list backed by `GET /cases/{id}/evidence` (returns full `EvidenceDetails[]` in one round-trip). Each row shows category badge · summary · source filename · turn · linked-hypothesis count. Click to expand: verbatim `extract` (monospace), optional analysis, related hypotheses with stance badges (SUPPORTS / REFUTES / NEUTRAL). Footer toggle switches to a secondary file-view (uses `GET /cases/{id}/uploaded-files` + per-file detail) for the "did my upload get processed?" use case.
- **CaseTabs**: 5 tabs shown for all cases: Transcript, Issue, Report, Hypotheses, Evidence. URL query param support (`?tab=report`, `?tab=issue`) for cross-frontend linking from copilot. All markdown content rendered via react-markdown with external links opening in new tabs.
- **DocumentCard**: Expandable card — click to load and display full document content from ChromaDB
- **Storage Adapter**: Browser extension API compatibility layer for web
- **Error Handling**: Graceful error display and recovery

## Development Guidelines

### Environment Setup

1. **Backend Dependency**: Dashboard requires FaultMaven backend running
2. **Environment Configuration**: Use `.env.local` for API endpoint:
   ```bash
   VITE_API_URL=http://localhost:8090
   ```

### Web Development

1. **Hot Module Replacement**: Vite provides instant updates during development
2. **Type Safety**: TypeScript strict mode enabled
3. **Responsive Design**: Mobile-first approach with Tailwind
4. **Accessibility**: Dialogs use role/aria-modal; confirm/upload modals accessible

### Code Patterns

- **Path Aliases**: Use `~/*` for `src/*` and `~lib/*` for `src/lib/*`
- **TypeScript Strict**: Strict mode enabled for type safety
- **Auth**: Use AuthContext (do not read localStorage directly)
- **KB State**: Use `useKBList` for KB lists instead of duplicating fetch logic
- **Accessibility**: ARIA labels, keyboard navigation, accessible dialogs

### API Development

When working with backend integration:
- All API functions include proper error handling
- Response types are strictly typed with TypeScript interfaces
- Auth tokens stored via storage adapter (localStorage)
- API client is compatible with both web and extension environments

**Important Files:**
- `src/lib/storage.ts` - LocalStorage adapter for browser.storage compatibility
- `src/lib/api.ts` - API client (shared with copilot extension)
- `src/lib/config.ts` - Configuration and environment variables

## Deployment

### Docker Deployment

The dashboard is containerized with Nginx for production:

```dockerfile
# Multi-stage build
# Stage 1: Build with Node
# Stage 2: Serve with Nginx
```

**Key files:**
- `Dockerfile` - Multi-stage build configuration
- `nginx.conf` - Nginx server configuration
- `.dockerignore` - Files to exclude from Docker build

### Production Build

```bash
# Build for production
pnpm build

# Output: dist/ directory with optimized static files
```

### Runtime API-URL Injection (no rebuild)

The published image is environment-agnostic — nothing is baked in. The backend
API URL is chosen at **container startup** by `inject-config.sh`
(`/docker-entrypoint.d/40-inject-config.sh`), which reads the `VITE_API_URL`
environment variable and writes `window.ENV.API_URL` into `config.js`. At runtime
`src/config.ts` (`getApiUrl()`) resolves the URL in this precedence order:

1. `window.ENV.API_URL` — runtime injection. An explicitly-set key wins, **including
   the empty string** (`""` = same-origin; the app makes relative `/api/v1/...`
   calls, for the cloud reverse-proxy model).
2. Build-time `VITE_API_URL` — rarely used; the shipped image bakes nothing.
3. Same-host detection — API assumed on the host that served the dashboard at
   `:8090` (covers localhost, `127.0.0.1`, and LAN IPs). This is the self-hosted
   default when `VITE_API_URL` is unset.

```bash
# Split-host (dashboard and API on different origins) — set VITE_API_URL at RUN time:
docker run -p 3333:80 -e VITE_API_URL=https://api.faultmaven.ai \
  ghcr.io/faultmaven/faultmaven-dashboard:latest

# Self-hosted same-host default — leave VITE_API_URL unset; same-host detection
# targets :8090 on whatever host served the dashboard:
docker run -p 3333:80 ghcr.io/faultmaven/faultmaven-dashboard:latest
```

`inject-config.sh` validates that a set, non-empty `VITE_API_URL` is a bare origin
(`scheme://host[:port]`) and refuses to start otherwise, so a malformed value
cannot break out of the injected JS string.

## Related Projects

- **FaultMaven Copilot**: Browser extension for chat interface (separate repository)
- **FaultMaven Backend**: AI-powered troubleshooting backend API

This dashboard complements the copilot extension by providing dedicated KB management UI.
