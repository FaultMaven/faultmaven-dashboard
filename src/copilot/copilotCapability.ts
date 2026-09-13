/**
 * What the INSTALLED Copilot extension can understand.
 *
 * The Dashboard deploys in minutes; the extension goes through Chrome Web Store
 * review, which takes days and is not schedulable. So any message the Dashboard
 * starts sending will, for a while, reach installs that have never heard of it
 * — and for `FM_DASHBOARD_PANEL_WITHDRAWN` that is not a harmless no-op:
 *
 *   1. the Dashboard asserts, and ANY extension yields its side panel;
 *   2. the panel stops showing, so the Dashboard withdraws;
 *   3. an extension without faultmaven-copilot#257 has no listener for that
 *      string, so the tab stays `enabled: false`;
 *   4. extension panel hidden, Dashboard showing none — NEITHER SURFACE.
 *
 * Measured against the pre-#257 build, not inferred. It self-heals only by
 * navigating off the origin: that extension's reconcile deliberately never
 * releases a Dashboard tab, so a reload does not help.
 *
 * THE FIX IS TO NOT CREATE STEP 1. Rather than hold the Dashboard release until
 * the store catches up, it asks what is installed and declines to assert to an
 * extension that could not take it back. That install keeps exactly the
 * behaviour it has today — its side panel beside the Dashboard's own dock, two
 * panels, which is the MILD failure this whole module prefers at every branch.
 *
 * WHY A PUBLISHED ATTRIBUTE AND NOT A NEGOTIATION HANDSHAKE. A request/response
 * probe would prove a capability rather than take the extension's word for it,
 * and it needs a timeout — in which an absent reply is indistinguishable from an
 * absent extension. The attribute is synchronous, already on the page, and
 * answers the same question (ADR-019 D6).
 *
 * WHY THE VERSION SURVIVES AT ALL. The capability attribute is itself new, so it
 * is missing from exactly the builds it exists to identify. The floor below is
 * the fallback for those — ONE transitional rule with a stated deletion
 * condition, not one constant per feature (ADR-019 D3). An earlier version of
 * this comment argued the opposite, that a version was the only question
 * answerable today; capabilities answer it better for every build that has them,
 * and the floor is what carries the ones that do not.
 */

/**
 * Set on `<html>` by the extension's auth bridge, valued with its version.
 *
 * EXPORTED, because this and the event below are a cross-repo contract and were
 * already spelled out a second time in `CopilotEntry`. Two copies of a name the
 * other repository owns can drift while both sides stay green — the install CTA
 * would keep working while the withdrawal gate silently stopped, or the reverse.
 */
export const COPILOT_PRESENCE_ATTR = 'data-faultmaven-copilot';

/**
 * Dispatched by the auth bridge once it has stamped the attribute.
 *
 * The event carries no detail — `CustomEvent.detail` can be dropped crossing
 * the content-script → page world boundary, so the VERSION is read back off the
 * attribute and this only says "look again".
 */
export const COPILOT_READY_EVENT = 'faultmaven-copilot:ready';

/**
 * How long to wait before re-reading the attribute anyway.
 *
 * The same 800ms `CopilotEntry` has always used for this signal. The event is
 * the fast path; this is the one that catches a bridge that injected late or a
 * dispatch this context never saw.
 */
export const COPILOT_PRESENCE_RECHECK_MS = 800;

/**
 * The capability attribute and the one token this module gates on — BOTH FROM
 * THE PACKAGE now that faultmaven-copilot#260 has shipped them.
 *
 * They were spelled out here while the Dashboard side landed first, with a note
 * to move them the moment the extension defined them. This is that move. A
 * literal in each repository can drift while both stay green — a rename
 * upstream would have left this repo silently refusing every build, with
 * nothing red on either side.
 *
 * Re-exported rather than merely imported, the way `advertisement.ts` re-exports
 * the panel names, so `copilotCapability` stays this app's single door to the
 * handshake and callers never reach past it.
 */
import {
  CAPABILITY_PANEL_WITHDRAW,
  COPILOT_CAPABILITIES_ATTR,
  copilotCapabilities,
  type CopilotCapability,
} from '@faultmaven/copilot-ui/contract';

export { CAPABILITY_PANEL_WITHDRAW, COPILOT_CAPABILITIES_ATTR };

/**
 * The branded token type, carried through the same door.
 *
 * Upstream added it in the commit that shipped the names, to stop a
 * hand-written `'panel-withdrawal'` compiling into something that claims a
 * capability. Without it re-exported here a caller that wants a typed token has
 * no legal route: reaching the subpath directly is what the boundary test
 * forbids, so the door has to carry the type or the type is unusable.
 */
export type { CopilotCapability };

/**
 * What the installed build says it can do, or `null` where it has not said.
 *
 * DELEGATES to the package's reader. The names were never the subtle part —
 * the READING RULE is, and this repo had its own copy of it: absent vs empty vs
 * token, and how the list is split. Two implementations of that rule are two
 * chances to disagree, and a disagreement is invisible from both sides (one
 * degrades forever while every test stays green). `dashboardAdvertisesPanel`
 * lives in the contract for exactly this reason; so does this now.
 *
 * `null` and `[]` remain DIFFERENT answers and the package keeps them apart:
 * the first is a build from before capabilities, where the version floor is the
 * only evidence available; the second is a build that told us it can do none of
 * the things we asked about, which is authoritative and must not be overridden
 * by a version that happens to be high enough.
 *
 * Kept as a named wrapper rather than re-exporting `copilotCapabilities`
 * directly, for the naming alone: every reader in this app asks "what is
 * INSTALLED", and the package's own name does not say that. The `doc` parameter
 * is passed through for parity with `installedCopilotVersion` — no call site
 * uses it today, and an earlier version of this comment claimed the tests did,
 * which was simply untrue.
 */
export function installedCopilotCapabilities(doc?: Document): readonly string[] | null {
  return copilotCapabilities(doc);
}

/**
 * The first Copilot release that understands `FM_DASHBOARD_PANEL_WITHDRAWN`.
 *
 * Both the pre-#257 and post-#257 builds report `1.0.3` — the version is bumped
 * at RELEASE, not in the PR — so the store upload carrying #257 is necessarily
 * `1.0.4` or later. That makes `>= 1.0.4` the honest threshold; a `> 1.0.3`
 * spelled the other way round says the same thing less clearly.
 *
 * DELETE THIS, and everything that reads it, once no install below this version
 * is plausibly in the field. It is a migration aid with a finite life, not a
 * permanent part of the contract.
 */
export const COPILOT_WITHDRAWAL_MIN_VERSION = '1.0.4';

/** The installed extension's version, or null where none has announced itself. */
export function installedCopilotVersion(doc?: Document): string | null {
  // The DEFAULT IS READ INSIDE THE TRY. `doc: Document = document` evaluates in
  // parameter scope, outside the body, so an environment with no `document`
  // throws a ReferenceError this catch never sees — and because these readers
  // are the `getSnapshot` of a `useSyncExternalStore`, that surfaces as a render
  // crash rather than the degrade ADR-019 D1 requires.
  try {
    return (doc ?? document).documentElement.getAttribute(COPILOT_PRESENCE_ATTR);
  } catch {
    return null;
  }
}

/**
 * Numeric-segment comparison, not `localeCompare`.
 *
 * `'1.0.10' < '1.0.4'` under string ordering, which would silently withhold the
 * assertion from a newer extension forever. Missing segments read as 0 so
 * `'1.1'` and `'1.1.0'` agree, and a non-numeric segment reads as 0 rather than
 * NaN — a version this cannot parse must not decide the comparison by accident.
 */
function compareVersions(a: string, b: string): number {
  const pa = a.split('.');
  const pb = b.split('.');
  for (let i = 0; i < Math.max(pa.length, pb.length); i += 1) {
    const na = Number.parseInt(pa[i] ?? '0', 10) || 0;
    const nb = Number.parseInt(pb[i] ?? '0', 10) || 0;
    if (na !== nb) return na - nb;
  }
  return 0;
}

/**
 * May the Dashboard assert that it is showing a panel?
 *
 * ABSENT (`null`) MEANS YES. No announced extension is either no extension at
 * all, or one whose content script never registered for this origin (host
 * permission is optional and commonly ungranted on a self-hosted Dashboard). In
 * both cases nothing is listening, so the assertion reaches no one and can
 * strand no one — and refusing there would withhold the behaviour from every
 * user who installs the extension later in the same page's life.
 *
 * EMPTY (`''`) MEANS NO, and the difference matters. An empty attribute is an
 * extension that IS present and told us nothing useful — `hasAttribute` is how
 * the install CTA detects one, and the bridge passes the manifest version
 * straight through with no validation. Reading that as "nobody is listening"
 * and asserting is exactly the path to a dark tab: a pre-#257 install would
 * yield and never hear the retraction.
 *
 * Likewise a version this cannot parse. "We could not tell" must resolve to the
 * branch that cannot produce a dark tab; only "there is demonstrably nobody
 * there" resolves the other way.
 */
export function copilotAcceptsWithdrawal(
  version: string | null = installedCopilotVersion(),
  capabilities: readonly string[] | null = installedCopilotCapabilities(),
): boolean {
  // CAPABILITIES FIRST, which is the order ADR-019 D3 states and not a
  // preference among equals: the attribute is AUTHORITATIVE IN BOTH DIRECTIONS.
  // A build listing the token is trusted whatever its number says — the dev-build
  // case the floor got wrong — and one omitting it is refused however new it is.
  // A version-first check would let a high number override an explicit "I cannot
  // do this", which is the dark tab.
  //
  // ⚠️ NOT because a half-written marker could be caught mid-update. An earlier
  // version of this comment argued that, and it was wrong: the bridge stamps
  // both attributes in one synchronous task and the isolated world shares this
  // page's event loop, so no read here can land between the two writes. The
  // reachable state is that NEITHER attribute is set yet (the bridge runs at
  // `document_end`) — which this function already handles as "nobody is
  // listening", and which the readiness event and the re-check below cover.
  if (capabilities !== null) return capabilities.includes(CAPABILITY_PANEL_WITHDRAW);

  // Nothing said anything: no extension, or a content script that never
  // registered. Nobody is listening, so the assertion can strand no one.
  if (version === null) return true;

  if (version.trim() === '') return false;
  return compareVersions(version, COPILOT_WITHDRAWAL_MIN_VERSION) >= 0;
}
