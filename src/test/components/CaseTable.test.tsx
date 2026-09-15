import { render, screen, within } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { CaseTable } from '../../components/CaseTable';
import {
  resolveCaseDateColumn,
  CREATED_COLUMN,
  LAST_ACTIVITY_COLUMN,
  type CaseDateColumn,
} from '../../lib/cases/dateColumn';
import type { CaseSummary } from '../../types/cases';

/**
 * The two instants are 19 DAYS APART, which is more than any timezone offset
 * (±14h at the extremes), so they are different calendar days wherever this
 * suite runs. Every assertion below is about WHICH of the two a cell rendered,
 * and that question would be unanswerable if the offset could collapse them.
 *
 * Nothing here asserts a frozen date string. `toLocaleDateString()` resolves in
 * the viewer's own zone and with their own locale, so a hard-coded `9/1/2026`
 * would pass in CI (UTC, en-US) and be wrong for everyone else — the mistake
 * `dateRange.ts` exists to avoid, one layer up.
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

/** What the viewer's browser would print for that instant, right here, right now. */
function asRendered(iso: string): string {
  return new Date(iso).toLocaleDateString();
}

/**
 * The cell sitting UNDER the header that bears `label`.
 *
 * This is the whole point of the test: the column is located by its header and
 * the cell is then read by that header's own index, so "the header says
 * Created" and "the cell renders `created_at`" are not two independent
 * assertions that could both be satisfied by two different columns. If the
 * header and the cell ever named different dates, this returns the cell under
 * the header and the comparison fails.
 */
function cellUnderHeader(label: string): HTMLElement {
  const headers = screen.getAllByRole('columnheader');
  const index = headers.findIndex((h) => h.textContent?.trim() === label);
  expect(index, `no column header reads "${label}"`).toBeGreaterThanOrEqual(0);

  const bodyRow = screen.getAllByRole('row')[1]; // [0] is the header row
  return within(bodyRow).getAllByRole('cell')[index];
}

function renderTable(dateColumn?: CaseDateColumn) {
  return render(
    <MemoryRouter>
      <CaseTable cases={[sampleCase]} loading={false} dateColumn={dateColumn} />
    </MemoryRouter>,
  );
}

describe('CaseTable — the one date column', () => {
  it('shows Last Activity by default, which is every surface with no creation-date filter', () => {
    // The operator All Cases list passes no `dateColumn` at all: its filter bar
    // is `stateOnly` and renders no date inputs, so there is nothing to reflect.
    renderTable();

    expect(cellUnderHeader('Last Activity')).toHaveTextContent(
      asRendered(sampleCase.last_activity_at),
    );
    expect(screen.queryByRole('columnheader', { name: 'Created' })).toBeNull();
  });

  it('shows Created — the value the filter was applied to — when told to', () => {
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
   * THE BINDING. Both answers the resolver can give, driven through the
   * resolver itself rather than by naming the constants — so this asserts the
   * whole path from a filter bag to a rendered cell.
   *
   * A `Created` header over a `last_activity_at` cell is the same class of lie
   * as a filter that narrows by an invisible value, and it is the failure mode
   * a `dateColumn` string plus a separate `dateLabel` string would eventually
   * have produced.
   */
  it.each([
    ['no creation-date filter', {}],
    ['a closed creation-date range', { date_from: '2026-09-01', date_to: '2026-09-01' }],
    ['a lower bound only', { date_from: '2026-09-01' }],
    ['an upper bound only', { date_to: '2026-09-30' }],
    ['a range suspended by a search', { date_from: '2026-09-01', search: 'payment' }],
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
