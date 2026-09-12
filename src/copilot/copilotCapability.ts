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
 * WHY A VERSION AND NOT A CAPABILITY HANDSHAKE. A capability signal would have
 * to be added to the extension, which is the side that lags — the new signal
 * would be missing from exactly the installs it exists to identify. The version
 * attribute is already in the field on every install that has ever shipped, so
 * it is the one question answerable today.
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
export function installedCopilotVersion(doc: Document = document): string | null {
  try {
    return doc.documentElement.getAttribute(COPILOT_PRESENCE_ATTR);
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
export function copilotAcceptsWithdrawal(version: string | null = installedCopilotVersion()): boolean {
  if (version === null) return true;
  if (version.trim() === '') return false;
  return compareVersions(version, COPILOT_WITHDRAWAL_MIN_VERSION) >= 0;
}
