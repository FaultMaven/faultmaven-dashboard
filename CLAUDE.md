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
│   ├── AdminCaseContentPage.tsx # Operator break-glass content view (ADR-012 D9) — audited open of one case's title/description/transcript
│   ├── UserManagementPage.tsx # Platform admin user management
│   ├── LLMConfigPage.tsx     # LLM provider configuration
│   ├── InvestigatePage.tsx   # The built-in Copilot panel on a NEW investigation (ADR-016 D1/D6)
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
│   ├── CaseTable.tsx         # Shared case list table (Title/[Owner]/State/Stage/Last Activity/[actions]) — used by CaseListPage + AdminCaseListPage (view=full)
│   ├── AdminCaseMetadataTable.tsx # Cloud operator table (Case ID/Owner/State/Stage/Last Activity) — no title column; "Open content" links to the audited operator route (ADR-012 D9)
│   ├── BreakGlassRequestDialog.tsx # Request time-boxed access to one case's content (reason + TTL)
│   ├── TranscriptView.tsx    # Read-only transcript renderer — OPERATOR break-glass page only (the owner's tab is the panel now)
│   ├── CaseStageCell.tsx     # Stage cell (Diagnosing/Mitigating/Resolving, amber `· stalled Nt`) — shared by both case tables and the detail header, so they cannot drift
│   ├── ConfirmDialog.tsx     # Reusable confirmation modal
│   ├── UploadModal.tsx       # File upload modal for KB
├── copilot/                  # The web host for @faultmaven/copilot-ui (ADR-016 D2)
│   ├── CopilotPanelMount.tsx # Installs the singletons + transport, then mounts CopilotPanel
│   ├── webHost.ts            # store / endpoints / navigation / pageCapture
│   ├── webSession.ts         # HostSession over the Dashboard's AuthManager
│   ├── advertisement.ts      # data-faultmaven-dashboard-panel + FM_DASHBOARD_PANEL_AVAILABLE
│   └── storeListing.ts       # The published Chrome Web Store URL, shared by both consumers
├── context/                  # AuthContext (global auth state)
├── hooks/                    # Custom hooks (useKBList for KB paging/search/delete)
└── lib/                      # Core logic
    ├── api.ts                # Barrel re-exports from modular API clients
    ├── auth/                 # Auth (AuthManager, login/logout, token storage)
    ├── cases/                # Cases API (CRUD, reports, knowledge suggestions)
    ├── breakGlass/           # Operator break-glass API (grants + audited content/transcript open)
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

- **Post-sign-in landing**: both sign-in paths call `resolvePostSignInLanding()`
  (`src/lib/auth/landing.ts`), which reads the account's case `total_count`
  once: no cases → `/investigate` (ADR-016 D6), otherwise `/cases`. It fails to
  `/cases`, because a count that could not be fetched is not evidence of an
  empty account. The decision is made HERE, at sign-in — not inside the list
  page, where it could not tell "no cases" from "paged past the end" or "just
  cleared a filter".
- **LoginPage**: Authentication interface with FaultMaven branding. Standalone: passwordless username form. Cloud: single Sign In button that hands off to the backend-advertised hosted-login URL (`oauth.hosted_login_url` from `/auth/config`), forwarding the ProtectedRoute-saved destination as `return_to`.
- **SSOCallbackPage**: Cloud hosted-login return leg (route `/auth/sso/callback`, public — it IS the login). The backend redirects here with a single-use completion `code` (+ optional same-origin `return_to`) or a sanitized `error` slug; the page POSTs `{code}` to `/api/v1/auth/sso/exchange`, stores the standard token response exactly like a LoginPage sign-in, and forwards to `return_to` → saved destination → `/kb`. Error slugs map to friendly messages with a "Back to sign in" link; raw query content is never echoed.
- **KBPage**: User knowledge base management (3-tier tabs: personal/team/global)
- **AdminKBPage**: Organization KB management (admin only)
- **CaseListPage**: Paginated case table with status/date/search filters. Search matches title and case ID via `POST /cases/search`. Renders rows via the shared `CaseTable` component. **When the list is empty and UNFILTERED it redirects to `/investigate`** — a signed-in person with no cases lands on the panel with a new investigation, not on a blank table (ADR-016 D6). A filtered-empty list stays put and offers the panel instead of jumping to it; a failed load never redirects, so an error is never mistaken for "no cases".
- **InvestigatePage**: Route `/investigate`, inside `ProtectedRoute`. Mounts the built-in Copilot panel with no case seeded — a new investigation. This is the surface that makes the Dashboard able to RUN an investigation rather than only review one (ADR-016 D1).
- **AdminCaseListPage**: Cross-tenant "All Cases" list (ADR-012 D9) — every user's cases on the server (Copilot- and Slack-agent-originated). Backed by `GET /api/v1/admin/cases`; state/source filters only. Gated by `canViewAllCases(isAdmin)` → **`platform_admin` in both deployments** (route `/admin/cases` + nav item). The response is a union **discriminated on `view`**, and the page narrows on it rather than on the deployment mode, so rendered columns cannot drift from served policy: `view: "full"` (standalone) renders `CaseTable` with titles; `view: "metadata"` (cloud) renders `AdminCaseMetadataTable` — ids/org/state/timestamps/counts, **no title or description** (user free text is content and needs the audited break-glass path, faultmaven#815). The endpoint still 403s under `TENANT_PROVIDER=multi` (RLS would make the list silently partial); the page shows that refusal *instead of* a table. Rows on **both** arms open through `/admin/cases/{id}` (the audited operator read), never `/cases/{id}` — the latter has no operator bypass and 404s on cases the operator does not own (faultmaven#846). The organization travels on the link (`?org=`) because requesting a grant needs it.
- **AdminCaseContentPage**: Operator break-glass content view (ADR-012 D9, faultmaven#815). Route `/admin/cases/:caseId`, same `canViewAllCases` guard as the list. Reads `GET /api/v1/admin/cases/{id}` + `/messages`; renders the case title/description/state and the transcript via the shared `TranscriptView`. The **response's `access` discriminator** decides the banner — `standing` (standalone: recorded, not gated) vs `break_glass` (cloud: names the grant, its reason and remaining TTL, with "End access now") — never the app's notion of the deployment. Without a live grant the backend refuses and the page shows the refusal plus a `BreakGlassRequestDialog`; content only ever arrives inside a successful response, so there is no state in which the page holds content it should be hiding.
- **CaseDetailPage**: Case header (title, description, state badge, stage cell when investigating, case ID, created date) + tabbed content + resolution notes (terminal cases only). Archive button shown for terminal cases (subtle styling).
- **ReportTab**: View-only display of auto-generated terminal summaries (resolution or closure). Formatted markdown rendering with download. No manual generate button.
- **IssueTab**: Structured view of investigation outcome (problem, milestones, root cause, solutions, resolution notes). Shown for all cases.
- **CaseDetailPage layout**: `h-screen flex flex-col`, NOT `min-h-screen`. The Transcript tab hosts the panel, and a panel whose composer is below the fold has to be scrolled to before it can be typed in — which is what a self-named `h-[70vh] min-h-[28rem]` produced once the case card had pushed it down the page. The panel now takes the room the page has left it, and the `min-h-0` chain from the page root down to it is load-bearing: one missing instance re-creates the bug in silence. Bound by `src/test/pages/CaseDetailLayout.test.tsx`.
- **TranscriptTab**: The built-in Copilot panel, opened on this case (ADR-016 D1). It replaced a read-only renderer that duplicated the extension's — one renderer, not two — so the transcript on this tab is interactive: a turn taken here and a turn taken in the extension are the same rows on the same server. The case is handed over as an argument (`initialCase={{ kind: 'existing', caseId }}`), and the mount is `key`ed on the case id because the panel applies that once, at its own mount. `TranscriptView` survives for the operator break-glass page only.
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

## The Copilot UI package

The investigation UI is not in this repository. `@faultmaven/copilot-ui` lives in
`faultmaven-copilot` under `packages/copilot-ui` and is consumed here as a git
dependency **pinned by SHA** (ADR-016 D2). Both hosts — the extension's side
panel and this Dashboard's built-in panel — build from that one source, so a UI
change reaches both or reaches neither.

- **The host adapter is `src/copilot/`.** The package states what it needs from
  its environment (a key-value store, where the backend is, navigation, page
  capture, a session) and each host answers differently. Nothing in it branches
  on `kind`; a branch on `kind` is a capability the interface failed to model.
- **What the panel opens on is an ARGUMENT**, `initialCase` — `{ kind: 'new' }`
  or `{ kind: 'existing', caseId }` — never a storage write. A host writing the
  panel's own keys behind its back couples this app to a key name, an encoding
  and a race it cannot see; two tests assert the only key this host writes is
  `hasCompletedFirstRun`.
- **`ApiTransport.clearSession` delegates** to the package's exported
  `clearPersistedSession`. Which keys a session occupies is the package's to
  know, and it is their single writer.
- **Import the package ENTRY only.** Deep subpaths resolve and are still off
  limits: they exist for the extension, which lives in the same repository as
  the package and can be updated in the same commit.
- **The one runtime import is dynamic**, in `CopilotPanelMount.tsx`. That is
  what keeps the shared UI out of the entry chunk so nothing of it is fetched
  before sign-in. `src/test/copilot/packageImportBoundary.test.ts` enforces both
  rules.
- **The theme ships with it** as a Tailwind preset, consumed in
  `tailwind.config.cjs`; `src/index.css` imports the package's `globals.css`.
  ADR-003 is one design system — the two configs had already drifted silently.
  ⚠️ `content` is the ONE key Tailwind does not merge across presets: a config's
  array REPLACES the preset's, and the package is a pnpm symlink. Get either
  wrong and every `fm-*` class the shared UI uses is purged — no error, no
  warning, a panel rendered unstyled. `pnpm check:shared-ui-styles` (CI job
  `web-bundle-boundary`, after `pnpm build`) is what makes that loud.
- **Adopting a change is moving the SHA** in `package.json` and re-running
  `pnpm install`. `pnpm check:copilot-pin` (CI job `copilot-ui-pin`) FAILS on
  pin shape, on a pin that is not on the copilot repo's `main`, and on the two
  repositories' `api-contract.pin.json` disagreeing. Staleness — the package
  having moved on — is an ADVISORY note only: copilot's main moves on its own,
  so failing on it would redden every open PR here and forbid developing the
  two repositories together. Whether this job is *required* depends on the
  ruleset the owner has applied; it is not required by default.
- **`pnpm check:web-boundary`** and **`pnpm check:shared-ui-styles`** run in the
  `lint` job after a build (that job already installs, and `build`/`smoke`
  already build twice — a third full build to ask two questions about `dist/`
  is CI time for nothing). The first asserts no Copilot sign-in reached the
  shipped bundle (ADR-016 D3); the second that the shared UI's `fm-*` classes
  are in the stylesheet at all.
- **The Dashboard mounts the panel with `chrome: 'embedded'`**, stated once in
  `CopilotPanelMount` rather than at each call site. The panel's own sidebar
  carries a case list, an account row and an "Open Dashboard" button — all three
  of which this app already renders around it, and the last of which links to
  the page the user is already on.
- **Two tests render the REAL package**, `realPanelMounts.test.tsx` and
  `embeddedChrome.test.tsx`.
  Every other test here mocks `@faultmaven/copilot-ui`, which is right for
  asserting the wiring and structurally blind to a package/host MISMATCH — a
  mocked package has no dependencies, so the whole suite stayed green while the
  panel crashed on every mount for want of a React context this app did not
  install. Keep them rendering the real thing.

### The panel advertisement

`src/copilot/advertisement.ts` holds a cross-repo contract
(faultmaven-copilot#231): the attribute `data-faultmaven-dashboard-panel` in
`index.html` and the `FM_DASHBOARD_PANEL_AVAILABLE` window message after the
panel mounts. It tells the extension that THIS BUILD hosts a panel, so the
extension yields its side panel here. Values `""`, `"false"` and `"0"` do not
advertise, which is how a build without the panel ships the same markup.

## Testing

`pnpm lint` deliberately does not cover `src/test/**` (`eslint.config.js`
ignores it). Use `pnpm lint:tests` for those files, and
`npx tsc -p tsconfig.eslint.json --noEmit` to type-check them —
`tsconfig.json` excludes tests so they never ship in the app build.

## API Types

`src/types/api.generated.ts` is **generated** from faultmaven's committed
`docs/reference/api/openapi.json` — never edit it by hand.

```bash
pnpm generate:api-types
```

By default it reads the spec from the core commit pinned in
`api-contract.pin.json`, which is the same file the `api-types-drift` CI job
reads — so the local command and the gate cannot disagree about which contract is
in force. It does **not** follow `main`: a backend merge reaches this client only
when a pull request here moves `ref` (and `contractVersion` to match), and that
commit is where this repository accepts the change. Point the generator elsewhere
to build against a contract you have not adopted — `--spec` works identically on
every platform:

```bash
pnpm generate:api-types --spec ../faultmaven/docs/reference/api/openapi.json
```

`FM_OPENAPI_SPEC` does the same and is what CI sets. Note the environment-prefix
form is POSIX-only — neither `cmd.exe` nor PowerShell accepts it:

```bash
FM_OPENAPI_SPEC=../faultmaven/docs/reference/api/openapi.json pnpm generate:api-types   # bash/zsh
```
```
set FM_OPENAPI_SPEC=..\faultmaven\docs\reference\api\openapi.json && pnpm generate:api-types   :: cmd.exe
$env:FM_OPENAPI_SPEC = "..\faultmaven\docs\reference\api\openapi.json"; pnpm generate:api-types   # PowerShell
```

Prefer `--spec` — it avoids the question entirely.

⚠️ Do **not** generate from a live server (`http://localhost:8090/openapi.json`).
Generating against whatever build happens to be running is how this repo and the
other frontend ended up with different names for the same schema (fm#880).

A spec change in faultmaven does **not** turn this repository red: the job
regenerates from the pinned commit, so merging there reaches nothing here.
`api-types-drift` goes red when the generated file stops matching the contract
this repo pins — `ref` moved without a regeneration, or the generated file was
edited by hand. Adopt a new contract in a PR of its own, pin and regenerated
types together, rather than folding it into unrelated work.
