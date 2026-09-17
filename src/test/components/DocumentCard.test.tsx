import { render, screen, act, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DocumentCard, type DocumentCardData } from '../../components/DocumentCard';

vi.mock('../../lib/knowledge/kb', () => ({
  getDocument: vi.fn(),
  updateDocument: vi.fn(),
}));

/**
 * `tags` is OPTIONAL on `DocumentCardData`, and the branch that makes that safe
 * needs a test of its own (faultmaven-dashboard#165).
 *
 * The type was widened so a contract-derived list row could be passed straight
 * in, and the render site became `(document.tags?.length ?? 0) > 0`. Every
 * other fixture in the suite — including all four KBPage cases added with it —
 * sets `tags: []`, so a regression to `document.tags.length` would pass the
 * whole suite and throw `Cannot read properties of undefined` on the first real
 * response that omits the field.
 */
function card(overrides: Partial<DocumentCardData> = {}) {
  const document: DocumentCardData = {
    document_id: 'doc-1',
    title: 'Restart the ingest worker',
    document_type: 'runbook',
    created_at: '2026-09-01T00:00:00Z',
    ...overrides,
  };
  return render(<DocumentCard document={document} onDelete={vi.fn()} />);
}

describe('DocumentCard — tags are optional', () => {
  it('renders a card whose tags are absent entirely', () => {
    // No `tags` key at all: the shape a list row has when the server omits it.
    expect(() => card()).not.toThrow();
    expect(screen.getByText('Restart the ingest worker')).toBeInTheDocument();
  });

  it('renders no tag line for an empty list', () => {
    card({ tags: [] });

    expect(screen.queryByText(/incident, ingest/)).not.toBeInTheDocument();
  });

  it('renders the tag line when tags are present', () => {
    card({ tags: ['incident', 'ingest'] });

    expect(screen.getByText('incident, ingest')).toBeInTheDocument();
  });
});

/**
 * A successful save tells the list (faultmaven-dashboard#168 review).
 *
 * `onUpdated` was declared on `DocumentCardProps`, forwarded by `DocumentList`
 * and passed by `KBPage` as `() => loadPage(page)` — and never destructured, so
 * it could not fire. The save updated only this card's local `content` while
 * the row the parent holds kept its pre-edit body, leaving the list's own
 * search and facets stale until navigation. `noUnusedParameters` cannot catch
 * it: the name never appears in the component at all.
 */
describe('DocumentCard — a save notifies the list', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls onUpdated after the update resolves', async () => {
    const kb = await import('../../lib/knowledge/kb');
    (kb.getDocument as ReturnType<typeof vi.fn>).mockResolvedValue({
      document_id: 'doc-1',
      content: '# Before',
    });
    (kb.updateDocument as ReturnType<typeof vi.fn>).mockResolvedValue({
      document_id: 'doc-1',
    });
    const onUpdated = vi.fn();

    render(
      <DocumentCard
        document={{
          document_id: 'doc-1',
          title: 'Restart the ingest worker',
          document_type: 'runbook',
          created_at: '2026-09-01T00:00:00Z',
        }}
        onDelete={vi.fn()}
        onUpdated={onUpdated}
      />
    );

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    });
    // Save is `disabled={saving || !dirty}`, so the content has to actually
    // change — clicking it on an untouched card is a no-op by design.
    await act(async () => {
      fireEvent.change(screen.getByRole('textbox'), { target: { value: '# After' } });
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    });

    expect(kb.updateDocument).toHaveBeenCalled();
    expect(onUpdated).toHaveBeenCalledTimes(1);
  });

  it('does not call onUpdated when the update fails', async () => {
    const kb = await import('../../lib/knowledge/kb');
    (kb.getDocument as ReturnType<typeof vi.fn>).mockResolvedValue({
      document_id: 'doc-1',
      content: '# Before',
    });
    (kb.updateDocument as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('nope'));
    const onUpdated = vi.fn();

    render(
      <DocumentCard
        document={{
          document_id: 'doc-1',
          title: 'Restart the ingest worker',
          document_type: 'runbook',
          created_at: '2026-09-01T00:00:00Z',
        }}
        onDelete={vi.fn()}
        onUpdated={onUpdated}
      />
    );

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    });
    // Save is `disabled={saving || !dirty}`, so the content has to actually
    // change — clicking it on an untouched card is a no-op by design.
    await act(async () => {
      fireEvent.change(screen.getByRole('textbox'), { target: { value: '# After' } });
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    });

    // A refetch on failure would replace the user's unsaved text with the
    // server copy they were trying to change.
    expect(onUpdated).not.toHaveBeenCalled();
  });
});
