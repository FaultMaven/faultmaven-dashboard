import { describe, it, expect } from 'vitest';
import { startOfLocalDay, exclusiveEndOfLocalDay } from '../../../lib/cases/dateRange';

/**
 * The conversion the SERVER refuses to do, and for a good reason: it cannot know
 * which day `2026-09-14` meant, because a day is only a day in some timezone.
 *
 * Everything here is asserted RELATIVE TO THE RUNNING TIMEZONE rather than
 * against hard-coded UTC strings. A test that expected `2026-09-14T00:00:00.000Z`
 * would pass in CI (which runs in UTC) and fail for every contributor east or
 * west of it — and, worse, would keep passing if the implementation switched to
 * UTC midnight, which is precisely the bug.
 */
describe('resolving a picked day to instants', () => {
  it('starts at the first local instant of the day, not UTC midnight', () => {
    const iso = startOfLocalDay('2026-09-14');
    const instant = new Date(iso!);

    expect(instant.getFullYear()).toBe(2026);
    expect(instant.getMonth()).toBe(8);
    expect(instant.getDate()).toBe(14);
    expect(instant.getHours()).toBe(0);
    expect(instant.getMinutes()).toBe(0);
    expect(instant.getSeconds()).toBe(0);
    expect(instant.getMilliseconds()).toBe(0);
  });

  it('ends at the NEXT local midnight, because the server window is half-open', () => {
    // 23:59:59.999 is the obvious answer and it is wrong by 999 microseconds a
    // day: `created_at` is microsecond-precision, `toISOString` stops at
    // milliseconds, so no string this side can produce means "the last instant
    // of the day". Half-open has no such gap.
    const instant = new Date(exclusiveEndOfLocalDay('2026-09-14')!);

    expect(instant.getDate()).toBe(15);
    expect(instant.getHours()).toBe(0);
    expect(instant.getMinutes()).toBe(0);
    expect(instant.getSeconds()).toBe(0);
    expect(instant.getMilliseconds()).toBe(0);
  });

  it('leaves no gap a case can fall into, which is the whole point', () => {
    // The sub-millisecond case that motivated half-open: a row created in the
    // final microseconds of the chosen day must be INSIDE `[start, end)`.
    const start = new Date(startOfLocalDay('2026-09-14')!).getTime();
    const end = new Date(exclusiveEndOfLocalDay('2026-09-14')!).getTime();

    // JS cannot hold microseconds, so assert the boundary that stands in for
    // it: the last representable millisecond of the day is strictly inside.
    const lastMillisecond = end - 1;
    expect(lastMillisecond).toBeGreaterThanOrEqual(start);
    expect(lastMillisecond).toBeLessThan(end);

    // And the next day's first instant is exactly the open end — adjacent
    // ranges meet without overlapping.
    expect(new Date(startOfLocalDay('2026-09-15')!).getTime()).toBe(end);
  });

  it('steps over a month end and a leap day without string arithmetic', () => {
    expect(new Date(exclusiveEndOfLocalDay('2026-09-30')!).getMonth()).toBe(9); // October
    expect(new Date(exclusiveEndOfLocalDay('2026-09-30')!).getDate()).toBe(1);
    expect(new Date(exclusiveEndOfLocalDay('2026-12-31')!).getFullYear()).toBe(2027);
    expect(new Date(exclusiveEndOfLocalDay('2028-02-28')!).getDate()).toBe(29); // leap
  });

  it('sends an instant, in UTC, which is what the wire carries', () => {
    // Local parts going in, an absolute instant going out — the server compares
    // against a timestamptz and must not have to guess an offset.
    expect(startOfLocalDay('2026-09-14')).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    expect(exclusiveEndOfLocalDay('2026-09-14')).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
  });

  it('covers the whole day and nothing outside it', () => {
    const start = new Date(startOfLocalDay('2026-09-14')!).getTime();
    const end = new Date(exclusiveEndOfLocalDay('2026-09-14')!).getTime();

    // A DST day is 23 or 25 hours, so this asserts the SHAPE, not the length.
    expect(end).toBeGreaterThan(start);
    // The previous day's window closes exactly where this one opens.
    expect(new Date(exclusiveEndOfLocalDay('2026-09-13')!).getTime()).toBe(start);
  });

  it('treats an unset value as no bound at all', () => {
    // An empty date input must clear the filter, not send an epoch or "today".
    expect(startOfLocalDay(undefined)).toBeUndefined();
    expect(exclusiveEndOfLocalDay(undefined)).toBeUndefined();
    expect(startOfLocalDay('')).toBeUndefined();
    expect(exclusiveEndOfLocalDay('')).toBeUndefined();
  });

  it('refuses a day that does not exist rather than rolling it forward', () => {
    // `new Date(2026, 1, 30)` is 2 March — the constructor normalises instead of
    // failing, so an impossible day would silently become a different real one
    // and the list would be filtered by a date the user never picked.
    expect(startOfLocalDay('2026-02-30')).toBeUndefined();
    expect(exclusiveEndOfLocalDay('2026-02-30')).toBeUndefined();
    expect(startOfLocalDay('2026-13-01')).toBeUndefined();
    expect(startOfLocalDay('2026-00-10')).toBeUndefined();
  });

  it('accepts a real leap day, so the guard is not just rejecting everything', () => {
    expect(startOfLocalDay('2028-02-29')).toBeDefined();
    expect(startOfLocalDay('2026-02-29')).toBeUndefined();
  });

  it('refuses anything that is not a calendar day', () => {
    for (const value of ['14/09/2026', '2026-9-14', 'today', '2026-09-14T00:00:00Z']) {
      expect(startOfLocalDay(value), value).toBeUndefined();
    }
  });
});
