import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
// A DEEP import, which the app may not make (packageImportBoundary) and a test
// may: this asserts what the PINNED package renders, and the source list has
// no entry-level export. Test files are outside that boundary by design.
import InlineSourcesRenderer from '@faultmaven/copilot-ui/shared/ui/components/InlineSourcesRenderer';

/**
 * A RUNBOOK THE VIEWER CANNOT OPEN (contract 13.1.0, faultmaven#1920).
 *
 * A case retrieves with its DRIVER's knowledge (ADR-020 D9), so a reader of a
 * shared case — or its creator after a hand-off — can find a runbook in a
 * turn's context they cannot open. The server keeps the entry (the count of
 * what the model had stays true) and strips it to `content` "", `confidence`
 * null and `metadata` `{access: "restricted"}`.
 *
 * WHERE THE DASHBOARD SHOWS SOURCES: only inside the docked (or narrow-width
 * live) Copilot panel, which renders them through this component from the
 * pinned `@faultmaven/copilot-ui`. The read-only Transcript tab
 * (`TranscriptView`) and the Markdown export render message text and never a
 * source list, so there is no second renderer here to keep in step.
 *
 * Rendered against the WIRE SHAPE, so the pin moving to a package that drops
 * the redaction arm fails here.
 */
const RESTRICTED = {
  type: 'knowledge_base',
  content: '',
  confidence: null,
  metadata: { access: 'restricted' },
  new_this_turn: true,
};

const OPEN = {
  type: 'knowledge_base',
  content: 'Check replication lag before failover.',
  confidence: 0.82,
  metadata: { document_id: 'doc-1', title: 'Replica failover runbook' },
  new_this_turn: true,
};

describe('a redacted knowledge-base source, as the pinned panel renders it', () => {
  it('reads "A runbook you don\'t have access to", with no title, link or number', () => {
    render(
      <InlineSourcesRenderer
        content="The replica is lagging."
        sources={[RESTRICTED] as never}
        onDocumentView={() => {}}
      />,
    );

    expect(screen.getByText("A runbook you don't have access to")).toBeInTheDocument();
    expect(screen.queryByText(/Source 1/)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /open runbook/i })).not.toBeInTheDocument();
  });

  it('still counts it, beside a runbook the viewer can open', () => {
    render(
      <InlineSourcesRenderer
        content="The replica is lagging."
        sources={[OPEN, RESTRICTED] as never}
        onDocumentView={() => {}}
      />,
    );

    expect(screen.getByText(/2 runbooks in context/)).toBeInTheDocument();
    expect(screen.getByText('Replica failover runbook')).toBeInTheDocument();
    expect(screen.getByText("A runbook you don't have access to")).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /open runbook/i })).toHaveLength(1);
  });
});
