/**
 * The panel advertisement — the Dashboard's half of a cross-repo contract.
 *
 * The extension yields its side panel only on a Dashboard tab whose page
 * ADVERTISES that it hosts the built-in panel, not on origin alone (ADR-016 D4,
 * amended 2026-09-03). Deployments lag: a self-hosted image from before this
 * build, or the Cloud Dashboard between the extension's release and its own,
 * has no panel to yield to, and yielding on origin would remove the working
 * "case detail beside the side panel" workflow with nothing in its place.
 *
 * Settled in faultmaven-copilot#231; documented on the extension side beside
 * the existing presence marker in `src/lib/auth/presence-marker.ts`:
 *
 *   | Attribute on <html>  | data-faultmaven-dashboard-panel      |
 *   | Window message type  | FM_DASHBOARD_PANEL_AVAILABLE         |
 *
 * Semantics: a claim by the page, per document load, that THIS BUILD renders
 * the Copilot panel itself. Not a claim about account, route, or what is on
 * screen. Opt-in; silence means the extension keeps its panel.
 *
 * Two signals, because they answer at different times:
 *
 *  - The ATTRIBUTE is the per-load state and lives in the INITIAL HTML, so a
 *    content script at `document_start` can read it before React exists. It is
 *    rendered unconditionally and FLIPPED by value, which is why `""`,
 *    `"false"` and `"0"` do not advertise: a build without the panel ships the
 *    same markup with a falsy value rather than a different index.html.
 *  - The MESSAGE is the channel for a page that only mounts its panel after
 *    hydration. It carries no payload and is posted to this window at this
 *    origin; the extension validates the origin twice (content script, and the
 *    browser-stamped sender origin in the background), so the page needs no
 *    secret and must not invent one.
 */

/** Attribute the initial HTML carries on `<html>`. */
export const PANEL_ADVERTISEMENT_ATTRIBUTE = 'data-faultmaven-dashboard-panel';

/** `type` of the window message posted once the panel has mounted. */
export const PANEL_AVAILABLE_MESSAGE_TYPE = 'FM_DASHBOARD_PANEL_AVAILABLE';

/**
 * Values that are PRESENT but do not advertise.
 *
 * The contract names these three explicitly. Absence does not advertise
 * either, but that is `hasAttribute` — this list is about a build that ships
 * the attribute and means "no".
 */
const NON_ADVERTISING_VALUES = new Set(['', 'false', '0']);

/**
 * Does this document advertise a built-in panel?
 *
 * Exported and tested here rather than inlined at the one call site because it
 * is the CONTRACT: the extension implements the same predicate against the same
 * three falsy values, and a Dashboard that disagreed about them would either
 * hide a working panel or yield to one that is not there.
 */
export function advertisesBuiltInPanel(doc: Document): boolean {
  const value = doc.documentElement.getAttribute(PANEL_ADVERTISEMENT_ATTRIBUTE);
  if (value === null) return false;
  return !NON_ADVERTISING_VALUES.has(value.trim().toLowerCase());
}

/**
 * Post the "this build renders the panel" message, once the panel is mounted.
 *
 * Targeted at `window.location.origin` rather than `'*'`: the message says
 * something about THIS deployment, and a wildcard target would hand it to any
 * frame that embeds the Dashboard.
 *
 * Deliberately unconditional on the attribute. The two signals answer for
 * themselves — a page that mounted the panel has mounted it whatever its markup
 * claims — and making the message depend on the attribute would turn one
 * mis-set build-time value into silence on both channels.
 */
export function announcePanelAvailable(win: Window = window): void {
  win.postMessage({ type: PANEL_AVAILABLE_MESSAGE_TYPE }, win.location.origin);
}

/**
 * Whether this document has already announced. A document load is a fresh
 * module in a real page; a test suite is not, hence the reset seam below.
 */
let announced = false;

/**
 * Announce, at most once per document load.
 *
 * The claim is about the BUILD, so repeating it on every route change would
 * say nothing new — and the extension treats the first one as the answer.
 */
export function announcePanelAvailableOnce(win: Window = window): void {
  if (announced) return;
  announced = true;
  announcePanelAvailable(win);
}

/** Test seam: forget that this document already announced. */
export function resetPanelAnnouncementForTests(): void {
  announced = false;
}
