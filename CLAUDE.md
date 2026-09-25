# CLAUDE.md

Guidance for Claude Code working in this repository. This file carries what every
session needs; area detail loads on demand from `.claude/rules/*.md` (each
declares the `paths:` it applies to). Read the rule for the area you are
touching before changing it.

## What this is

The **FaultMaven Dashboard**: the web app for running and reviewing case
investigations, managing the knowledge base (personal / team / global scopes),
configuring LLM providers, teams, and user and organization administration.
React 19 + Vite 6 SPA, React Router 7, TypeScript strict, Tailwind, Vitest; a
frontend only, needing a running FaultMaven API. The investigation UI itself is
`@faultmaven/copilot-ui`, a SHA-pinned git dependency from `faultmaven-copilot`,
hosted here through `src/copilot/`.

## Commands (Node 20+, pnpm 9)

```bash
pnpm install
pnpm dev                     # Vite dev server on http://localhost:3333 (vite.config.ts `server.port`;
                             #   Vite takes the next free port when 3333 is held, e.g. by the Docker dashboard)
pnpm lint                    # ESLint over src/ — ignores src/test/**
pnpm lint:tests              # ESLint over the test files
pnpm typecheck               # tsc --noEmit against tsconfig.json — excludes tests
pnpm typecheck:tests         # tsconfig.test.json — type-checks the tests too (CI runs it)
pnpm test                    # Vitest (watch); `pnpm test:coverage` is what CI runs
pnpm build                   # tsc && vite build → dist/
pnpm generate:api-types      # regenerate src/types/api.generated.ts from the pinned contract
pnpm check:copilot-pin       # the @faultmaven/copilot-ui pin (CI job copilot-ui-pin)
pnpm check:sso-slugs         # handled SSO error slugs vs the backend (CI job sso-slug-drift)
pnpm check:web-boundary      # after a build: no Copilot sign-in reached the bundle
pnpm check:shared-ui-styles  # after a build: the shared UI's fm-* classes are in the stylesheet
node scripts/brand-lint.mjs  # brand terminology in README.md / package.json (workflow brand-lint)
```

CI (`.github/workflows/ci.yml`) runs `pnpm lint --max-warnings 0` — warnings
are blocking there, including `@typescript-eslint/no-explicit-any` — then
`pnpm typecheck`, `pnpm typecheck:tests`, `pnpm build` plus the two bundle checks, `pnpm test:coverage`,
`pnpm audit --audit-level high`, the `copilot-ui-pin` / `sso-slug-drift` /
`api-types-drift` jobs, a Docker image build with a Trivy scan, and an nginx
smoke test.

## Configuration

- `VITE_API_URL` — backend origin (`scheme://host[:port]`, never a path: the app
  appends `/api/v1/...`). Unset → same-host detection: the API is assumed at
  `:8090` on the host that served the dashboard. For a build-time value copy
  `.env.example` to `.env.local`; `VITE_*` values are baked at build, so restart
  the dev server after changing them.
- `VITE_MAX_FILE_SIZE_MB` — upload cap, default 10. All parsing is in
  `src/config.ts`.
- Ports: `8090` API · `3333` Dashboard — the Vite dev server, and the host port
  the core repo's `docker-compose.yml` maps the image's `:80` to.
- **Runtime API-URL injection (no rebuild).** The published image bakes nothing:
  `inject-config.sh` (`/docker-entrypoint.d/40-inject-config.sh`) reads
  `VITE_API_URL` at container start and writes `window.ENV.API_URL` into
  `config.js`. `getApiUrl()` in `src/config.ts` resolves, in order: (1)
  `window.ENV.API_URL` when the KEY is present — an explicitly-set value wins
  **including the empty string** (`""` = same-origin: relative `/api/v1/...`
  calls, the cloud reverse-proxy model); (2) build-time `VITE_API_URL`; (3)
  same-host detection at `:8090`. The script refuses to start on a set,
  non-empty value that is not a bare origin. Docker run forms: README, "Docker
  Standalone".

## Source layout

```
src/
├── App.tsx                  # Route table + the per-route wrappers (TeamsRoute, ManagementConsoleRoute,
│                            #   AllCasesRoute, LLMConfigRoute, ChatSurfaceRoute); the guards they compose are
│                            #   components/{ProtectedRoute,AdminProtectedRoute,GatedRoute}.tsx
├── config.ts                # getApiUrl() precedence + input limits (see Configuration)
├── pages/                   # One component per route: /login LoginPage · /signup SignUpPage ·
│   │                        #   /auth/sso/callback SSOCallbackPage · /auth/authorize OAuthAuthorizePage ·
│   │                        #   /cases CaseListPage · /cases/:caseId CaseDetailPage · /investigate InvestigatePage ·
│   │                        #   /admin/cases AdminCaseListPage · /admin/cases/:caseId AdminCaseContentPage ·
│   │                        #   /kb KBPage (all three scopes; global gated on the operator role) ·
│   │                        #   /settings/llm LLMConfigPage · /admin/users UserManagementPage ·
│   │                        #   /teams TeamsPage · /admin/organization OrganizationPage
├── components/              # Shared UI. Cases: CaseTabs (Transcript/Issue/Report/Hypotheses/Evidence — the
│   │                        #   last two are inline here), ConversationDock, CasePanelMount, TranscriptView,
│   │                        #   CaseTable, CaseStageCell, CaseStateBadge, CaseFiltersBar, AdminCaseMetadataTable,
│   │                        #   BreakGlassRequestDialog, ReportTab, IssueTab. KB: DocumentCard, DocumentList,
│   │                        #   DraftEditor, UploadModal, UploadZone, CreateRunbookForm, ConvertUpload.
│   │                        #   Header: PageHeader, CopilotEntry, AccountMenu.
│   ├── teams/               # TeamCard, MyInvitationsPanel
│   └── console/             # OrganizationPanel, AddMemberModal
├── copilot/                 # The web host for @faultmaven/copilot-ui (ADR-016 D2): CopilotPanelMount,
│                            #   webHost, webSession, advertisement, copilotCapability, usePanelAdvertisement,
│                            #   storeListing (COPILOT_STORE_URL), pageSingletons
├── context/AuthContext.tsx  # Global auth state, /auth/config detection, capability flags
├── hooks/                   # useKBList, useCaseList, useCapabilities, useAvailableScopes, useChatSurface,
│                            #   useCopilotPresence, useDockFits, useNavigationItems, useTeamSharing
├── lib/
│   ├── api.ts               # Backward-compat barrel over auth/cases/knowledge/llm/users (+ listTeams);
│   │                        #   the newer clients are imported from their module (see Conventions)
│   ├── auth/                # AuthManager, devLogin/ssoExchange/logoutAuth, landing.ts, hostedLoginUrl,
│   │                        #   ssoErrors, crossTab, lnaDiagnosis
│   ├── cases/               # Cases API + conversationSurface.ts (the one rule), dockPreference.ts,
│   │                        #   dateRange.ts, dateColumn.ts, turnLabel.ts, exportMarkdown.ts, closureReason.ts
│   ├── breakGlass/          # Operator break-glass API (grants + audited content/transcript open)
│   ├── teams/               # Teams + invitations client (api.ts) and refusal-slug copy (copy.ts)
│   ├── organization/        # The billing organization console client (/admin/organization*)
│   ├── knowledge/           # KB client, conversion, writePolicy, types (+ narrowing guards)
│   ├── llm/ users/ meta/    # LLM config, user management, /meta/capabilities clients
│   ├── copilot/             # chatSurfacePreference.ts — the per-browser-profile chat-surface preference
│   ├── access.ts            # Route/nav predicates: canManageUsers, canManageConsole, canUseTeams,
│   │                        #   canViewAllCases, canManageLlmConfig
│   ├── storage.ts           # window.browser.storage polyfill + the `faultmaven_`-prefixed localStorage codec
│   └── ui/ identity.ts community.ts markdownUtils.ts mermaidSvgCache.ts
├── types/                   # api.generated.ts (generated), contractGuards.ts, per-area narrowings
├── utils/debounce.ts
└── test/                    # Vitest suite (setup.ts, support/, one directory per source area)
```

## Conventions

- TypeScript strict, no `any` (`no-explicit-any` warns locally and blocks CI)
  and no escape hatches in app code: no `@ts-ignore` / `@ts-expect-error`
  (there are none under `src/` outside tests), and no `as unknown as T` to
  force a value's type — read the value in a way that types correctly (the
  one under `src/` is the `window.browser` polyfill install in `storage.ts`).
- Path aliases: `~/*` → `src/*`, `~lib/*` → `src/lib/*` (`tsconfig.json` and
  `vite.config.ts` both declare them).
- Auth state through `AuthContext` / `AuthManager`; never read the auth keys
  from `localStorage` directly. `src/lib/storage.ts` owns the prefixed codec
  (`STORAGE_KEY_PREFIX`) and the `window.browser.storage` polyfill.
- State that lives outside React — a DOM attribute another world writes, or a
  module-level store — is read with `useSyncExternalStore` over a
  subscription, never `useState` plus a timed re-check (a signal that starts
  later is missed by any timer). The hooks that do this: `useChatSurface`,
  `useCopilotPresence`, `useCapabilities`, `useAvailableScopes`, `useDockFits`,
  and `src/copilot/usePanelAdvertisement.ts`.
- Gate on an advertised capability, never on a version, and absent reads as NO
  (`=== true`): `useCapabilities` (`/meta/capabilities`) and the `oauth.*` flags
  on `/auth/config` share the convention.
- KB lists go through `useKBList` (paging / search / delete). The older
  clients (`auth`, `cases`, `knowledge`, `llm`, `users`) are re-exported by
  `src/lib/api.ts` — a backward-compat barrel by its own header — and pages
  import those through it; the newer clients (`teams`, `organization`,
  `breakGlass`, `api/oauth`, `meta`) are not in the barrel (only `listTeams`
  is) and are imported from their module directly. A new client goes in
  `src/lib/<area>/` and is imported directly.
- Modal dialogs carry `role="dialog"` and `aria-modal`; a control the user is
  standing on is never unmounted to change its label (focus would drop to
  `<body>`).

## Testing

- `tsconfig.json` excludes `src/test/**` and `*.test.ts(x)` so tests never ship
  in the app build; app files are typed by it, and `pnpm typecheck` runs
  against it. `tsconfig.test.json` (ES2022 + Node via `src/test/node-env.d.ts`)
  types the tests for both ESLint's typed linting and `pnpm typecheck:tests`;
  use `pnpm lint:tests` and `pnpm typecheck:tests` for them.
- `pnpm typecheck:tests` gates CI (the "Type-check tests" job) and must be
  clean — tests have Node types and the ES2022 lib, so there are no
  pre-existing `node:*` / `.at()` errors to carry.
- Vitest runs on happy-dom with `src/test/setup.ts`; coverage floors live in
  `vite.config.ts` and are never lowered to make a PR pass. `.worktrees/` and
  `.claude/worktrees/` are excluded from the test glob (and from the Docker
  build context), because a worktree under the repo is collected as a second
  copy of the suite — `.gitignore` alone does not stop Vitest.
- Contract guards live in app files (next section), where `pnpm typecheck`
  enforces them; test files are checked separately by `pnpm typecheck:tests`.

## API contract

- `src/types/api.generated.ts` is generated from the core repo's committed
  `openapi.json`; never hand-edit it. `api-contract.pin.json` names the core
  commit and `contractVersion` this client is written against; adopting a
  contract change means moving `ref` and regenerating, in a PR of its own.
  Never generate from a live server.
- A type that narrows a generated one carries a compile-time guard from
  `src/types/contractGuards.ts` (`GuardNarrowing`, `GuardNarrowedMember`,
  `GuardSubset`), in an app file. Detail: `.claude/rules/api-contract.md`.

## Tenancy (ADR-017): three ids, three questions

The three ids a row can carry answer three different questions, and the UI must
never let one stand in for another.

| Tier | Question | Where it shows up here |
|---|---|---|
| **Enterprise** (`enterprise_id`) | *May these two accounts ever see each other's data?* | Required on `CaseSummary`, `CaseDetail`, `AdminCaseMetadata`, `TeamResponse`, `InvitationResponse`, `AdminUserListItem`, `UserDetailResponse`, `InvestigationSessionResponse`. It is the tenant `?enterprise=` carries to the break-glass page and the tenant `BreakGlassGrantRequest.enterprise_id` names. |
| **Organization** (`organization_id`) | *Who pays for these accounts?* | **Billing only.** Nullable on `CaseSummary`, `CaseDetail` and `AdminCaseMetadata`, and null for every account nobody pays for; required only on `OrganizationSummary`; not a search filter anywhere at contract 9.0.0. The subject of `OrganizationPage` and `GET /auth/me`'s `organization`. Never a visibility predicate, and never rendered as one. |
| **Team** (`team_id`) | *Who has agreed to share?* | `TeamsPage`, the share badges, the team case filter, `shared_team_ids`. Formed by consent: the invitee's own `POST /invitations/{id}/accept` is the only call that creates a membership. |

- **`GET /auth/me` publishes no enterprise.** Nothing client-side may derive
  one — including "is this account an island?", which is rendered only from
  the backend's own `enterprise_is_personal` refusal.
- **`HostUser` carries no tenant.** The field was deleted from
  `@faultmaven/copilot-ui` (copilot#253) because nothing read it.
- **Refusals on the team surface carry a slug** (`reason` on 403/409/410);
  branch on it via `teamRefusalReason` and render `src/lib/teams/copy.ts`'s
  sentence. 410 `invitation_expired` is a plain note, never an error banner.

**Lexicon.** The isolation tenant is **"enterprise"** on operator and admin
surfaces and **"your company"** in end-user copy. The vocabulary that called a
team an **account** is retired (ADR-017 D6): a team is a group of accounts,
never one.

## Cases: where the conversation renders (ADR-018 D2)

- ONE question, resolved once in `src/lib/cases/conversationSurface.ts`
  (`resolveCaseConversationLayout` → `{surface, dockPresent, transcriptTabShown,
  viewportBounded}`, handed down whole, never re-derived by a consumer): *does
  this user have a composer somewhere else?* Owner, preference off, wide → the
  dock, Transcript tab hidden. Dock collapsed, preference on, or a non-owner →
  the Transcript tab read-only (`TranscriptView`). Narrow width → the Transcript
  tab hosts the live panel, because no dock exists there. Exactly one surface
  renders the conversation, and reading it is never removed.
- `?tab=` (`?tab=report`, `?tab=issue`) is the cross-frontend linking contract
  with the Copilot: the URL wins when it names a visible tab, and a value the
  strip cannot honour is cleared from the URL (`replace`), never silently
  ignored.
- `CaseTable`'s `dateColumn` is required: one value names both the field and
  the header, resolved in `src/lib/cases/dateColumn.ts` from the filters that
  fetched the rows in hand.
- Date filters are instants: `src/lib/cases/dateRange.ts` turns a picked day
  into a half-open local-time window. `listCases` is the only caller that SENDS
  the bounds; `dateColumn.ts` calls the same resolvers to decide the column.
- Operator views (`/admin/cases*`) exist for the cloud `platform_admin` only
  (`canViewAllCases`) and open a case through the audited operator route,
  carrying `?enterprise=`.

Detail: `.claude/rules/cases.md`.

## The Copilot UI package (ADR-016 / 018 / 019)

- Import `@faultmaven/copilot-ui` by its ENTRY only, and the entry only
  dynamically, in `src/copilot/CopilotPanelMount.tsx`. The `/contract` and
  `/turn-label` subpaths are the exceptions, each through one door
  (`advertisement.ts`, `copilotCapability.ts`, `lib/cases/turnLabel.ts`);
  `src/test/copilot/packageImportBoundary.test.ts` enforces it.
- The chat-surface preference (`src/lib/copilot/chatSurfacePreference.ts`)
  defaults OFF and is never set by detection. It governs the interactive
  surfaces only — the dock, the `New Case` nav item, `/investigate`
  (`ChatSurfaceRoute`), the case list's CTAs, the first-run landing and the D0
  advertisement — and never the Transcript tab.
- The Dashboard degrades, never requires the extension; capabilities beat
  versions; an extension that cannot withdraw is never asserted to.
- Adopting a package change is moving the SHA in `package.json` and running
  `pnpm install`; `pnpm check:copilot-pin` gates it. The theme is the package's
  Tailwind preset; `content` in `tailwind.config.cjs` must keep the preset's
  globs or every `fm-*` class is purged silently.

Detail: `.claude/rules/copilot-host.md`.

Sign-in (post-sign-in landing, LoginPage, SignUpPage, SSOCallbackPage, route
guards): `.claude/rules/sign-in.md`. Teams and the billing organization:
`.claude/rules/teams-and-organization.md`.

## Deployment

Multi-stage `Dockerfile` (Node build → `nginx:alpine` with `nginx.conf` and
`inject-config.sh`); the image is `ghcr.io/faultmaven/faultmaven-dashboard`,
published by `.github/workflows/publish-docker.yml`. Run forms and the
full-stack path (API + Dashboard from the core repo's compose file): README.

## References

- `ADR-nnn` in comments and rules cites a FaultMaven architecture decision
  record. The decision texts are not in this repository; the rule as stated
  here and in `.claude/rules/` is the binding form.
- Related repositories (links in README): `faultmaven` (the API; publishes the
  OpenAPI contract) and `faultmaven-copilot` (the extension and `packages/copilot-ui`).
