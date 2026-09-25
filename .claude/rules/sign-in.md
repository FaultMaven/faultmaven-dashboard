---
paths:
  - "src/pages/LoginPage.tsx"
  - "src/pages/SignUpPage.tsx"
  - "src/pages/SSOCallbackPage.tsx"
  - "src/pages/OAuthAuthorizePage.tsx"
  - "src/lib/auth/**"
  - "src/lib/api/oauth.ts"
  - "src/lib/community.ts"
  - "src/context/**"
  - "src/App.tsx"
  - "src/components/ProtectedRoute.tsx"
  - "src/components/AdminProtectedRoute.tsx"
  - "src/components/GatedRoute.tsx"
  - "src/components/PageHeader.tsx"
  - "src/hooks/useNavigationItems.ts"
  - "src/lib/access.ts"
  - "src/test/App.test.tsx"
  - "src/test/hooks/useNavigationItems.test.ts"
  - "src/test/components/PageHeaderNav.test.tsx"
  - "src/test/components/ProtectedRoute.test.tsx"
  - "src/test/components/AdminProtectedRoute.test.tsx"
  - "src/test/lib/api/oauth.test.ts"
  - "src/test/pages/LoginPage.test.tsx"
  - "src/test/pages/SignUpPage.test.tsx"
  - "src/test/pages/SSOCallbackPage.test.tsx"
  - "src/test/pages/OAuthAuthorizePage.test.tsx"
  - "src/test/pages/deploymentGatedRoutes.test.tsx"
  - "src/test/App.signupRoute.test.tsx"
  - "src/test/context/**"
  - "src/test/lib/auth/**"
  - "src/test/lib/access.test.ts"
  - "src/test/copilot/firstRunLanding.test.tsx"
---

# Sign-in, sign-up and the post-sign-in landing

## Post-sign-in landing

Both sign-in paths call `resolvePostSignInLanding()` (`src/lib/auth/landing.ts`),
which reads the account's case `total_count` once: no cases → `/investigate`
(ADR-016 D6), otherwise `/cases`. It fails to `/cases`, because a count that
could not be fetched is not evidence of an empty account. The decision is made
HERE, at sign-in — not inside the list page, where it could not tell "no cases"
from "paged past the end" or "just cleared a filter".

## LoginPage (`/login`; `/signin` redirects here)

Standalone: passwordless username form. Cloud: hands off to the
backend-advertised hosted-login URL (`oauth.hosted_login_url` from
`/auth/config`), forwarding the ProtectedRoute-saved destination as `return_to`.

**Two controls, because the hosted login opens on sign-in.** `Sign In` passes no
`screen_hint`, so a returning user's request is byte-identical to what it was
before the parameter existed; **`Create an account`** passes `sign-up` (core
contract 6.1.0) and is rendered ONLY when `/auth/config` advertises **both**
`oauth.supports_screen_hint` AND `oauth.self_service_signup_enabled` (core
6.2.0). Two facts, deliberately separate: the first is MECHANICS (does the URL
forward the hint), the second is POLICY (can a person with no account finish).
With sign-up off an org-less identity reaches the sign-up screen, completes it,
and is refused at the callback — so gating on the hint alone is a dead end one
step further down. `/signup` gates on the same pair and falls to `/login`
otherwise.

- ‼ **Gate on the advertised capability, never on a version**: an API without
  the parameter ACCEPTS it, DROPS it and serves the sign-in screen, so the
  control renders, looks right and does nothing, and no test on either side
  notices. Absent reads as NO (`=== true`), not as unknown-therefore-fine.
- ‼ These two live on `/auth/config`, not in `useCapabilities` /
  `GET /meta/capabilities`, and that is deliberate: they qualify
  `oauth.hosted_login_url`, which is served from the same object by the same
  handler, and detection already fetches it to decide which login variant to
  render. Splitting a URL from the statement of what it supports is how the
  two drift. The absent-reads-as-no convention is shared with `useCapabilities`
  (`features?.x === true`) — if that rule ever changes, it must change in both.
- ⛔ Do not add a hint to the Sign In path: it would silently change every
  existing sign-in.
- Cloud only — standalone is single-user with a passwordless username form and
  has nothing to sign up for. This is NOT made redundant by `/signup`: that
  route serves the marketing site's deep link, and does nothing for the people
  who arrive *here* — from the site header, a ProtectedRoute redirect on an
  expired session, or a bookmark.
- Under the buttons the cloud branch states **what a Cloud account is** —
  FaultMaven run for you, on the same engine as the self-hosted version, free
  while in beta with a daily limit on investigation turns — because the hosted
  sign-up screen after it is configured in the IdP, not in this repo, so this
  screen is the last place the product can set that expectation. No trial or
  upgrade wording, and no data-handling claim (none is made, so no privacy link
  is owed). Beside it, a line saying the engine is fair source and can be
  self-hosted, linking the marketing site's `/self-host` page (`SELF_HOST_URL`
  in `src/lib/community.ts`). Plan terms are compared on the site's pricing
  page, not here.
- The **cloud branch only** offers the two paths that need no account — the
  community workspace and the published investigation transcript. The
  standalone screen carries neither.

## SignUpPage (`/signup`)

Public, cloud-only in effect. A redirect shim that hands off to the
backend-advertised hosted login with `screen_hint=sign-up` (core contract 6.1.0),
so a first-time visitor arriving from the marketing site lands on the sign-up
screen rather than a sign-in form for an account they do not have
(faultmaven-website#42).

- It renders no form and asks nothing — that absence IS the invariant, so a
  credential field here would defeat the route while every redirect assertion
  still passed.
- Uses `window.location.replace`, not `assign`: a waypoint left in history
  makes Back re-fire the effect and bounce the visitor straight back to the IdP.
- An **already-signed-in** caller goes to `/cases` instead — the site's call to
  action is in its header on every page, so returning customers click it too,
  and a sign-up screen would invite them to make a second account.
- Everything else (standalone, cloud advertising no IdP, unreachable config)
  falls to `/login`, which owns the standalone form, the honest no-IdP error and
  the retry card with its Local Network Access diagnosis; that is written as
  ONE condition rather than a branch per state, so a future `ConfigStatus`
  member cannot fall through to an indefinite spinner.
- ‼ The effect and the render key on the same resolved `canHandOff`: they once
  disagreed, and an unreachable config with a stale `loginUrl` rendered "go to
  /login" while navigating to the IdP.

## SSOCallbackPage (`/auth/sso/callback`)

Cloud hosted-login return leg; public — it IS the login. The backend redirects
here with a single-use completion `code` (+ optional same-origin `return_to`) or
a sanitized `error` slug; the page POSTs `{code}` to
`/api/v1/auth/sso/exchange`, stores the standard token response exactly like a
LoginPage sign-in, and forwards to the explicit `return_to` when one was
carried, otherwise to `resolvePostSignInLanding()` — the same landing a
LoginPage sign-in gets. Error slugs map to friendly messages with a "Back to
sign in" link; raw query content is never echoed. The handled slugs are a
cross-repo contract that `openapi.json` does not carry; `pnpm check:sso-slugs`
(CI job `sso-slug-drift`) compares them against the `ERROR_*` constants in the
core repo's `sso_login_service.py` **on `main`** — not the pinned contract ref,
unlike `generate:api-types`.

## Route guards

The guards are components: `src/components/ProtectedRoute.tsx` (signed in),
`AdminProtectedRoute.tsx` (`/admin/users`) and `GatedRoute.tsx`, which takes a
predicate from `src/lib/access.ts`. `src/App.tsx` defines the per-route
wrappers that compose them: `LLMConfigRoute` (`canManageLlmConfig`,
`/settings/llm`), `ManagementConsoleRoute` (`canManageConsole`,
`/admin/organization`), `TeamsRoute` (`canUseTeams`, `/teams`,
capability-gated, no role), `AllCasesRoute` (`canViewAllCases`,
`/admin/cases*`) and `ChatSurfaceRoute` (`/investigate`, on the chat-surface
preference). The nav (`src/hooks/useNavigationItems.ts`, rendered by
`PageHeader`) uses the same predicates, so a link and its route cannot
disagree.
