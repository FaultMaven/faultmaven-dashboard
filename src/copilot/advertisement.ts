/**
 * The panel advertisement — this page's half of a cross-repo contract.
 *
 * The extension yields its side panel only on a Dashboard tab whose page
 * ADVERTISES that it hosts the built-in panel, not on origin alone (ADR-016 D4).
 * Deployments lag: a self-hosted image from before this build has no panel to
 * yield to, and yielding on origin would remove the working "case detail beside
 * the side panel" workflow with nothing in its place.
 *
 * WHY THESE ARE DECLARED HERE rather than imported from the package, which is
 * where the one definition lives.
 *
 * The values are needed on every page load — the attribute goes in the initial
 * HTML, and the predicate answers before anything is signed in — so importing
 * them puts `@faultmaven/copilot-ui` in the EAGER module graph. Measured, not
 * assumed: doing so moved the package's host-store, transport and persistence
 * internals into the entry chunk (+200 kB), where every visitor to `/login`
 * downloads and evaluates them. ADR-016 D3 says the panel must have no code
 * path before sign-in, and `panelNotBeforeSignIn.test.tsx` asserts it.
 *
 * So the drift the shared definition exists to prevent is caught by a TEST
 * instead: `advertisement.test.ts` imports the real package and asserts these
 * three agree with it, name for name and case for case. A test can import
 * freely; the shipped bundle cannot.
 */

/** Attribute the initial HTML carries on `<html>`. Mirrors `DASHBOARD_PANEL_ATTR`. */
export const DASHBOARD_PANEL_ATTR = 'data-faultmaven-dashboard-panel';

/** `type` of the window message posted once the panel has mounted. */
export const DASHBOARD_PANEL_MESSAGE = 'FM_DASHBOARD_PANEL_AVAILABLE';

/**
 * Does this document advertise a built-in panel?
 *
 * Exact-match on the three falsy values, matching the package byte for byte:
 * `""`, `"false"` and `"0"` are PRESENT and do not advertise, so a build
 * without the panel ships the same markup with the flag off. Deliberately not
 * trimmed or lower-cased — the extension implements the same comparison, and a
 * predicate that accepted more than the other side's would have this page
 * advertising to a panel that never stood down.
 */
export function dashboardAdvertisesPanel(doc: Document = document): boolean {
  try {
    const value = doc.documentElement.getAttribute(DASHBOARD_PANEL_ATTR);
    if (value === null) return false;
    return value !== '' && value !== 'false' && value !== '0';
  } catch {
    // No DOM / non-page context — nothing is advertising.
    return false;
  }
}

/**
 * Post the "this build renders the panel" message, once the panel is mounted.
 *
 * Targeted at `window.location.origin` rather than `'*'`: the message says
 * something about THIS deployment, and a wildcard would hand it to any frame
 * that embeds the Dashboard. The extension validates the origin twice, so the
 * page needs no secret and must not invent one.
 */
export function announcePanelAvailable(win: Window = window): void {
  win.postMessage({ type: DASHBOARD_PANEL_MESSAGE }, win.location.origin);
}
