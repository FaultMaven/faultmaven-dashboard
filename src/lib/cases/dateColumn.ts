import { startOfLocalDay, exclusiveEndOfLocalDay } from './dateRange';
import type { CaseFilters } from '../../types/cases';

/**
 * WHICH DATE a case row shows (faultmaven-dashboard#155).
 *
 * One question decides it, and this is the only place it is asked:
 *
 *   > is the list being narrowed by CREATION DATE right now?
 *
 * The table shows one date per row. It has always been `last_activity_at`,
 * which is the right default: on a list you scan for "what moved recently",
 * activity is the useful column. But #154 restored a creation-date range, and
 * for an active case `last_activity_at` can be weeks after `created_at` — so
 * filtering `Created 1 Sept – 1 Sept` returned rows whose only visible date was
 * the 20th. The honest reading of that is "the filter is broken", which is
 * exactly the symptom #51 was reported as: the restored filter could be
 * mistaken for the bug it had just fixed.
 *
 * So the column follows the filter. While a creation-date bound is applied the
 * row shows the value that bound was applied to; the rest of the time it shows
 * last activity, unchanged.
 *
 * RESOLVED ONCE, BY THE PAGE, AND HANDED DOWN WHOLE — the same rule
 * `conversationSurface.ts` follows, for the same reason. The header and the
 * cell are two consumers of one answer, and a header reading "Created" over a
 * cell rendering `last_activity_at` is the same class of lie this whole issue
 * is about. They read `label` and `field` off ONE value, so they cannot be
 * given different answers.
 */

/** The two dates a `CaseSummary` carries. Both are required on the contract. */
export type CaseDateField = 'created_at' | 'last_activity_at';

export interface CaseDateColumn {
  /** The `CaseSummary` key the cell renders. */
  field: CaseDateField;
  /** The column header, and the only text that says which date that is. */
  label: string;
}

/**
 * The default, and the answer for every surface with no creation-date filter —
 * including the operator All Cases list, whose `CaseFiltersBar` is `stateOnly`
 * and renders no date inputs at all.
 */
export const LAST_ACTIVITY_COLUMN: CaseDateColumn = {
  field: 'last_activity_at',
  label: 'Last Activity',
};

/** Shown while a creation-date bound is narrowing the list. */
export const CREATED_COLUMN: CaseDateColumn = {
  field: 'created_at',
  label: 'Created',
};

/**
 * APPLIED, not merely set — and "applied" is decided by the SAME two functions
 * `listCases` calls, never by looking at the picker string.
 *
 * `listCases` sends a bound only when `dateRange.ts` can resolve one:
 *
 *   const createdAfter = startOfLocalDay(filters.date_from);
 *   const createdBefore = exclusiveEndOfLocalDay(filters.date_to);
 *   ...(createdAfter && { created_after: createdAfter }),
 *   ...(createdBefore && { created_before: createdBefore }),
 *
 * ...and both return `undefined` for a day it rejects. So `Boolean(date_from)`
 * is a different question from "is a creation-date bound being applied", and
 * the gap is reachable: `CaseFiltersBar` documents that a date input reports
 * every intermediate value as the year is typed — `0002-09-14`, `0020-09-14`,
 * `0202-09-14`, `2026-09-14` — and each one lands in `filters`. The 300ms
 * debounce narrows that window; it does not close it, and a pasted 5-digit
 * year never resolves at all. Measured: `0002-09-14` and `12026-09-14` resolve
 * to `undefined` (years 0-99 collide with `Date`'s 1900+year mapping and fail
 * the round-trip check; a 5-digit year does not match `^(\d{4})-` at all),
 * while `0202-09-14` resolves fine and IS a real bound.
 *
 * Asking the string would therefore head the column `Created`, swap every cell
 * to `created_at` and announce the change — over a list no bound had touched.
 * That is this module's own docstring failing: "a column announcing a filter
 * that is not running."
 *
 * It is not a question a rule of thumb can answer, either. Measured:
 * `9999-12-31` resolves a start but NO end in UTC and America/Los_Angeles
 * (the next local midnight expands past year 9999, which the wire cannot
 * carry) and resolves both in Pacific/Auckland and Asia/Kolkata. Same string,
 * different answer depending on where the viewer is — so the only correct
 * source is the resolution itself.
 *
 * EITHER RESOLVED BOUND COUNTS. `GET /cases` takes `created_after` and
 * `created_before` independently, so "created since 1 Sept" narrows the list
 * exactly as much as a closed range does.
 *
 * A SEARCH SUSPENDS BOTH. `POST /cases/search` accepts no date bounds, so
 * `useCaseList` sends none while `search` is set and `CaseFiltersBar` disables
 * the inputs — but it deliberately KEEPS the range, so it comes back when the
 * box empties. Same predicate the bar greys the inputs on, so the control and
 * the column agree about when the range applies.
 *
 * WHICH FILTERS TO PASS: the ones the list hook actually APPLIED, not the ones
 * pending in the bar. See `useCaseList`'s `appliedFilters`.
 */
export function resolveCaseDateColumn(filters: CaseFilters): CaseDateColumn {
  if (filters.search) return LAST_ACTIVITY_COLUMN;

  // The same two calls `listCases` makes, so the column and the query cannot
  // disagree about whether a bound exists.
  const createdAfter = startOfLocalDay(filters.date_from);
  const createdBefore = exclusiveEndOfLocalDay(filters.date_to);

  return createdAfter || createdBefore ? CREATED_COLUMN : LAST_ACTIVITY_COLUMN;
}
