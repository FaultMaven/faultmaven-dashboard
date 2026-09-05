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
  dashboardAdvertisesPanel,
} from '@faultmaven/copilot-ui/contract';

export { DASHBOARD_PANEL_ATTR, DASHBOARD_PANEL_MESSAGE, dashboardAdvertisesPanel };

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
