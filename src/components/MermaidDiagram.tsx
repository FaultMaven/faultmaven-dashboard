import { useEffect, useId, useState, isValidElement } from 'react';
import type { ComponentProps, ReactElement, ReactNode } from 'react';

// Lazy-load mermaid so the ~1.5MB library ships as its own chunk and is
// fetched only when a page actually contains a diagram.
let mermaidModule: Promise<typeof import('mermaid')> | null = null;
function loadMermaid() {
  mermaidModule ??= import('mermaid').then((mod) => {
    mod.default.initialize({
      startOnLoad: false,
      // Diagram sources arrive inside markdown from the backend (reports)
      // and case transcripts, so treat them as untrusted content.
      securityLevel: 'strict',
      theme: 'dark',
      fontFamily: 'inherit',
    });
    return mod;
  });
  return mermaidModule;
}

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
  const [state, setState] = useState<RenderState>({ chart, svg: null, failed: false });
  const renderId = `mmd-${useId().replace(/[^a-zA-Z0-9]/g, '')}`;

  // Reset for a new chart during render (the React-endorsed "adjusting
  // state when a prop changes" pattern) so the effect stays async-only.
  if (state.chart !== chart) {
    setState({ chart, svg: null, failed: false });
  }

  useEffect(() => {
    let cancelled = false;
    loadMermaid()
      .then(({ default: mermaid }) => mermaid.render(renderId, chart))
      .then((result) => {
        if (!cancelled) setState({ chart, svg: result.svg, failed: false });
      })
      .catch(() => {
        if (!cancelled) setState({ chart, svg: null, failed: true });
      });
    return () => {
      cancelled = true;
    };
  }, [chart, renderId]);

  if (state.failed) {
    return (
      <pre className="not-prose overflow-x-auto text-xs">
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
export function PreWithMermaid(props: ComponentProps<'pre'>) {
  const { children, ...rest } = props;
  const child = Array.isArray(children) ? children[0] : children;
  if (isValidElement(child)) {
    const className = (child.props as { className?: string }).className ?? '';
    if (className.split(' ').includes('language-mermaid')) {
      return <MermaidDiagram chart={fenceText(child as ReactElement).trim()} />;
    }
  }
  return <pre {...rest}>{children}</pre>;
}
