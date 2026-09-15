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
 * APPLIED, not merely set — which is not the same thing, and the difference is
 * visible on screen.
 *
 * Either bound alone is a real range: `GET /cases` takes `created_after` and
 * `created_before` independently (see `dateRange.ts`), so "created since 1
 * Sept" with no upper bound narrows the list exactly as much as a closed range
 * does, and must show the same column.
 *
 * A SEARCH SUSPENDS BOTH. `POST /cases/search` accepts no date bounds, so
 * `useCaseList` sends none while `filters.search` is set and `CaseFiltersBar`
 * disables the inputs — but it deliberately KEEPS the range in `filters`, so it
 * comes back when the box empties. Reading `date_from` alone would therefore
 * put a `Created` header over a list that nothing had filtered by creation
 * date: a column announcing a filter that is not running. Same predicate the
 * bar greys the inputs on, so the control and the column agree about when the
 * range applies.
 */
export function resolveCaseDateColumn(filters: CaseFilters): CaseDateColumn {
  const creationDateApplied = Boolean((filters.date_from || filters.date_to) && !filters.search);
  return creationDateApplied ? CREATED_COLUMN : LAST_ACTIVITY_COLUMN;
}
