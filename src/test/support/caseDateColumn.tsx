import { screen, within } from '@testing-library/react';
import { expect } from 'vitest';
import type { CaseDateColumn } from '../../lib/cases/dateColumn';

/**
 * Reading a case table's ONE date column, in the one way that actually binds
 * the header to the cell (faultmaven-dashboard#155).
 *
 * There were three copies of this a moment ago — two verbatim in the new test
 * files and one open-coded in `AdminCaseListPage.test.tsx` — which is how the
 * invariant they exist to protect ends up asserted three slightly different
 * ways. `src/test/support/` already exists for exactly this: see
 * `authFixtures.ts` on eight drifted copies of an auth double.
 */

/**
 * The body cell sitting UNDER the column header whose text is `label`.
 *
 * This is the whole trick. The column is located by its HEADER and the cell is
 * then read at that header's own index, so "the header says Created" and "the
 * cell renders `created_at`" are not two independent assertions that could both
 * pass while describing two different columns. If the header and the cell ever
 * named different dates, this returns the cell under the header and the
 * comparison fails.
 */
export function cellUnderHeader(label: string, rowIndex = 1): HTMLElement {
  const headers = screen.getAllByRole('columnheader');
  const index = headers.findIndex((h) => h.textContent?.trim() === label);
  expect(index, `no column header reads "${label}"`).toBeGreaterThanOrEqual(0);

  // Row 0 is the header row; body rows follow.
  const bodyRow = screen.getAllByRole('row')[rowIndex];
  return within(bodyRow).getAllByRole('cell')[index];
}

/**
 * What the viewer's own browser prints for that instant — the same call the
 * component makes.
 *
 * Never a frozen `9/1/2026`. `toLocaleDateString()` resolves in the viewer's
 * zone and locale, so a hard-coded verdict passes in CI (UTC, en-US) and is
 * wrong for everyone else. Measured: the same fixture renders `9/1/2026` in
 * UTC and `9/2/2026` in Pacific/Auckland.
 */
export function asRendered(iso: string): string {
  return new Date(iso).toLocaleDateString();
}

/**
 * Column values NEITHER production constant would produce.
 *
 * A test that only ever passes `CREATED_COLUMN` or `LAST_ACTIVITY_COLUMN`
 * cannot tell "the component read the prop" from "the component hard-codes the
 * string that happens to match". These can: nothing in the source contains
 * `Filed` or `Touched`, so a header showing one proves the label came off the
 * prop, and the cell beneath it proves the field did too.
 */
export const SENTINEL_CREATED: CaseDateColumn = { field: 'created_at', label: 'Filed' };
export const SENTINEL_LAST_ACTIVITY: CaseDateColumn = {
  field: 'last_activity_at',
  label: 'Touched',
};
