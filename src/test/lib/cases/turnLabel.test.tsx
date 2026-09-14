import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { caseTurnCount } from '../../../lib/cases/turnLabel';
import { TranscriptView } from '../../../components/TranscriptView';
import { IssueTab } from '../../../components/IssueTab';
import { buildCaseMarkdown } from '../../../lib/cases/exportMarkdown';
import type { CaseDetail, CaseMessage } from '../../../types/cases';

/**
 * One page, one turn counter.
 *
 * The transcript moved to the investigation ordinal first and every other
 * surface stayed on the message clock, so a case with two asides showed
 * `Turn 6` in the transcript and `8 turns` in the header three inches above it.
 * The backend note for faultmaven#1389 named that outcome in advance:
 * "Shipping only the rows leaves the same panel showing the bug one line
 * higher."
 */

const caseDetail = {
  case_id: 'case-1',
  title: 'DB Outage',
  description: 'Primary DB unresponsive',
  state: 'resolved',
  created_at: '2026-07-01T00:00:00Z',
  current_turn: 8,
  investigation_turn: 6,
  pending_milestones: [],
  is_terminal: true,
} as unknown as CaseDetail;

const row = (id: string, role: string, clock: number, ordinal?: number): CaseMessage =>
  ({
    message_id: id,
    role,
    content: `${id} content`,
    created_at: '2026-07-01T00:00:00Z',
    turn_number: clock,
    ...(ordinal === undefined ? {} : { investigation_turn: ordinal }),
  }) as unknown as CaseMessage;

describe('caseTurnCount — the number a CASE shows', () => {
  it('prefers the investigation turn over the message clock', () => {
    expect(caseTurnCount({ current_turn: 8, investigation_turn: 6 })).toBe(6);
  });

  it('falls back to the clock when the server did not say', () => {
    expect(caseTurnCount({ current_turn: 8 })).toBe(8);
    expect(caseTurnCount({ current_turn: 8, investigation_turn: null })).toBe(8);
  });

  it('treats 0 as an answer, not as absence', () => {
    // A case whose only exchanges so far were asides. `||` would print 8.
    expect(caseTurnCount({ current_turn: 3, investigation_turn: 0 })).toBe(0);
  });
});

describe('the surfaces that name a case-level turn', () => {
  it('shows the investigation turn in the issue summary', () => {
    // A COMPLETE CaseDetail, and the assertion SCOPED to the Turns cell. An
    // earlier version fed a fixture missing the count fields — so the component
    // rendered "undefined generated" and a bare `getByText('6')` was unique
    // only by accident. Fill those in and the loose query matches several
    // nodes; `queryByText('8')` was satisfied by any fixture without an 8
    // anywhere, which is not the same as the clock not being shown.
    render(
      <IssueTab
        caseDetail={
          {
            ...caseDetail,
            hypothesis_count: 2,
            evidence_count: 6,
            solution_count: 1,
          } as unknown as CaseDetail
        }
      />,
    );

    const turnsCell = screen.getByText('Turns:').closest('div');
    expect(turnsCell?.textContent).toContain('6');
    // 6, not the clock's 8 — the transcript on the neighbouring tab says 6.
    expect(turnsCell?.textContent).not.toContain('8');
  });

  it('agrees with its own transcript inside one exported document', () => {
    // The export is the archival artifact: a front matter that contradicts the
    // headings beneath it outlives the session that produced it.
    const md = buildCaseMarkdown({
      caseDetail,
      messages: [row('m1', 'user', 8, 6), row('m2', 'assistant', 8, 6)],
      evidence: [],
      hypotheses: [],
    });

    expect(md).toContain('- **Turns:** 6');
    expect(md).toContain('Turn 6');
    expect(md).not.toContain('- **Turns:** 8');
  });
});

describe('the transcript divider', () => {
  it('separates TURNS, not user rows', () => {
    // An aside shares the turn before it. Keyed on the role, the divider drew a
    // heavy rule and a fresh block repeating the number above it, which reads
    // as a duplicated turn or a rendering fault.
    const { container } = render(
      <TranscriptView
        messages={[
          row('m1', 'user', 1, 1),
          row('m2', 'assistant', 1, 1),
          row('m3', 'user', 2, 1), // the aside: same ordinal
          row('m4', 'assistant', 2, 1),
          row('m5', 'user', 3, 2), // real work: new ordinal
        ]}
      />,
    );

    // Three user rows, but only two turns — so one divider, before the third.
    expect(container.querySelectorAll('.border-t')).toHaveLength(1);
  });

  it('does NOT split a turn when a notice lands inside it', () => {
    // The shape the backend produces when a background runbook-conversion
    // notice arrives between a question and its answer. A notice owns no turn,
    // so its label is null — and comparing PRINTED LABELS made the assistant
    // row after it look like a turn boundary, putting the heavy rule between a
    // question and its own answer. Measured: 1 divider where there is 1 turn.
    const { container } = render(
      <TranscriptView
        messages={[row('m1', 'user', 1, 1), row('m2', 'system', 1, 1), row('m3', 'assistant', 1, 1)]}
      />,
    );

    expect(container.querySelectorAll('.border-t')).toHaveLength(0);
  });

  it('a notice does not end the turn it sits in', () => {
    // The row after the notice belongs to the SAME turn as the row before it,
    // so the comparison has to look past the notice rather than at it.
    const { container } = render(
      <TranscriptView
        messages={[
          row('m1', 'user', 1, 1),
          row('m2', 'system', 1, 1),
          row('m3', 'assistant', 1, 1),
          row('m4', 'user', 2, 2),
        ]}
      />,
    );

    // One divider: before the second turn, not around the notice.
    expect(container.querySelectorAll('.border-t')).toHaveLength(1);
  });
});
