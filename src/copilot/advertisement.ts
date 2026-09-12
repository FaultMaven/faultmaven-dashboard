/**
 * The panel advertisement — this page's half of a cross-repo contract.
 *
 * The extension yields its side panel only on a Dashboard tab whose page
 * ADVERTISES that it hosts the built-in panel, not on origin alone (ADR-016 D4).
 * Deployments lag: a self-hosted image from before this build has no panel to
 * yield to, and yielding on origin would remove the working "case detail beside
 * the side panel" workflow with nothing in its place.
 *
 * ONE DEFINITION, imported from `@faultmaven/copilot-ui/contract`.
 *
 * That subpath exists because of what happened when these were imported from
 * the package ENTRY: the attribute and the predicate are needed on every page
 * load, so the entry came with them, and the package's host store, transport
 * and persistence internals landed in the Dashboard's own entry chunk — about
 * 200 kB that every signed-out visitor to `/login` downloads and evaluates,
 * which is exactly what ADR-016 D3 forbids. `contract.ts` imports nothing, so
 * it costs a few hundred bytes and carries no graph behind it.
 *
 * Re-exported here rather than imported directly at each call site, so this
 * module stays the one place the Dashboard talks about the advertisement.
 */
import {
  DASHBOARD_PANEL_ATTR,
  DASHBOARD_PANEL_MESSAGE,
  DASHBOARD_PANEL_WITHDRAWN_MESSAGE,
  dashboardAdvertisesPanel,
} from '@faultmaven/copilot-ui/contract';

export {
  DASHBOARD_PANEL_ATTR,
  DASHBOARD_PANEL_MESSAGE,
  DASHBOARD_PANEL_WITHDRAWN_MESSAGE,
  dashboardAdvertisesPanel,
};

/**
 * Post the "this build renders the panel" message, once the panel is mounted.
 *
 * WHEN to announce is the only part of this contract that is genuinely the
 * host's: the package cannot know when a page has finished mounting its panel.
 *
 * Targeted at `window.location.origin` rather than `'*'`: the message says
 * something about THIS deployment, and a wildcard would hand it to any frame
 * that embeds the Dashboard. The extension validates the origin twice — content
 * script, and the browser-stamped sender origin in the background — so the page
 * needs no secret and must not invent one.
 */
export function announcePanelAvailable(win: Window = window): void {
  win.postMessage({ type: DASHBOARD_PANEL_MESSAGE }, win.location.origin);
}

/**
 * Post the retraction: this page is no longer showing a built-in panel.
 *
 * THE HALF THAT MAKES THE CLAIM HONEST (ADR-018 D0). Until the extension
 * learned to release a tab, the advertisement was monotonic — a page could say
 * "I host a panel" and never "not any more" — so a user who turned the built-in
 * panel off on an already-yielded tab was left with NEITHER surface, and the
 * only way back was navigating off the origin.
 *
 * Posted whenever the assertion stops being true without the document going
 * away: the preference moves chat to the extension, the dock is collapsed, the
 * live tab is not the one showing, or the panel unmounts. A document that is
 * actually being replaced needs nothing from us — the extension releases a tab
 * whose document is going away on its own.
 *
 * ⚠️ RELEASE ORDER. An extension that predates this message ignores it and
 * leaves the tab yielded, which is the dark-tab failure. This may only ship to
 * users once an extension that understands it is in the field — ADR-018
 * sequences the extension side (row 4) strictly before this one (row 5), and
 * faultmaven-copilot#257 is that release.
 */
export function withdrawPanelAvailability(win: Window = window): void {
  win.postMessage({ type: DASHBOARD_PANEL_WITHDRAWN_MESSAGE }, win.location.origin);
}
