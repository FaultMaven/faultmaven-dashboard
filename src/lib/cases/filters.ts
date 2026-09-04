import type { CaseFilters } from '../../types/cases';

/**
 * Is a case list showing "everything you have", as opposed to a narrowed view?
 *
 * The distinction decides what an EMPTY result means. With no filter, empty
 * means "you have no cases" — a person with nothing to review, who should be
 * starting an investigation rather than looking at a blank table (ADR-016 D6).
 * With a filter, empty means "nothing matched", and taking that person
 * somewhere else would throw away the query they just typed.
 *
 * Written over `Object.values` rather than as a list of field names, so a
 * filter added to `CaseFilters` later cannot silently fail to count. `''` is
 * treated as absent because the filter bar writes the empty string when a
 * select is cleared.
 */
export function isUnfiltered(filters: CaseFilters): boolean {
  return Object.values(filters).every(
    (value) => value === undefined || value === null || value === '',
  );
}
