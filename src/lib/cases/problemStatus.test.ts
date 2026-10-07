import { describe, it, expect } from 'vitest';
import { problemStatementView } from './problemStatus';

const STATEMENT = 'Checkout pods are OOM-killed under load';

describe('problemStatementView', () => {
  it('strikes an invalidated statement and gives the finding', () => {
    expect(
      problemStatementView(STATEMENT, {
        problem_status: 'invalidated',
        invalidation_finding: 'Memory stayed under 60% of the limit.',
      }),
    ).toEqual({
      statement: STATEMENT,
      struck: true,
      notes: [{ text: 'Not present: Memory stayed under 60% of the limit.', tone: 'warning' }],
    });
  });

  it('says it was not present even without a finding', () => {
    expect(problemStatementView(STATEMENT, { problem_status: 'invalidated' }).notes[0].text).toBe(
      'The evidence shows this problem was not present.',
    );
  });

  it('notes a pending revision, with or without its wording', () => {
    expect(
      problemStatementView(STATEMENT, { problem_status: 'revision_pending', pending_revision: 'Liveness restarts' })
        .notes,
    ).toEqual([{ text: 'Revision awaiting your confirmation: Liveness restarts', tone: 'muted' }]);
    expect(problemStatementView(STATEMENT, { problem_status: 'revision_pending' }).notes[0].text).toBe(
      'A revised statement awaits your confirmation.',
    );
  });

  it('says where a changed statement started, in any status', () => {
    for (const problem_status of ['verified', 'invalidated', 'reopened'] as const) {
      const view = problemStatementView(STATEMENT, {
        // 'reopened' stands for a value a newer server adds.
        problem_status: problem_status as 'verified',
        original_problem_statement: 'Checkout is slow',
      });
      expect(view.notes).toContainEqual({ text: 'Originally reported as: Checkout is slow', tone: 'muted' });
    }
  });

  it('renders the statement as before when nothing is known', () => {
    for (const verification of [null, undefined, { problem_status: 'unverified' as const }, { problem_status: null }]) {
      expect(problemStatementView(STATEMENT, verification)).toEqual({ statement: STATEMENT, struck: false, notes: [] });
    }
  });
});
