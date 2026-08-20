/**
 * Bounded LRU of rendered mermaid SVGs, plus the decision the render effect
 * makes against it.
 *
 * Lives outside the component file because `react-refresh/only-export-components`
 * (blocking in CI via `--max-warnings 0`) allows a component file to export
 * constants but not functions — and because the decision below is pure and
 * deserves to be testable without mounting anything.
 */

// Rendered SVG per chart source. Charts are deterministic strings, so a
// remount (e.g. a CaseTabs tab switch, which unmounts inactive tabs) can
// reuse the previous result instead of re-running parse + layout.
//
// Bounded, because this Map is module-level: it outlives every component and
// lives for the tab's lifetime, and the dashboard is an ops tool whose tabs
// stay open for days. Unbounded, a session walking cases retains every
// distinct diagram it ever drew — a Causal Map per report and transcript,
// plus every mermaid fence in a browsed KB runbook via DocumentCard — with
// each entry holding both the full chart source (the key) and its SVG.
//
// Least-recently-USED, not just a size cap. `Map` iterates in insertion
// order, so evicting the first key alone would drop whichever diagram was
// inserted earliest even if it is the one on screen; reads re-insert to
// refresh recency, so eviction follows use rather than age. The cap is a
// working-set guess, not a measurement: enough to keep tab-switching inside
// a case and stepping back through recently-viewed cases on the fast path.
export const SVG_CACHE_MAX = 50;
const svgCache = new Map<string, string>();

/** Read without touching recency — safe to call during render. */
export function readSvg(chart: string): string | undefined {
  return svgCache.get(chart);
}

/**
 * What the render effect should do, given what this instance already shows
 * and what the cache holds for the same chart.
 *
 * Split out as a pure function because the two interesting cases are races
 * that a test cannot stage: React flushes passive effects after the commit,
 * so another instance's `storeSvg` can land in between and change the cache
 * out from under a decision the render phase already made. `act()` collapses
 * that window, so the interleaving is unreproducible in the suite even though
 * it is reachable in a browser. The decision it feeds is testable exhaustively.
 *
 * - `idle`   — this instance already shows an SVG for this chart. Nothing to
 *   do, *whatever the cache says*: keying off cache membership instead would
 *   re-run mermaid for a diagram already on screen if the entry was evicted
 *   in the window, and a redundant render that rejects flips a working
 *   diagram to the raw-source fallback.
 * - `adopt`  — this instance has nothing, but the cache does. Take it. Keying
 *   off cache membership alone would return without writing state, leaving
 *   the component on "Rendering diagram…" forever.
 * - `render` — neither has it; draw it.
 */
export type RenderAction = 'idle' | 'adopt' | 'render';

export function decideRenderAction(
  displayedSvg: string | null,
  cachedSvg: string | undefined
): RenderAction {
  if (displayedSvg) return 'idle';
  if (cachedSvg) return 'adopt';
  return 'render';
}

/** Store a rendered SVG as most-recently used, evicting the least-recent. */
export function storeSvg(chart: string, svg: string): void {
  // Delete first: `set` on an existing key updates the value but keeps the
  // original insertion position, which would leave recency stale. This is
  // load-bearing, not defensive — the `idle` branch re-stores the chart this
  // instance is already displaying on every effect run, and by then other
  // charts have usually been stored, so without the delete an on-screen
  // diagram would keep the rank it had when first drawn and be evicted ahead
  // of things the user has not looked at since.
  svgCache.delete(chart);
  svgCache.set(chart, svg);
  while (svgCache.size > SVG_CACHE_MAX) {
    const leastRecent = svgCache.keys().next().value;
    if (leastRecent === undefined) break;
    svgCache.delete(leastRecent);
  }
}
