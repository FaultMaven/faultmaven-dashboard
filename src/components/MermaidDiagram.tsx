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
const svgCache = new Map<string, string>();

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
    if (svgCache.has(chart)) return;
    let cancelled = false;
    const attemptId = `${renderId}-${renderAttempt++}`;
    loadMermaid()
      .then(({ default: mermaid }) => mermaid.render(attemptId, chart))
      .then((result) => {
        if (cancelled) return;
        // Mermaid resolves with whatever survives sanitization; an empty
        // string must fall back, not sit on the loading placeholder.
        const svg = result.svg.trim() ? result.svg : null;
        if (svg) svgCache.set(chart, svg);
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
