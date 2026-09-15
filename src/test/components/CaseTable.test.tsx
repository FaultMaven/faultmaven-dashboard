import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { CaseTable } from '../../components/CaseTable';
import {
  resolveCaseDateColumn,
  CREATED_COLUMN,
  LAST_ACTIVITY_COLUMN,
  type CaseDateColumn,
} from '../../lib/cases/dateColumn';
import {
  cellUnderHeader,
  asRendered,
  SENTINEL_CREATED,
  SENTINEL_LAST_ACTIVITY,
} from '../support/caseDateColumn';
import type { CaseSummary } from '../../types/cases';

/**
 * The two instants are 19 DAYS APART, which is more than any timezone offset
 * (±14h at the extremes), so they are different calendar days wherever this
 * suite runs. Every assertion below is about WHICH of the two a cell rendered,
 * and that question would be unanswerable if the offset could collapse them.
 *
 * Nothing here asserts a frozen date string — see `asRendered`.
 */
const sampleCase: CaseSummary = {
  case_id: 'case-1',
  title: 'Database Outage',
  description: 'Primary DB is unresponsive',
  state: 'investigating',
  created_at: '2026-09-01T12:00:00Z',
  updated_at: '2026-09-20T12:00:00Z',
  last_activity_at: '2026-09-20T12:00:00Z',
  resolved_at: null,
  closed_at: null,
  closure_reason: null,
  user_id: 'u1',
  enterprise_id: 'ent-1',
  current_turn: 5,
  source: 'copilot',
  stage: 'diagnosis',
  turns_without_progress: 0,
  is_terminal: false,
  shared_team_ids: [],
};

function renderTable(dateColumn: CaseDateColumn) {
  return render(
    <MemoryRouter>
      <CaseTable cases={[sampleCase]} loading={false} dateColumn={dateColumn} />
    </MemoryRouter>,
  );
}

describe('CaseTable — the one date column', () => {
  it('shows Last Activity when that is the answer', () => {
    renderTable(LAST_ACTIVITY_COLUMN);

    expect(cellUnderHeader('Last Activity')).toHaveTextContent(
      asRendered(sampleCase.last_activity_at),
    );
    expect(screen.queryByRole('columnheader', { name: 'Created' })).toBeNull();
  });

  it('shows Created — the value the filter was applied to — when that is', () => {
    renderTable(CREATED_COLUMN);

    expect(cellUnderHeader('Created')).toHaveTextContent(asRendered(sampleCase.created_at));
    expect(screen.queryByRole('columnheader', { name: 'Last Activity' })).toBeNull();
  });

  it('still shows ONE date column, not a seventh', () => {
    // Option 1 in #155 and the reason it was rejected: Title / State / Stage /
    // date is already the width this table has.
    renderTable(CREATED_COLUMN);

    const headers = screen.getAllByRole('columnheader').map((h) => h.textContent?.trim());
    expect(headers).toEqual(['Title', 'State', 'Stage', 'Created']);
  });

  /**
   * THE PROP IS READ, not guessed.
   *
   * Passing only the two production constants cannot distinguish "the component
   * reads `dateColumn`" from "the component hard-codes the matching string",
   * because the hard-coded answer is right half the time by construction. These
   * labels appear nowhere in the source, so a header showing one proves the
   * label came off the prop — and `cellUnderHeader` then proves the cell under
   * that header came off the prop's `field`.
   *
   * It also covers what a default used to hide: before `dateColumn` became
   * required, a caller that omitted it silently got last activity, which is #155
   * arriving by omission.
   */
  it.each([
    ['a created sentinel', SENTINEL_CREATED, 'created_at' as const],
    ['a last-activity sentinel', SENTINEL_LAST_ACTIVITY, 'last_activity_at' as const],
  ])('honours the prop over any built-in answer — %s', (_name, column, field) => {
    renderTable(column);

    expect(screen.getByRole('columnheader', { name: column.label })).toBeInTheDocument();
    expect(cellUnderHeader(column.label)).toHaveTextContent(asRendered(sampleCase[field]));
    // Neither production label is on screen, so nothing here can be satisfied
    // by a hard-coded 'Created' or 'Last Activity'.
    expect(screen.queryByRole('columnheader', { name: 'Created' })).toBeNull();
    expect(screen.queryByRole('columnheader', { name: 'Last Activity' })).toBeNull();
  });

  /**
   * THE BINDING, from a filter bag all the way to a rendered cell — driven
   * through the real resolver rather than by naming the constants.
   *
   * A `Created` header over a `last_activity_at` cell is the same class of lie
   * as a filter that narrows by an invisible value.
   */
  it.each([
    ['no creation-date filter', {}],
    ['a closed creation-date range', { date_from: '2026-09-01', date_to: '2026-09-01' }],
    ['a lower bound only', { date_from: '2026-09-01' }],
    ['an upper bound only', { date_to: '2026-09-30' }],
    ['a range suspended by a search', { date_from: '2026-09-01', search: 'payment' }],
    ['a year still being typed, which resolves to no bound', { date_from: '0002-09-14' }],
  ])('header and cell cannot disagree — %s', (_name, filters) => {
    const column = resolveCaseDateColumn(filters);
    renderTable(column);

    const other = column === CREATED_COLUMN ? LAST_ACTIVITY_COLUMN : CREATED_COLUMN;

    // The cell under the header the resolver labelled renders the field the
    // resolver named — one value, read twice, so there is nothing to drift.
    expect(cellUnderHeader(column.label)).toHaveTextContent(asRendered(sampleCase[column.field]));

    // And it is NOT the other date. The fixture's two instants are 19 days
    // apart, so this distinguishes them in every timezone.
    expect(cellUnderHeader(column.label)).not.toHaveTextContent(asRendered(sampleCase[other.field]));
    expect(screen.queryByRole('columnheader', { name: other.label })).toBeNull();
  });
});
