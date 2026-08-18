import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import Markdown from 'react-markdown';
import { PreWithMermaid } from '../../components/MermaidDiagram';

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
