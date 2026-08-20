import { useEffect, useId, useState, isValidElement } from 'react';
import type { ComponentProps, ReactElement, ReactNode } from 'react';
import type { ExtraProps } from 'react-markdown';

// Lazy-load mermaid so the ~1.5MB library ships as its own chunk and is
// fetched only when a page actually contains a diagram.
let mermaidModule: Promise<typeof import('mermaid')> | null = null;
function loadMermaid() {
  mermaidModule ??= import('mermaid')
    .then((mod) => {
      mod.default.initialize({
        startOnLoad: false,
        // Diagram sources arrive inside markdown from the backend (reports)
        // and case transcripts, so treat them as untrusted content.
        securityLevel: 'strict',
        // Without this, a parse failure draws mermaid's "Syntax error"
        // diagram into document.body and throws before its own cleanup —
        // the component's code-block fallback must be the only failure UI.
        suppressErrorRendering: true,
        theme: 'dark',
        fontFamily: 'inherit',
      });
      return mod;
    })
    .catch((err) => {
      // Don't memoize a rejected load (e.g. the chunk 404s in a tab kept
      // open across a redeploy) — clear the cache so a later mount retries.
      mermaidModule = null;
      throw err;
    });
  return mermaidModule;
}

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

/** Mark a cached chart as most-recently used. No-op if absent. */
function touchCachedSvg(chart: string): void {
  const svg = svgCache.get(chart);
  if (svg === undefined) return;
  svgCache.delete(chart);
  svgCache.set(chart, svg);
}

/** Store a rendered SVG as most-recently used, evicting the least-recent. */
function storeSvg(chart: string, svg: string): void {
  // Delete first: `set` on an existing key updates the value but keeps the
  // original insertion position, which would leave recency stale. Defensive
  // rather than load-bearing — the caller only reaches here on a cache miss,
  // so the key is normally absent and this is a no-op. It earns its place
  // only when two renders of the SAME uncached chart overlap (StrictMode's
  // double-invoke, or two instances mounting together) AND another chart is
  // stored between their two writes; without it the second write would leave
  // this entry ranked older than it is. Deliberately untested: the
  // interleaving is narrow and the consequence is one slot of eviction
  // order, so a test for it would be more brittle than the line it guards.
  svgCache.delete(chart);
  svgCache.set(chart, svg);
  while (svgCache.size > SVG_CACHE_MAX) {
    const leastRecent = svgCache.keys().next().value;
    if (leastRecent === undefined) break;
    svgCache.delete(leastRecent);
  }
}

// Mermaid keys its scratch DOM entirely off the id it is handed: `render(id)`
// first deletes `#id` / `#d{id}` / `#i{id}`, then appends its own
// `div#d{id} > svg#{id}` to document.body and removes it on the way out. Two
// renders sharing an id therefore destroy each other's working DOM — the
// loser's div is deleted from under it and mermaid throws, which surfaces
// here as the raw-source fallback on a diagram that parses perfectly well.
//
// `useId()` is stable for a component instance's whole lifetime, so it cannot
// separate two renders by the SAME component, which is exactly when overlap
// happens: the `chart` prop changing while a render is in flight, and
// StrictMode's double-invoke in development (which does it on every mount).
// The counter makes the id unique per render ATTEMPT; the `useId` prefix is
// kept so an id is still traceable back to a component instance.
let renderAttempt = 0;

interface MermaidDiagramProps {
  chart: string;
}

interface RenderState {
  chart: string;
  svg: string | null;
  failed: boolean;
}

/**
 * Renders a mermaid diagram source (e.g. the engine-generated Causal Map in
 * resolution summaries) as an inline SVG. Fail-closed: if mermaid cannot
 * parse the source, the raw text is shown as a plain code block — the same
 * presentation the app had before mermaid support.
 */
export default function MermaidDiagram({ chart }: MermaidDiagramProps) {
  const [state, setState] = useState<RenderState>(() => ({
    chart,
    svg: svgCache.get(chart) ?? null,
    failed: false,
  }));
  const renderId = `mmd-${useId().replace(/[^a-zA-Z0-9]/g, '')}`;

  // Reset for a new chart during render (the React-endorsed "adjusting
  // state when a prop changes" pattern) so the effect stays async-only.
  if (state.chart !== chart) {
    setState({ chart, svg: svgCache.get(chart) ?? null, failed: false });
  }

  useEffect(() => {
    // Recency is refreshed here rather than at the reads above: those run
    // during render, and mutating module state there would be an impure
    // render. This effect fires on mount and on every chart change, which
    // is exactly when a cached chart counts as used.
    if (svgCache.has(chart)) {
      touchCachedSvg(chart);
      return;
    }
    let cancelled = false;
    const attemptId = `${renderId}-${renderAttempt++}`;
    loadMermaid()
      .then(({ default: mermaid }) => mermaid.render(attemptId, chart))
      .then((result) => {
        if (cancelled) return;
        // Mermaid resolves with whatever survives sanitization; an empty
        // string must fall back, not sit on the loading placeholder.
        const svg = result.svg.trim() ? result.svg : null;
        if (svg) storeSvg(chart, svg);
        setState({ chart, svg, failed: !svg });
      })
      .catch((err) => {
        // Logged so a chunk-load failure is distinguishable from the
        // parse failure this fallback is designed for.
        console.error('mermaid render failed:', err);
        if (!cancelled) setState({ chart, svg: null, failed: true });
      });
    return () => {
      cancelled = true;
    };
  }, [chart, renderId]);

  if (state.failed) {
    return (
      <pre className="overflow-x-auto text-xs">
        <code>{chart}</code>
      </pre>
    );
  }
  if (!state.svg) {
    return (
      <div className="text-fm-text-tertiary text-xs py-2" aria-busy="true">
        Rendering diagram…
      </div>
    );
  }
  return (
    <div
      className="not-prose overflow-x-auto my-2 [&_svg]:max-w-full [&_svg]:h-auto"
      role="img"
      // role="img" makes the SVG's node text presentational, and the
      // backend emits no accTitle/accDescr — without a label this is an
      // unnamed image to assistive tech.
      aria-label="Diagram"
      // Mermaid output under securityLevel 'strict' is sanitized SVG.
      dangerouslySetInnerHTML={{ __html: state.svg }}
    />
  );
}

function fenceText(node: ReactNode): string {
  if (typeof node === 'string') return node;
  if (Array.isArray(node)) return node.map(fenceText).join('');
  if (isValidElement(node)) {
    return fenceText((node.props as { children?: ReactNode }).children);
  }
  return '';
}

/**
 * A react-markdown `pre` renderer that routes ```mermaid fences to
 * MermaidDiagram and leaves every other code block untouched. Use as
 * `components={{ pre: PreWithMermaid, ... }}`.
 */
export function PreWithMermaid(props: ComponentProps<'pre'> & ExtraProps) {
  // `node` is the hast element react-markdown passes to custom components;
  // keep it out of the spread or it lands in the DOM as node="[object Object]".
  const { children, node, ...rest } = props;
  void node;
  const child = Array.isArray(children) ? children[0] : children;
  if (isValidElement(child)) {
    const className = (child.props as { className?: string }).className ?? '';
    if (className.split(' ').includes('language-mermaid')) {
      return <MermaidDiagram chart={fenceText(child as ReactElement).trim()} />;
    }
  }
  return <pre {...rest}>{children}</pre>;
}
