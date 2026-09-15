import { describe, it, expect } from 'vitest';
import {
  resolveCaseDateColumn,
  CREATED_COLUMN,
  LAST_ACTIVITY_COLUMN,
} from '../../../lib/cases/dateColumn';
import { startOfLocalDay, exclusiveEndOfLocalDay } from '../../../lib/cases/dateRange';

/**
 * The one question, asked in one place: is the list being narrowed by CREATION
 * DATE right now? (faultmaven-dashboard#155)
 *
 * Asserted against the exported CONSTANTS rather than against the strings
 * `'Created'` and `'created_at'`. A test spelling either half out is a second
 * copy of the answer, and the whole point of resolving it once is that there is
 * no second copy to disagree.
 */
describe('which date the case list shows', () => {
  it('shows last activity when nothing is filtering by creation date', () => {
    expect(resolveCaseDateColumn({})).toBe(LAST_ACTIVITY_COLUMN);
  });

  it('is unmoved by the filters that are not about creation date', () => {
    // A state chip, a team and a source all narrow the list; none of them
    // narrows it by `created_at`, so none of them is a reason to stop showing
    // the column people actually scan a list with.
    expect(resolveCaseDateColumn({ state: 'resolved' })).toBe(LAST_ACTIVITY_COLUMN);
    expect(resolveCaseDateColumn({ team_id: 't1' })).toBe(LAST_ACTIVITY_COLUMN);
    expect(resolveCaseDateColumn({ source: 'copilot' })).toBe(LAST_ACTIVITY_COLUMN);
  });

  it('shows Created for a closed range', () => {
    expect(resolveCaseDateColumn({ date_from: '2026-09-01', date_to: '2026-09-01' })).toBe(
      CREATED_COLUMN,
    );
  });

  it('shows Created for a LOWER bound alone — one bound is a real filter', () => {
    // `GET /cases` takes `created_after` and `created_before` independently, so
    // "created since 1 Sept" narrows the list exactly as much as a closed range
    // does. A rule that waited for both would leave the half-open case showing
    // last activity — the very state this fixes.
    expect(resolveCaseDateColumn({ date_from: '2026-09-01' })).toBe(CREATED_COLUMN);
  });

  it('shows Created for an UPPER bound alone, for the same reason', () => {
    expect(resolveCaseDateColumn({ date_to: '2026-09-01' })).toBe(CREATED_COLUMN);
  });

  it('goes back to last activity when the range is cleared', () => {
    // `CaseFiltersBar`'s Clear button writes `undefined`, not empty strings.
    expect(resolveCaseDateColumn({ date_from: undefined, date_to: undefined })).toBe(
      LAST_ACTIVITY_COLUMN,
    );
  });

  /**
   * APPLIED, not merely SET — and a search is where the two come apart.
   *
   * `POST /cases/search` accepts no date bounds, so `useCaseList` sends none
   * while `filters.search` is set. The bar disables the inputs for exactly that
   * reason and deliberately KEEPS the range in `filters`, so it returns when the
   * box empties. Reading `date_from` alone would therefore head the column
   * `Created` over a list nothing had filtered by creation date: a column
   * announcing a filter that is not running, which is #51's shape again.
   */
  describe('a search suspends the range, so it suspends the column too', () => {
    it('shows last activity while a search is running, range or no range', () => {
      expect(
        resolveCaseDateColumn({ date_from: '2026-09-01', date_to: '2026-09-02', search: 'payment' }),
      ).toBe(LAST_ACTIVITY_COLUMN);
      expect(resolveCaseDateColumn({ date_from: '2026-09-01', search: 'payment' })).toBe(
        LAST_ACTIVITY_COLUMN,
      );
    });

    it('brings Created back when the search box empties and the kept range applies again', () => {
      // The bar keeps the bounds precisely so they come back. The column has to
      // come back with them, or clearing a search would leave the list filtered
      // by a date it no longer shows.
      expect(resolveCaseDateColumn({ date_from: '2026-09-01', search: undefined })).toBe(
        CREATED_COLUMN,
      );
      expect(resolveCaseDateColumn({ date_from: '2026-09-01', search: '' })).toBe(CREATED_COLUMN);
    });
  });

  /**
   * A BOUND THAT RESOLVES, not a string that looks like a date.
   *
   * `listCases` sends `created_after`/`created_before` only when
   * `startOfLocalDay`/`exclusiveEndOfLocalDay` return something, and both
   * return `undefined` for a day `dateRange.ts` rejects. Reading the raw string
   * therefore headed the column `Created`, swapped every cell to `created_at`
   * and announced the change over a list no bound had touched — this module's
   * own docstring failing.
   *
   * It is reachable: `CaseFiltersBar` documents that a date input reports every
   * intermediate value as the year is typed, `0002-09-14` among them, and each
   * lands in `filters`.
   */
  describe('only a bound that actually resolves counts', () => {
    it('stays on Last Activity for a year still being typed', () => {
      // Years 0-99 collide with `Date`'s 1900+year mapping and fail
      // `dateRange`'s round-trip check, so NO `created_after` is sent.
      expect(startOfLocalDay('0002-09-14')).toBeUndefined();
      expect(resolveCaseDateColumn({ date_from: '0002-09-14' })).toBe(LAST_ACTIVITY_COLUMN);

      expect(exclusiveEndOfLocalDay('0020-09-14')).toBeUndefined();
      expect(resolveCaseDateColumn({ date_to: '0020-09-14' })).toBe(LAST_ACTIVITY_COLUMN);

      // Neither end resolves, so neither end is a reason to swap.
      expect(
        resolveCaseDateColumn({ date_from: '0002-09-14', date_to: '0020-09-14' }),
      ).toBe(LAST_ACTIVITY_COLUMN);
    });

    it('stays on Last Activity for a year the wire cannot carry', () => {
      // A pasted 5-digit year never matches `^(\d{4})-`, so it is permanently
      // unresolvable while it sits in `filters` — not a transient at all.
      expect(startOfLocalDay('12026-09-14')).toBeUndefined();
      expect(resolveCaseDateColumn({ date_from: '12026-09-14' })).toBe(LAST_ACTIVITY_COLUMN);
    });

    it('DOES swap for an improbable year that nonetheless resolves', () => {
      // The rule is "did it resolve", not "does it look sensible". Year 202 is
      // a perfectly valid bound and the request carries it, so the column must
      // say so — an implementation that sanity-checked the year would get this
      // one wrong in the other direction.
      expect(startOfLocalDay('0202-09-14')).toBeDefined();
      expect(resolveCaseDateColumn({ date_from: '0202-09-14' })).toBe(CREATED_COLUMN);
    });

    it('agrees with the resolution even where it is timezone-dependent', () => {
      // `9999-12-31` resolves a START everywhere, but its exclusive END is the
      // next local midnight, which expands past year 9999 in UTC and
      // America/Los_Angeles and does not in Pacific/Auckland or Asia/Kolkata.
      // So the correct answer for `date_to: '9999-12-31'` alone genuinely
      // differs by viewer, and this asserts the AGREEMENT rather than a verdict.
      const resolves = exclusiveEndOfLocalDay('9999-12-31') !== undefined;
      expect(resolveCaseDateColumn({ date_to: '9999-12-31' })).toBe(
        resolves ? CREATED_COLUMN : LAST_ACTIVITY_COLUMN,
      );
    });

    it('asks exactly what `listCases` asks, for every bound it is given', () => {
      // The binding that keeps the two from drifting: for each day, the column
      // swaps precisely when at least one of the two functions the request uses
      // returns a value.
      for (const day of ['2026-09-14', '0202-09-14', '0002-09-14', '12026-09-14', 'nonsense']) {
        const sent = Boolean(startOfLocalDay(day)) || Boolean(exclusiveEndOfLocalDay(day));
        expect(resolveCaseDateColumn({ date_from: day, date_to: day })).toBe(
          sent ? CREATED_COLUMN : LAST_ACTIVITY_COLUMN,
        );
      }
    });
  });

  it('names a field the row actually carries, and a label that says which', () => {
    // The two halves travel together; these are the only two answers there are.
    expect(CREATED_COLUMN).toEqual({ field: 'created_at', label: 'Created' });
    expect(LAST_ACTIVITY_COLUMN).toEqual({ field: 'last_activity_at', label: 'Last Activity' });
  });
});
