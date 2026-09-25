---
paths:
  - "src/copilot/**"
  - "src/lib/copilot/**"
  - "src/hooks/useChatSurface.ts"
  - "src/hooks/useCopilotPresence.ts"
  - "src/components/CopilotEntry.tsx"
  - "src/components/AccountMenu.tsx"
  - "src/components/CasePanelMount.tsx"
  - "src/components/ConversationDock.tsx"
  - "src/test/copilot/**"
  - "src/test/lib/chatSurfacePreference.test.ts"
  - "src/test/components/CopilotEntry.test.tsx"
  - "src/test/components/AccountMenu.test.tsx"
  - "index.html"
  - "tailwind.config.cjs"
  - "src/index.css"
  - "package.json"
  - "scripts/check-copilot-ui-pin.mjs"
  - "scripts/check-web-bundle-boundary.mjs"
  - "scripts/check-shared-ui-styles.mjs"
---

# The Copilot UI package and its web host

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
- **`/contract` and `/turn-label` are the code exceptions, each through ONE
  door per subject.** They carry the cross-repo names both repositories must
  agree on, and they are cheap (constants and two DOM readers, no panel).
  `advertisement.ts` owns the panel attribute and window messages;
  `copilotCapability.ts` owns the capability attribute, its tokens and its
  reader; `lib/cases/turnLabel.ts` the TURN LABELS — which number a surface
  prints, versus the message clock it addresses a turn with. Nothing else may
  reach either subpath, and no door may pull another's names — routing
  capabilities through `advertisement.ts` would make the capability GATE depend
  on the module it gates. The file list, the per-file name sets and the
  per-subpath door list are all asserted.

  Both exempt modules must stay **import-free**, and that is the whole basis of
  the exemption: the entry costs +200 kB in the signed-out chunk (ADR-016 D3)
  while these cost ~196 bytes. The boundary test walks one hop — a door may
  re-export the package's zero-dependency state modules and nothing else.
- **The one runtime import OF THE ENTRY is dynamic**, in
  `CopilotPanelMount.tsx`. That is what keeps the shared UI out of the entry
  chunk so nothing of it is fetched before sign-in. The exempt subpaths above
  are static and cheap by construction; the rule is about the entry.
  `src/test/copilot/packageImportBoundary.test.ts` enforces all of these.
- **The theme ships with it** as a Tailwind preset, consumed in
  `tailwind.config.cjs`; `src/index.css` imports the package's `globals.css`.
  ADR-003 is one design system — the two configs had already drifted silently.
  ⚠️ `content` is the ONE key Tailwind does not merge across presets: a config's
  array REPLACES the preset's, and the package is a pnpm symlink. Get either
  wrong and every `fm-*` class the shared UI uses is purged — no error, no
  warning, a panel rendered unstyled. `pnpm check:shared-ui-styles` (run in the
  CI `lint` job after `pnpm build`) is what makes that loud.
- **Adopting a change is moving the SHA** in `package.json` and re-running
  `pnpm install`. `pnpm check:copilot-pin` (CI job `copilot-ui-pin`) FAILS on
  pin shape, on a pin that is not on the copilot repo's `main`, and on the two
  repositories' `api-contract.pin.json` disagreeing. Staleness — the package
  having moved on — is an ADVISORY note only: copilot's main moves on its own,
  so failing on it would redden every open PR here and forbid developing the
  two repositories together. Whether this job is *required* depends on the
  ruleset applied to `main`; it is not required by default.
- **`pnpm check:web-boundary`** and **`pnpm check:shared-ui-styles`** run in the
  CI `lint` job after a build (that job already installs, and `build`/`smoke`
  already build the image twice — a further full build to ask two questions
  about `dist/` is CI time for nothing). The first asserts no Copilot sign-in
  reached the shipped bundle (ADR-016 D3); the second that the shared UI's
  `fm-*` classes are in the stylesheet at all.
- **The Dashboard mounts the panel with `chrome: 'embedded'`**, stated once in
  `CopilotPanelMount` (`DASHBOARD_CHROME`) rather than at each call site. The
  panel's own sidebar carries a case list, an account row and an "Open
  Dashboard" button — all three of which this app already renders around it,
  and the last of which links to the page the user is already on.
- **Two tests render the REAL package**, `realPanelMounts.test.tsx` and
  `embeddedChrome.test.tsx`. Every other test here mocks
  `@faultmaven/copilot-ui`, which is right for asserting the wiring and
  structurally blind to a package/host MISMATCH — a mocked package has no
  dependencies, so the whole suite stayed green while the panel crashed on
  every mount for want of a React context this app did not install. Keep them
  rendering the real thing.
- **State that lives outside React** — a DOM attribute another world writes,
  or a module-level store — is read with `useSyncExternalStore` over a
  subscription (`copilotCapability.ts`, `chatSurfacePreference.ts`,
  `useCopilotPresence.ts`), never with `useState` plus a one-shot re-check: a
  signal that starts LATER (a host-permission grant on an already-open tab,
  #144) is missed by any timer.

## Where chat lives: the preference (ADR-018 D3)

`src/lib/copilot/chatSurfacePreference.ts` + `src/hooks/useChatSurface.ts`. One
boolean, stored through `authLocalStore` under `prefersCopilotExtensionForChat`
(the adapter prefixes `STORAGE_KEY_PREFIX`, so the physical key is
`faultmaven_prefersCopilotExtensionForChat`), per **browser profile** — because
the thing it selects between is itself per-profile: an extension is installed in
a browser, not in an account. A server-side preference would follow someone to a
machine where the extension does not exist and silently remove their only chat
surface. The cost is that support cannot read it.

- **Defaults OFF, and the default is load-bearing.** Off means the Dashboard
  hosts chat — the only correct answer for someone who has never installed
  anything, and for the population that can never have a side panel at all
  (Firefox, managed browsers, self-hosted). An absent key, a blocked
  `localStorage` or a value of the wrong type all mean off; only an explicit
  `true` moves chat.
- **NEVER set by detection — but detection OFFERS.** `CopilotEntry` in the
  header has three states: not installed → the store CTA; installed with chat
  still here → **"Move chat to Copilot"**, one click, which is the "at that
  moment" ADR-018 D3 means; installed with chat there → a plain statement, no
  control. Applying on detection would strand three real people, because the
  Dashboard can see "installed" and not "side panel open": someone whose panel
  is merely closed, a **Firefox** user (MV2 has no `browser.sidePanel` at all,
  so there is no panel to move chat INTO), and a self-hosted user without host
  permission — where the content script never registers, so this component
  cannot see the extension in the first place.
- The toggle also lives in the **account menu**, reachable from every page, and
  that is not redundant with the offer: on a self-hosted origin without a
  host-permission grant the Dashboard never learns the extension exists, so the
  offer never appears for exactly the people most likely to want it.
- **Because the menu does not gate on detection, it NAMES THE PREREQUISITE.**
  It is the one place chat can move to the extension without the extension
  ever having been seen, so someone can switch to a side panel they never
  installed and be left with no chat surface at all. A note under the toggle
  says what the switch needs and links the published listing
  (`COPILOT_STORE_URL` in `src/copilot/storeListing.ts` — the same constant the
  header CTA uses, and the only store URL the source may contain). It renders
  in BOTH preference states: the person it rescues has usually already flipped
  it, found nothing, and come back.
- **The note's two branches are not symmetric, because detection is
  one-directional.** Announcing PROVES installed, so that branch states it as a
  fact — plain text, no link. Silence proves nothing (no host permission → no
  content script), so the other branch says what the switch NEEDS rather than
  what the user lacks, and is the one that gets the callout treatment. Presence
  comes from `useCopilotPresence`, shared with `CopilotEntry` so the header
  cannot offer to move chat to an extension the menu beside it is telling you
  to install.
- **A module store, not React context.** `resolvePostSignInLanding()` runs
  during sign-in, before the app shell exists, and the in-tree readers are
  scattered across the nav, the case page and the account menu. A provider would
  reach the second group and not the first.
- What it removes: the dock, the `New Case` nav item, the `/investigate` route
  (guarded by `ChatSurfaceRoute` in `App.tsx`, because a bookmark would
  otherwise mount a second composer), the case list's CTAs, and the first-run
  landing. What it never removes: the Transcript tab.

## Compatibility with the extension (ADR-019)

The Dashboard deploys in minutes; the extension waits on Chrome Web Store
review. So the field always holds Dashboards newer than the extensions talking
to them, and three rules follow:

- **The Dashboard DEGRADES, never requires.** No feature may hard-require the
  extension or a version of it. A missing capability means "behave as though
  nothing is installed" — a supported, tested state, not an error path.
- **CAPABILITIES beat the version.** `data-faultmaven-copilot-capabilities` is
  authoritative in BOTH directions when present: a build listing
  `panel-withdraw` is trusted whatever its number says, and one omitting it is
  refused however new it is. `COPILOT_WITHDRAWAL_MIN_VERSION` is the fallback
  for builds from before capabilities — **one** transitional rule, not one per
  feature. A version is a proxy for a capability and the proxy is wrong for
  exactly the builds developers run: an unpacked build with the listener still
  reports its manifest version.
- **`null` and `[]` are different answers.** No attribute means "it never said",
  so the version decides; an empty list means "it said it can do none of these",
  which is authoritative.

Both the names and the READING RULE (`copilotCapabilities()`) live in
`@faultmaven/copilot-ui/contract`, reached through `copilotCapability.ts` — this
repo spells neither. The names were never the subtle part;
absent-vs-empty-vs-token is, and two copies of that rule can disagree while
every test on both sides stays green.

## Why two chat UIs cannot normally co-exist — and the three cases where they can

It is the D0 YIELD that prevents the double, not the preference. With chat here,
the Dashboard asserts while its panel is showing and the extension hides its own
side panel on that tab (measured: `setOptions({enabled:false})` on dock open,
`enabled:true` on collapse). Exactly one chat UI per tab.

Three gaps, and none is fixable by gating the preference on detection:

| Gap | Effect | Fix |
|---|---|---|
| Extension that cannot withdraw | the Dashboard declines to assert, so it never yields → two panels. The header's **"Move chat to Copilot"** offer is the one-click cure: with the preference on the Dashboard renders no panel, so the two collapse to one (ADR-019 D4) | ends with the store release |
| Self-hosted **without host permission** | the extension's `auth-bridge-registration.ts` silently unregisters, so the assertion is never relayed AND the extension is undetectable here | extension-side: prompt for the permission on a configured Dashboard origin (faultmaven-copilot#258) |
| Two Dashboard tabs | one chat UI each; the server holds one ordered transcript | none needed — there is no live sync between surfaces, so a second view refetches on reload or case switch |

## The panel advertisement

`src/copilot/advertisement.ts` holds a cross-repo contract, and since ADR-018 D0
(row 5) the claim is **live** rather than a property of the build:

| Signal | Means | Yields? |
|---|---|---|
| `data-faultmaven-dashboard-panel` in `index.html` | this BUILD could host a panel | **no** |
| `FM_DASHBOARD_PANEL_AVAILABLE` | a panel is showing **on this tab, for this user, on this route** | yes |
| `FM_DASHBOARD_PANEL_WITHDRAWN` | …not any more | releases |

`usePanelAdvertisement(showing)` owns the lifecycle. **SHOWING means visible,
not mounted**: the dock keeps its panel mounted while collapsed so an in-flight
turn survives, and the live Transcript arm stays mounted behind another tab for
the same reason — in both states the extension's panel should come back, so each
host passes what it knows (`visible={open}`, `visible={activeTab === 'transcript'}`).

It also re-asserts on **`pageshow`**, unconditionally. The extension releases a
tab whose document is being replaced, and `tabs.onUpdated` reports
`status: 'loading'` for a bfcache back/forward that creates no new document —
React does not re-run there, so without this the tab is released and never
yields again for that document's life. Not gated on `event.persisted`: the yield
is idempotent, so the duplicate on an ordinary load costs one message, while
depending on a property happy-dom drops entirely would trade that for a silent
failure.

⚠️ **AN OLD EXTENSION MUST NEVER BE ASSERTED TO.** One predating
faultmaven-copilot#257 ignores the withdrawal and leaves the tab yielded —
measured: the Dashboard stood down and the extension's panel stayed hidden, so
the tab had **neither surface**. So the Dashboard does not create that state:

- `src/copilot/copilotCapability.ts` gates the ASSERTION on the installed
  extension's version, read from `data-faultmaven-copilot` (which every
  extension has always stamped). `null` — nobody announced — allows it, because
  nothing is listening. `''` or an unparseable version REFUSES: an attribute
  that is present but useless means an extension IS there.
- **`index.html` ships with the flag DOWN** (`="0"`). An old extension yields on
  that attribute at document_end, entirely independently — gating the message
  alone still produced a yield in a real browser. Both paths had to close.

Verified both arms: an old build (1.0.3) produces **zero** side-panel writes
across the whole flow; a new one (1.0.4) does the full yield/release round trip.

**To end the migration: delete `COPILOT_WITHDRAWAL_MIN_VERSION`, flip the
attribute back to `"1"`, and move the two assertions in
`src/test/copilot/indexHtmlAdvertisement.test.ts`** once no install below 1.0.4
is plausibly in the field. That suite pins the value deliberately, so flipping
the character alone turns the build red.
