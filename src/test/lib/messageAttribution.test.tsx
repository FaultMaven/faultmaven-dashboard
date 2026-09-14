/**
 * The attribution invariant.
 *
 * The Dashboard renders a case transcript twice — on screen (`TranscriptView`)
 * and into the Markdown export (`buildCaseMarkdown`) — and the two must not be
 * able to disagree about who said what. Testing either renderer alone would
 * pass while they contradicted each other, so the shared derivation is the
 * thing under test here, in two legs:
 *
 *  1. **Correctness** — the derivation itself gives the right answer. Two
 *     renderers agreeing on "You" for a system notice is not a pass.
 *  2. **Agreement** — both renderers reach exactly that answer, for the same
 *     fixture, in one test. Reintroducing a local
 *     `role === 'assistant' ? 'FaultMaven' : 'You'` in either one fails it.
 */

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TranscriptView } from '../../components/TranscriptView';
import { buildCaseMarkdown } from '../../lib/cases/exportMarkdown';
import {
  MESSAGE_AUTHOR_LABEL,
  messageAuthorLabel,
  messageKind,
  transcriptTurnNumbers,
} from '../../lib/cases/messageAttribution';
import type { CaseDetail, CaseMessage } from '../../types/cases';

const caseDetail = {
  case_id: 'case-42',
  title: 'DB Outage',
  description: 'Primary DB unresponsive',
  state: 'resolved',
  created_at: '2026-07-01T00:00:00Z',
  resolved_at: '2026-07-01T01:00:00Z',
  closed_at: null,
  closure_reason: null,
  current_turn: 2,
  milestones_completed: [],
  pending_milestones: [],
  is_terminal: true,
} as unknown as CaseDetail;

function message(overrides: Partial<CaseMessage> & { message_id: string }): CaseMessage {
  return {
    role: 'user',
    content: 'placeholder',
    created_at: '2026-07-01T00:00:00Z',
    turn_number: 1,
    ...overrides,
  };
}

/**
 * Every kind in one transcript, in an order that also exercises the counter:
 * the notice and the unknown row sit between two turns.
 *
 * The unrecognised role is cast — that is the point. The generated union
 * describes what the backend *declares*; this row is what a client sees when
 * the backend starts sending something it does not yet know about.
 */
const MESSAGES: CaseMessage[] = [
  message({ message_id: 'm1', role: 'user', content: 'The database is down', turn_number: 1 }),
  message({ message_id: 'm2', role: 'assistant', content: 'When did it start?', turn_number: 1 }),
  message({
    message_id: 'm3',
    role: 'system',
    content: 'Your runbook draft is ready. View it in the Dashboard.',
    metadata: { source: 'runbook_conversion_complete' },
  }),
  {
    message_id: 'm4',
    role: 'tool',
    content: 'Something a future backend sent',
    created_at: '2026-07-01T00:00:00Z',
    turn_number: 1,
  } as unknown as CaseMessage,
  message({ message_id: 'm5', role: 'user', content: 'It started at noon', turn_number: 2 }),
];

/** The label the on-screen renderer shows for a message. */
function screenLabel(content: string): string | null {
  const row = screen.getByText(content).closest('div.pl-4');
  return row?.querySelector('span')?.textContent ?? null;
}

/** Whether the on-screen renderer prints any turn label for a message. */
function screenHasTurn(content: string): boolean {
  const row = screen.getByText(content).closest('div.pl-4');
  return /Turn \d+/.test(row?.textContent ?? '');
}

/** The `#### …` heading the export writes above a message. */
function exportHeading(markdown: string, content: string): string {
  const lines = markdown.split('\n');
  const at = lines.indexOf(content);
  expect(at, `export is missing the message body: ${content}`).toBeGreaterThan(-1);
  const heading = lines.slice(0, at).reverse().find((l) => l.startsWith('#### '));
  return (heading ?? '').replace(/^#### /, '');
}

describe('message attribution — the shared derivation', () => {
  it('never attributes a non-conversational role to the reader', () => {
    // Leg 1: correctness. Consistency between renderers is worthless if the
    // answer they agree on is the wrong one.
    expect(messageAuthorLabel('user')).toBe('You');
    expect(messageAuthorLabel('assistant')).toBe('FaultMaven');

    for (const role of ['system', 'tool', 'developer', '', 'USER']) {
      expect(messageKind(role), `role ${JSON.stringify(role)}`).toBe('notice');
      expect(messageAuthorLabel(role), `role ${JSON.stringify(role)}`).not.toBe('You');
      expect(messageAuthorLabel(role)).toBe(MESSAGE_AUTHOR_LABEL.notice);
    }
  });

  it('gives a notice no turn, and leaves the turns around it intact', () => {
    // Positions 3 and 4 are the notice and the unknown role.
    expect(transcriptTurnNumbers(MESSAGES)).toEqual([1, 1, null, null, 2]);
  });
});

/**
 * The displayed turn is the INVESTIGATION turn, not the message clock (#127).
 *
 * `turn_number` advances on every exchange, asides included, so a haiku pushed
 * every later turn along by one and the user saw `Turn 8` for their sixth piece
 * of actual work — faultmaven#1329's symptom. Contract 3.5.0 puts the per-row
 * ordinal on each row; this is where it gets read.
 */
describe('the turn a transcript DISPLAYS', () => {
  // `row`, not `aside`: these build ordinary investigation rows as often as
  // asides, and a helper named for one of the two reads as the opposite of
  // what half the fixtures assert.
  const row = (id: string, role: string, clock: number, ordinal: number) =>
    message({ message_id: id, role, turn_number: clock, investigation_turn: ordinal });

  it('prefers the row ordinal over its position in the list', () => {
    // Position would say 1, 1, 2, 2. The server says the second exchange was an
    // aside, so it carries the first exchange's ordinal.
    const rows = [
      row('a1', 'user', 1, 1),
      row('a2', 'assistant', 1, 1),
      row('a3', 'user', 2, 1),
      row('a4', 'assistant', 2, 1),
    ];

    expect(transcriptTurnNumbers(rows)).toEqual([1, 1, 1, 1]);
  });

  it('does not advance across an aside, and does advance across real work', () => {
    // The acceptance criterion, stated directly: clock 1 (work), 2 (aside),
    // 3 (work) displays as 1, 1, 2.
    const rows = [
      row('b1', 'user', 1, 1),
      row('b2', 'user', 2, 1),
      row('b3', 'user', 3, 2),
    ];

    expect(transcriptTurnNumbers(rows)).toEqual([1, 1, 2]);
  });

  it('falls back to the MESSAGE CLOCK when the server did not say', () => {
    // Nullable on purpose: an older server reads as "did not say", never as
    // turn zero.
    //
    // The clock, not a count of positions. This file used to count, which
    // diverged from the panel beside it — `displayedTurn` falls back to
    // `turn_number` — so on a pre-3.5.0 server the dock and the tab numbered
    // one conversation two ways and the number moved when you collapsed the
    // dock. Same rule, one implementation, no divergence to have.
    const rows = [
      message({ message_id: 'c1', role: 'user', turn_number: 1 }),
      message({ message_id: 'c2', role: 'assistant', turn_number: 1 }),
      message({ message_id: 'c3', role: 'user', turn_number: 2 }),
    ];

    expect(transcriptTurnNumbers(rows)).toEqual([1, 1, 2]);
  });

  it('does NOT mix the two counters when only some rows carry the field', () => {
    // A case that ran across the 3.5.0 deploy: older rows have no ordinal,
    // newer ones do. Answering per row from whatever it happens to carry puts
    // both counters in one transcript — with asides early on the number goes
    // BACKWARD at the seam, and the header beside it agrees with neither.
    //
    // Decided ONCE for the conversation instead: when the server supplies
    // ordinals, a row without one gets no label rather than a clock number
    // wearing the ordinal's clothes.
    const rows = [
      row('d1', 'user', 1, 1),
      message({ message_id: 'd2', role: 'user', turn_number: 9 }),
    ];

    expect(transcriptTurnNumbers(rows)).toEqual([1, null]);
  });

  it('still gives a notice no turn, whatever the row claims', () => {
    // A notice owns no turn. The backend stamps one on it anyway, and now can
    // stamp an ordinal too — neither may be printed.
    const rows = [
      row('e1', 'user', 1, 1),
      row('e2', 'system', 1, 1),
      row('e3', 'user', 2, 2),
    ];

    expect(transcriptTurnNumbers(rows)).toEqual([1, null, 2]);
  });

  it('prints NO LABEL at investigation turn 0', () => {
    // Two different questions. What the turn IS uses `??`, because 0 is a real
    // answer — a case whose only exchange so far was an aside sits at ordinal
    // 0. Whether to PRINT it is separate, and at 0 the answer is no: "Turn 0"
    // names a turn the investigation has not reached.
    //
    // The panel already suppressed it; this surface printed "Turn 0" for the
    // same row until the rule moved into the package.
    const rows = [row('f1', 'user', 1, 0)];

    expect(transcriptTurnNumbers(rows)).toEqual([null]);
  });
});

describe('message attribution — the two renderers cannot disagree', () => {
  it('labels every message identically on screen and in the export', () => {
    const markdown = buildCaseMarkdown({
      caseDetail,
      messages: MESSAGES,
      evidence: [],
      hypotheses: [],
    });
    render(<TranscriptView messages={MESSAGES} />);

    const turns = transcriptTurnNumbers(MESSAGES);

    MESSAGES.forEach((msg, i) => {
      const expected = messageAuthorLabel(msg.role);
      const heading = exportHeading(markdown, msg.content);

      // Leg 2: both surfaces land on the derivation's answer — which leg 1
      // has already pinned to the correct one.
      expect(screenLabel(msg.content), `screen label for ${msg.message_id}`).toBe(expected);
      expect(heading.startsWith(expected), `export heading for ${msg.message_id}: ${heading}`).toBe(
        true
      );

      // …and they agree about the turn claim, not just the name.
      const claimsTurn = turns[i] !== null;
      expect(screenHasTurn(msg.content), `screen turn for ${msg.message_id}`).toBe(claimsTurn);
      expect(/· Turn \d+$/.test(heading), `export turn for ${msg.message_id}`).toBe(claimsTurn);
    });
  });

  it('states the shared answer for the rows that used to be misattributed', () => {
    // The regression, spelled out rather than left implicit in the loop above:
    // the runbook-conversion notice and an unknown role, on both surfaces.
    const markdown = buildCaseMarkdown({
      caseDetail,
      messages: MESSAGES,
      evidence: [],
      hypotheses: [],
    });
    render(<TranscriptView messages={MESSAGES} />);

    const notice = 'Your runbook draft is ready. View it in the Dashboard.';
    const unknown = 'Something a future backend sent';

    for (const content of [notice, unknown]) {
      expect(screenLabel(content)).toBe('System');
      expect(exportHeading(markdown, content)).toBe('System');
      expect(markdown).not.toContain(`#### You · Turn 1\n\n${content}`);
    }
  });
});
