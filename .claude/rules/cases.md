---
paths:
  - "src/pages/CaseListPage.tsx"
  - "src/pages/CaseDetailPage.tsx"
  - "src/pages/InvestigatePage.tsx"
  - "src/pages/AdminCaseListPage.tsx"
  - "src/pages/AdminCaseContentPage.tsx"
  - "src/components/Case*.tsx"
  - "src/components/ConversationDock.tsx"
  - "src/components/TranscriptView.tsx"
  - "src/components/AdminCaseMetadataTable.tsx"
  - "src/components/BreakGlassRequestDialog.tsx"
  - "src/components/ReportTab.tsx"
  - "src/components/IssueTab.tsx"
  - "src/hooks/useCaseList.ts"
  - "src/hooks/useDockFits.ts"
  - "src/lib/cases/**"
  - "src/lib/breakGlass/**"
  - "src/types/cases.ts"
  - "src/test/pages/*Case*.test.tsx"
  - "src/test/pages/adminCasesRoute.test.tsx"
  - "src/test/components/Case*.test.tsx"
  - "src/test/components/TranscriptView.test.tsx"
  - "src/test/components/RecordTranscript.test.tsx"
  - "src/test/components/IssueTab.test.tsx"
  - "src/test/components/BreakGlassRequestDialog.test.tsx"
  - "src/test/lib/cases/**"
  - "src/test/lib/messageAttribution.test.tsx"
  - "src/test/hooks/useCaseList.test.ts"
  - "src/test/support/caseConversationLayout.ts"
  - "src/test/support/caseDateColumn.tsx"
  - "src/test/copilot/noPanelOnReadOnlyTranscript.test.tsx"
---

# Cases: list, detail, conversation surface, operator views

The one rule most likely to be broken from outside this area — where a case's
conversation renders — is stated in the root `CLAUDE.md`. This file carries the
rest.

## CaseListPage (`/cases`)

Paginated case table with state / team / creation-date / search filters. Search
matches title and case ID via `POST /cases/search`. Renders rows via the shared
`CaseTable` component.

- **The creation-date range bounds `created_at` with `created_after` /
  `created_before`** (contract 3.8.0, faultmaven#1409), and those are
  **instants, not calendar days** — the server cannot know which day
  `2026-09-14` meant, so it does not guess. `src/lib/cases/dateRange.ts`
  resolves the picked day **in the viewer's own timezone** and `listCases` is
  the only caller, so the conversion happens once. The window is **half-open**,
  `[created_after, created_before)`: the upper bound is the NEXT day's first
  instant, never 23:59:59.999 — `created_at` keeps microseconds while
  `toISOString` stops at milliseconds, so an inclusive bound drops a case
  created at 23:59:59.9997. An **inverted** range is a 422 from the server,
  not an empty list.
- **The date inputs are disabled during a text search**: `POST /cases/search`
  accepts no date bounds, and a control that is accepted and silently dropped is
  exactly what #51 was — the same rule `stateOnly` follows for the admin view.
  **The state chips are NOT** disabled, as of contract 3.9.0 (#166): the server
  applies `state` in the same query as the text search, so the two compose and
  the `limit` returns 100 matches *in that state* rather than 100 matches
  thinned afterwards. One control travels, the other has no field to travel in.
- ‼ `searchCases` builds its body as the generated `CaseSearchRequest` with the
  optional keys **written out**, never conditionally spread: TypeScript does not
  excess-property-check a spread operand, so `...(state && { state })` compiles
  clean against a contract with no such field and the binding becomes
  decoration (measured both ways). `JSON.stringify` drops `undefined`, so the
  wire bytes are identical and only the compiler can tell them apart.
- **It does NOT redirect.** An empty-list redirect to `/investigate` keyed on
  the rows in hand made `/cases` unreachable for a person with no cases, and
  bounced anyone who merely paged past the end or cleared a filter —
  `cases.length` cannot tell those apart. The first-run question is asked once,
  at sign-in, by `resolvePostSignInLanding` (ADR-016 D6). The page renders an
  ordinary empty state and offers the panel rather than jumping to it.
- **Which empty state** needs **both** `total_count === 0` **and** no active
  filter. Each alone gets a real case wrong: every predicate sits in the same
  WHERE clause as the COUNT, so a filtered-to-nothing list reports zero and
  "No cases yet." would greet an account with forty cases; and with no filters
  set, paging past the end is empty while the account is full, which only
  `total_count` distinguishes.

### The date column follows the creation-date filter (#155)

The table shows ONE date. `src/lib/cases/dateColumn.ts` resolves which date to
show and `CaseListPage` hands the answer to `CaseTable` whole, the way
`CaseTabs` takes its layout: **one value carries both the field and the header
label**, so a `Created` header over a `last_activity_at` cell is not a state the
component can reach. `dateColumn` is **required** (no default) — a silent default
re-opened #155 by omission for the next caller.

Two things decide it, and getting either wrong puts a `Created` header over an
unfiltered list:

- **A bound that RESOLVES, not a string that looks like a date.** The resolver
  calls the same `startOfLocalDay` / `exclusiveEndOfLocalDay` that `listCases`
  sends with, because both return `undefined` for a day `dateRange.ts` rejects
  and no bound is then sent. Reachable: a date input reports `0002-09-14`,
  `0020-09-14`, `0202-09-14`… as the year is typed. Measured — `0002-…` and a
  5-digit year resolve to nothing, `0202-…` is a real bound, and `9999-12-31`
  resolves an END in Auckland/Kolkata but not in UTC/LA, so only the resolution
  can answer. Either resolved bound alone counts; a **search suspends both**
  (`POST /cases/search` sends no dates while `CaseFiltersBar` KEEPS the range).
- **`appliedFilters`, not `filters`.** The column describes the rows in hand, so
  it is computed from what fetched them — `useCaseList` publishes the filters of
  the LAST RESPONSE (and derives `searchMode` from them rather than tracking a
  second copy). They come apart whenever a request fails and the previous rows
  stay: an inverted range 422s, `cases` still holds the unfiltered page, and the
  empty-state branch needs `!error` — so reading `filters` headed stale rows
  `Created`.

A `role="status"` line names the column. The NODE is always rendered (a live
region inserted with content already in it is the case AT handles least
consistently); the SENTENCE only while there are rows, keyed on rows rather than
`!loading` so a refetch does not re-announce on every page change. The operator
list is `stateOnly` and states `LAST_ACTIVITY_COLUMN`, so it can never swap.

## InvestigatePage (`/investigate`)

Inside `ProtectedRoute` and `ChatSurfaceRoute`, and a top-level **`New Case`**
nav item (ADR-018 D2/D5) — before that it was reachable only by redirect, so an
account with one case could never get back to it. Mounts the built-in Copilot
panel with no case seeded. This is the surface that makes the Dashboard able to
RUN a case rather than only review one (ADR-016 D1), and the permanent one for
everybody who never gets a side panel (Firefox, managed browsers, self-hosted).

## CaseDetailPage (`/cases/:caseId`)

Case header (title, description, state badge, stage cell when investigating,
case ID, created date) + tabbed content + resolution notes (terminal cases only).
**Export / Archive to Markdown** (ADR-018 D2) is a read-only, client-side
download: `fetchCaseMarkdown` (`src/lib/cases/exportMarkdown.ts`) builds the
record and the page hands it to the browser as a `text/markdown` Blob — no
state change on the server.

- **ReportTab**: view-only display of auto-generated terminal summaries
  (resolution or closure), markdown-rendered, with download. No manual generate.
- **IssueTab**: structured view of the investigation outcome (problem,
  milestones, root cause, solutions, resolution notes). Shown for all cases.
- **HypothesesTab** (inline in `CaseTabs.tsx`): renders `active_hypotheses` from
  `GET /cases/{id}/ui` for INVESTIGATING cases — status symbol, likelihood %,
  evidence count, statement. For terminal cases the `/ui` endpoint does not
  surface hypothesis details; falls back to a count-only note.
- **EvidenceTab** (inline in `CaseTabs.tsx`): evidence-first list backed by
  `GET /cases/{id}/evidence` (full `EvidenceDetails[]` in one round-trip). Each
  row shows category badge · summary · source filename · turn · linked-hypothesis
  count; expands to the verbatim `extract`, optional analysis, and related
  hypotheses with stance badges (SUPPORTS / REFUTES / NEUTRAL). A footer toggle
  switches to the file view (`GET /cases/{id}/uploaded-files` + per-file
  detail) for the "did my upload get processed?" question.
- **CaseTabs**: Transcript, Issue, Report, Hypotheses, Evidence. Hypotheses is
  conditional on `hypothesis_count > 0`; Transcript is hidden only while the
  dock is showing the conversation. The active tab falls back to the FIRST
  VISIBLE tab, not the literal `transcript`. All markdown is rendered via
  react-markdown with external links opening in new tabs.

### Layout

The root height is CONDITIONAL on `layout.viewportBounded`: `h-dvh min-h-[40rem]
flex flex-col` when a composer is on the page, `min-h-screen` when none is.
Never `h-screen` on the bounded branch: `vh` ignores mobile browser toolbars, so
the bottom of the page ends up under them, and the `min-h-[40rem]` floor is what
makes a genuinely short window scroll rather than crush the panel. The panel
takes the room the page has left it, and the `min-h-0` chain from the page root
down to it is load-bearing: one missing instance re-creates the
composer-below-the-fold bug in silence. Bound by
`src/test/pages/CaseDetailLayout.test.tsx`.

### Where the conversation renders (ADR-018 D2) — the detail

ONE question, asked once by `CaseDetailPage` through
`src/lib/cases/conversationSurface.ts` and handed down whole: *does this user
have a composer somewhere else?*

| Preference | Width | Owner? | Conversation renders in |
|---|---|---|---|
| on | any | yes | the Transcript tab, **read-only** (`TranscriptView`) |
| off | wide | yes | **the dock** — Transcript tab hidden |
| off | wide, dock collapsed | yes | the Transcript tab, read-only (the rail is still a composer) |
| off | narrow | yes | the Transcript tab, **live panel** (no dock at this width) |
| — | any | **no** | the Transcript tab, read-only |

- `resolveCaseConversationLayout` returns `{surface, dockPresent,
  transcriptTabShown, viewportBounded}` **together**, because three consumers
  would otherwise re-derive them from the same inputs and any two disagreeing
  is a visible defect: two live panels on one page, a default tab that is not
  in the strip, or a dock with no column height.
- **A collapsed dock is not a fifth rule.** It is still a composer one click
  away, so the same question sends the tab back as the *record* — which is how
  "exactly one surface renders the conversation" stays true through a collapse
  without the panel ever moving between two mount points. Narrow width is
  genuinely different: no dock exists, so a read-only tab would leave a guest
  with no composer at all.
- **`prefersExtension` is the user's own preference** (ADR-018 D3), read from
  `src/lib/copilot/chatSurfacePreference.ts` — per browser profile, defaulting
  OFF, never set by detection. It governs the interactive surfaces only: the
  dock, the `New Case` nav item and `/investigate`, and the D0 advertisement.
  It NEVER governs the ability to read a conversation.
- **The page is viewport-bounded exactly when a composer is on it.** `h-dvh
  min-h-[40rem]` buys one thing — a composer above the fold — so a page with
  none goes back to `min-h-screen` and grows.
- **The dock mounts on first open and HIDES thereafter.** Never opened → no
  package chunk, no session, no transcript fetch. Opened then collapsed → the
  same instance, hidden, so an in-flight turn survives. The flag is one-way on
  purpose.
- **Known gap**: crossing the 1024px breakpoint moves the panel between the
  dock and the tab, which is a remount. The ADR requires the *collapse* case
  only; a resize mid-turn would lose it.
- **Toggling the dock is a LAYOUT gesture and never navigates the record.** The
  active tab is REMEMBERED (`chosen`, adjusted during render): the URL wins
  whenever `?tab=` names one, otherwise the last thing displayed. A default
  computed from the dock's state moves the user when Transcript enters or
  leaves the strip. A `?tab=` the strip cannot honour is CLEARED from the URL
  rather than ignored, because `?tab=` is the cross-frontend linking contract
  and a dropped value makes the address bar describe something that is not
  rendered.
- **The dock's toggle is ONE button whose label changes**, not one per state.
  Two buttons in exclusive branches unmounted the control the user was standing
  on, dropping keyboard focus to `<body>` and taking the `aria-expanded`
  announcement with it. Its `aria-controls` target is always rendered, empty
  until first open, so the reference never dangles.
- **The read-only transcript is hidden, not unmounted, across tab switches** —
  the same rule as the live arm and for the same reason: `getCaseMessages`
  pages at 100 messages a request, so unmounting cost a long case several round
  trips and a loading flash on every visit.
- Bound by `src/test/lib/cases/conversationSurface.test.ts` (D2's table),
  `src/test/pages/CaseDetailConversation.test.tsx` (readable in every state;
  record and conversation at once; one panel per page; collapse keeps the
  instance) and `src/test/copilot/noPanelOnReadOnlyTranscript.test.tsx` (the
  read-only arm imports the package zero times — its own file, because a module
  import is cached per test file).

## AdminCaseListPage (`/admin/cases`) — cloud operator only

Cross-tenant "All Cases" list (ADR-012 D9) — every user's cases on the server
(Copilot- and Slack-agent-originated). Backed by `GET /api/v1/admin/cases`;
state/source filters only.

- **Gated by `canViewAllCases(deployment, isAdmin)` → the cloud `platform_admin`
  only**, for BOTH the routes (`/admin/cases`, `/admin/cases/:caseId`) and the
  nav item — one predicate, so they cannot drift.
- ‼ **Standalone is single-user by design** (a personal assistant run locally,
  which is what makes its passwordless username login acceptable), so there is
  nothing there for this view to show: "every case on the server" and "my
  cases" are the same list — measured on a live stack, `GET /cases` and
  `GET /admin/cases` returned the same ids — while its content arm wrote an
  operator-access audit row for reading your own case. Standalone can
  technically hold more accounts (`faultmaven.sh create-user`; only the
  bootstrap one is the operator), but **multi-user standalone is not a
  supported configuration** and earns no route, nav slot or branch. Several
  people means `AUTH_MODE=oauth`, which this app reads as cloud and which
  brings real identity, teams and RBAC (#177, #178).
- ‼ An unconfirmed deployment ALLOWS, and **neither surface waits for
  detection** — the route carries no clause the nav lacks. ⛔ Do not add a
  wait: `configStatus` flips to `'unreachable'` after the FIRST failed
  `/auth/config` attempt and only THEN runs the retry ladder (1s + 3s, then a
  30s reprobe), so no `configStatus` value means "settled", and a gate keyed on
  it guesses through the ladder anyway while blanking the route for up to the
  8s fetch timeout. Failing closed would bounce a cloud operator off their own
  bookmark for a client check whose authority is the backend. The residual cost
  is a standalone operator briefly seeing both while `/auth/config` is down,
  which the reprobe heals. Bound on App's real route table by
  `src/test/pages/adminCasesRoute.test.tsx` — a hand-built router tests the
  guard component and not the wiring, which is how `ChatSurfaceRoute`'s
  deletion once left 1200 tests green.
- The response is a union **discriminated on `view`**, and the page narrows on
  it rather than on the deployment mode, so rendered columns cannot drift from
  served policy: `view: "full"` (standalone) renders `CaseTable` with titles;
  `view: "metadata"` (cloud) renders `AdminCaseMetadataTable` — ids / state /
  timestamps / counts, **no title or description** (user free text is content
  and needs the audited break-glass path, faultmaven#815). The endpoint still
  403s under `TENANT_PROVIDER=multi` (RLS would make the list silently
  partial); the page shows that refusal *instead of* a table.
- Rows on **both** arms open through `/admin/cases/{id}` (the audited operator
  read), never `/cases/{id}` — the latter has no operator bypass and 404s on
  cases the operator does not own (faultmaven#846). The ENTERPRISE travels on
  the link (`?enterprise=`) because requesting a grant needs it —
  `BreakGlassGrantRequest.enterprise_id`, the isolation tenant (ADR-017 D1),
  never the billing organization.

## AdminCaseContentPage (`/admin/cases/:caseId`)

Operator break-glass content view (ADR-012 D9, faultmaven#815), same
`canViewAllCases` guard as the list. Reads `GET /api/v1/admin/cases/{id}` +
`/messages`; renders the case title/description/state and the transcript via the
shared `TranscriptView`. The **response's `access` discriminator** decides the
banner — `standing` (standalone: recorded, not gated) vs `break_glass` (cloud:
names the grant, its reason and remaining TTL, with "End access now") — never
the app's notion of the deployment. Without a live grant the backend refuses and
the page shows the refusal plus a `BreakGlassRequestDialog`; content only ever
arrives inside a successful response, so there is no state in which the page
holds content it should be hiding.
