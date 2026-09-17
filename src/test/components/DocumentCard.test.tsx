import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
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
