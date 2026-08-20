import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import { StrictMode } from 'react';
import Markdown from 'react-markdown';
import MermaidDiagram, {
  PreWithMermaid,
} from '../../components/MermaidDiagram';
import {
  SVG_CACHE_MAX,
  decideRenderAction,
} from '../../lib/mermaidSvgCache';

// The component memoizes rendered svg by chart source, so every test here
// must use a chart string no earlier test has rendered.
let svgCacheBust = 0;

// jsdom cannot lay out real diagrams, so pin the routing contract instead:
// ```mermaid fences reach mermaid.render, other fences stay code blocks,
// and a parse failure falls back to the raw source.
const renderMock = vi.hoisted(() =>
  vi.fn().mockResolvedValue({ svg: '<svg data-testid="mmd-svg"></svg>' })
);
const initializeMock = vi.hoisted(() => vi.fn());
vi.mock('mermaid', () => ({
  default: { initialize: initializeMock, render: renderMock },
}));

const MD = ({ content }: { content: string }) => (
  <Markdown components={{ pre: PreWithMermaid }}>{content}</Markdown>
);

describe('PreWithMermaid', () => {
  it('routes mermaid fences to the mermaid renderer', async () => {
    const { container } = render(
      <MD content={'```mermaid\nflowchart LR\n  a --> b\n```'} />
    );
    await waitFor(() =>
      expect(container.querySelector('[role="img"]')).toBeInTheDocument()
    );
    expect(renderMock).toHaveBeenCalledWith(
      expect.any(String),
      'flowchart LR\n  a --> b'
    );
    expect(container.querySelector('pre')).not.toBeInTheDocument();
  });

  it('leaves non-mermaid fences as plain code blocks', () => {
    const { container } = render(<MD content={'```python\nprint(1)\n```'} />);
    expect(container.querySelector('pre')).toBeInTheDocument();
    expect(container.querySelector('[role="img"]')).not.toBeInTheDocument();
  });

  it('falls back to the raw source when mermaid cannot parse', async () => {
    renderMock.mockRejectedValueOnce(new Error('parse error'));
    render(<MD content={'```mermaid\nnot a diagram\n```'} />);
    await waitFor(() =>
      expect(screen.getByText('not a diagram')).toBeInTheDocument()
    );
  });

  it('keeps error rendering suppressed so parse failures cannot draw into document.body', async () => {
    render(<MD content={'```mermaid\nflowchart LR\n  init --> check\n```'} />);
    await waitFor(() => expect(initializeMock).toHaveBeenCalled());
    expect(initializeMock).toHaveBeenCalledWith(
      expect.objectContaining({
        suppressErrorRendering: true,
        securityLevel: 'strict',
      })
    );
  });

  it('falls back to the raw source when the render resolves with an empty svg', async () => {
    renderMock.mockResolvedValueOnce({ svg: '   ' });
    render(<MD content={'```mermaid\nsanitized away\n```'} />);
    await waitFor(() =>
      expect(screen.getByText('sanitized away')).toBeInTheDocument()
    );
  });

  it('labels the rendered diagram for assistive tech', async () => {
    const { container } = render(
      <MD content={'```mermaid\nflowchart LR\n  labelled --> diagram\n```'} />
    );
    await waitFor(() =>
      expect(container.querySelector('[role="img"]')).toBeInTheDocument()
    );
    expect(container.querySelector('[role="img"]')).toHaveAttribute('aria-label');
  });

  it('does not leak the hast node prop onto plain code blocks', () => {
    const { container } = render(<MD content={'```python\nprint(2)\n```'} />);
    expect(container.querySelector('pre')).not.toHaveAttribute('node');
  });

  it('reuses the cached svg on remount instead of re-rendering', async () => {
    const chart = '```mermaid\nflowchart LR\n  cached --> reused\n```';
    const { container, unmount } = render(<MD content={chart} />);
    await waitFor(() =>
      expect(container.querySelector('[role="img"]')).toBeInTheDocument()
    );
    const calls = renderMock.mock.calls.length;
    unmount();
    const remounted = render(<MD content={chart} />);
    // Served synchronously from the module cache: no placeholder, no new call.
    expect(remounted.container.querySelector('[role="img"]')).toBeInTheDocument();
    expect(renderMock.mock.calls.length).toBe(calls);
  });
});

// Mermaid keys its scratch DOM off the id it is handed: render(id) deletes
// any existing #d{id}, appends its own, and removes it on the way out. Two
// renders sharing an id destroy each other. These tests stand in a mock with
// that same id-keyed lifecycle — an interleaving that leaves the later render
// without its element fails, exactly as the real library does — so they fail
// on a real collision rather than merely on ids being equal.
describe('MermaidDiagram concurrent renders', () => {
  const gates: Array<() => void> = [];

  const idKeyedRender = (id: string, chart: string) => {
    // removeExistingElements(document, id, 'd'+id, 'i'+id)
    document.getElementById(id)?.remove();
    document.getElementById(`d${id}`)?.remove();
    const scratch = document.createElement('div');
    scratch.id = `d${id}`;
    document.body.appendChild(scratch);
    // Suspend mid-render so a second render can interleave, the way a real
    // layout pass leaves a window open.
    return new Promise<{ svg: string }>((resolve, reject) => {
      gates.push(() => {
        const mine = document.getElementById(`d${id}`);
        if (!mine) {
          reject(
            new TypeError("Cannot read properties of null (reading 'firstChild')")
          );
          return;
        }
        mine.remove(); // removeTempElements()
        resolve({ svg: `<svg data-chart="${chart}"></svg>` });
      });
    });
  };

  beforeEach(() => {
    gates.length = 0;
    svgCacheBust++;
    renderMock.mockImplementation(idKeyedRender);
  });

  afterEach(() => {
    renderMock.mockReset();
    renderMock.mockResolvedValue({ svg: '<svg data-testid="mmd-svg"></svg>' });
    document.body.querySelectorAll('[id^="dmmd-"]').forEach((n) => n.remove());
  });

  const fence = (body: string) => `flowchart LR\n  ${body}`;

  it('survives the chart prop changing while a render is in flight', async () => {
    const first = fence(`a${svgCacheBust} --> b`);
    const second = fence(`c${svgCacheBust} --> d`);

    const { container, rerender } = render(<MermaidDiagram chart={first} />);
    await waitFor(() => expect(gates.length).toBe(1));

    // Second render begins while the first is still suspended.
    rerender(<MermaidDiagram chart={second} />);
    await waitFor(() => expect(gates.length).toBe(2));

    // The stale render completes first — this is the ordering that used to
    // delete the live render's scratch element out from under it.
    await act(async () => {
      gates[0]();
      gates[1]();
    });

    await waitFor(() =>
      expect(container.querySelector('[role="img"]')).toBeInTheDocument()
    );
    // The raw-source fallback is the symptom of the collision.
    expect(container.querySelector('pre')).not.toBeInTheDocument();
    expect(container.innerHTML).toContain(`data-chart="${second}"`);
  });

  it('gives each render attempt its own id', async () => {
    const chart = fence(`unique${svgCacheBust} --> ids`);
    const { rerender } = render(<MermaidDiagram chart={chart} />);
    await waitFor(() => expect(gates.length).toBe(1));
    rerender(<MermaidDiagram chart={fence(`other${svgCacheBust} --> id`)} />);
    await waitFor(() => expect(gates.length).toBe(2));

    const ids = renderMock.mock.calls.slice(-2).map((c) => c[0] as string);
    expect(ids[0]).not.toBe(ids[1]);
    await act(async () => gates.forEach((g) => g()));
  });

  it('survives StrictMode double-invoking the effect on mount', async () => {
    const chart = fence(`strict${svgCacheBust} --> mode`);
    const { container } = render(
      <StrictMode>
        <MermaidDiagram chart={chart} />
      </StrictMode>
    );
    // StrictMode runs the effect, cleans up, and runs it again: two
    // overlapping renders on a single mount.
    await waitFor(() => expect(gates.length).toBe(2));
    const ids = renderMock.mock.calls.slice(-2).map((c) => c[0] as string);
    expect(ids[0]).not.toBe(ids[1]);

    await act(async () => {
      gates[0]();
      gates[1]();
    });

    await waitFor(() =>
      expect(container.querySelector('[role="img"]')).toBeInTheDocument()
    );
    expect(container.querySelector('pre')).not.toBeInTheDocument();
  });
});

// The svg cache is module-level, so it outlives every component and every
// test in this file. Each test below first inserts SVG_CACHE_MAX charts of
// its own, which flushes anything earlier tests left behind — that is what
// makes the eviction assertions deterministic without a reset hook.
describe('MermaidDiagram svg cache', () => {
  let run = 0;

  beforeEach(() => {
    run++;
    renderMock.mockReset();
    renderMock.mockImplementation((_id: string, chart: string) =>
      Promise.resolve({ svg: `<svg data-chart="${chart}"></svg>` })
    );
  });

  const chartFor = (n: number) => `flowchart LR\n  cache${run}_${n} --> x`;

  /** Render a chart to completion, then unmount, leaving only its cache entry. */
  const visit = async (chart: string) => {
    const { container, unmount } = render(<MermaidDiagram chart={chart} />);
    await waitFor(() =>
      expect(container.querySelector('[role="img"]')).toBeInTheDocument()
    );
    unmount();
  };

  /** A chart is cached iff revisiting it does not reach mermaid again. */
  const isCached = async (chart: string) => {
    const before = renderMock.mock.calls.length;
    await visit(chart);
    return renderMock.mock.calls.length === before;
  };

  it('evicts once the cache is full instead of growing without bound', async () => {
    const oldest = chartFor(0);
    await visit(oldest);
    // SVG_CACHE_MAX further charts push it past the cap.
    for (let i = 1; i <= SVG_CACHE_MAX; i++) await visit(chartFor(i));

    expect(await isCached(oldest)).toBe(false);
  });

  it('evicts the least-recently-USED entry, not the oldest one', async () => {
    for (let i = 0; i < SVG_CACHE_MAX; i++) await visit(chartFor(i));

    // Re-visit the oldest entry: under LRU this makes it most-recent, so the
    // next insertion must evict entry 1 instead. Under a plain insertion-order
    // cap, entry 0 is still the first key and would be the one dropped.
    expect(await isCached(chartFor(0))).toBe(true);

    // Exactly one insertion over capacity => exactly one eviction.
    await visit(chartFor(SVG_CACHE_MAX));

    expect(await isCached(chartFor(0))).toBe(true);
    expect(await isCached(chartFor(1))).toBe(false);
  });

  it('keeps the cache bounded at the configured capacity', async () => {
    for (let i = 0; i < SVG_CACHE_MAX * 2; i++) await visit(chartFor(i));

    // The most recent SVG_CACHE_MAX charts are all still served from cache...
    const newest = SVG_CACHE_MAX * 2 - 1;
    expect(await isCached(chartFor(newest))).toBe(true);
    // ...and everything older than the window is gone.
    expect(await isCached(chartFor(0))).toBe(false);
  });
});

// The two defects this guards against are races in React's commit-to-passive-
// effect window: another instance's storeSvg lands there and changes the cache
// out from under a decision the render phase already made. `act()` collapses
// that window, so the interleaving cannot be staged in this suite — but the
// decision it feeds is a pure function, and every cell of it is pinned here.
describe('decideRenderAction', () => {
  const SVG = '<svg/>';
  const OTHER = '<svg data-other/>';

  it('is idle when this instance already shows the chart, even on a cache miss', () => {
    // The finding: keying off cache membership would re-run mermaid for a
    // diagram already on screen if its entry was evicted in the window, and a
    // redundant render that rejects flips a working diagram to the fallback.
    expect(decideRenderAction(SVG, undefined)).toBe('idle');
  });

  it('is idle when this instance shows the chart and the cache agrees', () => {
    expect(decideRenderAction(SVG, SVG)).toBe('idle');
  });

  it('adopts the cached svg when this instance has none', () => {
    // The finding: returning here without writing state leaves the component
    // on "Rendering diagram…" forever.
    expect(decideRenderAction(null, SVG)).toBe('adopt');
  });

  it('renders when neither this instance nor the cache has the chart', () => {
    expect(decideRenderAction(null, undefined)).toBe('render');
  });

  it('prefers what is already on screen over a differing cache entry', () => {
    // Not a redraw: swapping the on-screen SVG for another rendering of the
    // same deterministic source would be churn with no visible benefit.
    expect(decideRenderAction(SVG, OTHER)).toBe('idle');
  });

  it('treats an empty string as nothing, on both inputs', () => {
    // `''` is falsy and must not be mistaken for a usable SVG: the render
    // path already maps a blank mermaid result to null + the fallback.
    expect(decideRenderAction('', SVG)).toBe('adopt');
    expect(decideRenderAction('', '')).toBe('render');
    expect(decideRenderAction(null, '')).toBe('render');
  });
});
