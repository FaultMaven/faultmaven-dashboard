---
paths:
  - "src/pages/TeamsPage.tsx"
  - "src/pages/OrganizationPage.tsx"
  - "src/lib/teams/**"
  - "src/lib/organization/**"
  - "src/components/teams/**"
  - "src/components/console/**"
  - "src/components/TeamShareBadge.tsx"
  - "src/components/ShareCaseModal.tsx"
  - "src/hooks/useTeamSharing.ts"
  - "src/types/teams.ts"
  - "src/types/organization.ts"
  - "src/test/pages/TeamsPage.test.tsx"
  - "src/test/pages/OrganizationPage.test.tsx"
  - "src/test/lib/teams.test.ts"
  - "src/test/lib/organization.test.ts"
  - "src/test/hooks/useTeamSharing.test.ts"
  - "src/test/components/TeamShareBadge.test.tsx"
  - "src/test/components/ShareCaseModal.test.tsx"
---

# Teams (consent) and the billing organization

The tenancy model — enterprise isolates, organization bills, team shares — and
its lexicon are in the root `CLAUDE.md`. This file carries the two surfaces.

## TeamsPage (`/teams`)

Inside `TeamsRoute` (`canUseTeams(teamSharing)` — no role: ADR-017 D4 says any
account may create a team). Lists the offers addressed to me with
accept/decline, then my teams: each card lazily loads its roster and, for a
**team admin** (decided by the caller's own `team_role` on that roster, never by
a deployment role), the invitations it has issued plus an invite-by-email form.

- Refusals render from the API's `reason` slug through `lib/teams/copy.ts`.
  403/409/410 answer `{error, detail, status_code, reason}`; branch on `reason`
  via `teamRefusalReason`, render the sentence, and fall back to the backend's
  `detail` when the slug is absent (a 404 carries none, by design).
- **410 `invitation_expired` is not an error** — nobody did anything wrong, the
  offer lapsed — so it renders as a plain note, never a failure banner.
- An `enterprise_is_personal` refusal replaces the invite form with the island
  sentence — the ONLY way this app learns the account is an island, because
  `/auth/me` publishes no enterprise.

## OrganizationPage (`/admin/organization`)

Behind `ManagementConsoleRoute` (`canManageConsole`). The **billing**
organization (ADR-017 D5): its name, slug, enterprise, member count, and the
members with their **management** roles. `GET /admin/organization` answering
**404 means the caller is in no organization**, and the client turns it into
`null` so the page renders an empty state rather than a failure. No team management here at all; cloud contract 2.0.0
deleted `/admin/teams*`.
