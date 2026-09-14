/**
 * A calendar day the user picked → the two instants the API filters on.
 *
 * `GET /cases` bounds `created_at` with `created_after`/`created_before`, and
 * those are INSTANTS, not days (contract 3.8.0). The server deliberately does
 * not guess: it cannot know which day `2026-09-14` meant, because a day is only
 * a day in some timezone. So resolving it is the client's job, and this is
 * where the resolution lives.
 *
 * IN THE VIEWER'S OWN TIMEZONE, which is the whole point. "Cases from today" has
 * to mean the day the person is having. A user in UTC+13 picking today and
 * getting a window that started thirteen hours into yesterday, and ends before
 * their afternoon, would read as a broken filter rather than a timezone
 * subtlety — and they would be right.
 *
 * THE WINDOW IS HALF-OPEN, matching the server: `[created_after,
 * created_before)`. So the upper bound is the first instant of the day AFTER
 * the one chosen — "1 Sept to 1 Sept" sends 1 Sept 00:00 and 2 Sept 00:00, and
 * covers every microsecond of 1 September.
 *
 * WHY NOT 23:59:59.999, WHICH IS THE OBVIOUS ANSWER. Because it is wrong by
 * 999 microseconds a day, silently. `created_at` is microsecond-precision on
 * both Postgres and SQLite, while `Date.prototype.toISOString` stops at
 * milliseconds — there is no string this side can produce that means "the last
 * instant of the day". A case created at 23:59:59.9997 would sit outside an
 * inclusive bound of 23:59:59.999 and vanish from a filter that named its day.
 * Half-open has no such gap, and adjacent ranges neither overlap nor skip.
 */

/** `YYYY-MM-DD`, the only shape `<input type="date">` ever produces. */
const CALENDAR_DAY = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * Build a local-time instant from the PARTS, never by parsing the string.
 *
 * `new Date('2026-09-14')` is UTC midnight — ECMA-262 reads a date-only ISO
 * string as UTC, while the same string with a time is read as local. That one
 * inconsistency is the entire bug this module exists to avoid, and it is
 * invisible to anyone developing in UTC, which is to say to CI.
 *
 * Returns `undefined` for anything that is not a real day. The round-trip check
 * is what catches `2026-02-30`: the Date constructor rolls it forward to 2 March
 * rather than failing, so a non-existent day would otherwise silently become a
 * different, existing one.
 */
function localInstant(
  day: string,
  hours: number,
  minutes: number,
  seconds: number,
  ms: number,
): string | undefined {
  const match = CALENDAR_DAY.exec(day);
  if (!match) return undefined;

  const [, year, month, date] = match.map(Number) as unknown as [string, number, number, number];
  const instant = new Date(year, month - 1, date, hours, minutes, seconds, ms);

  if (
    instant.getFullYear() !== year
    || instant.getMonth() !== month - 1
    || instant.getDate() !== date
  ) {
    return undefined;
  }

  return instant.toISOString();
}

/** The first instant of `day` where the viewer is. `undefined` if not a real day. */
export function startOfLocalDay(day: string | undefined): string | undefined {
  return day ? localInstant(day, 0, 0, 0, 0) : undefined;
}

/**
 * The EXCLUSIVE end of `day` where the viewer is — i.e. the next day's first
 * instant. `undefined` if `day` is not a real day.
 *
 * Named for what it is rather than for the day it is derived from: it is the
 * open end of `[start, end)`, and calling it "end of day" is what leads someone
 * to reach for 23:59:59.999 and reintroduce the sub-millisecond gap.
 *
 * Built by adding a day to the local midnight rather than by string arithmetic,
 * so month ends, leap days and DST transitions are the platform's problem and
 * not this module's. `new Date(2026, 8, 31)` with a day added is 1 October, and
 * on a DST boundary the result is still the next local midnight.
 */
export function exclusiveEndOfLocalDay(day: string | undefined): string | undefined {
  if (!day) return undefined;
  const match = CALENDAR_DAY.exec(day);
  if (!match) return undefined;

  const [, year, month, date] = match.map(Number) as unknown as [string, number, number, number];
  // Validate the day the caller actually named before stepping past it, or
  // `2026-02-30` would quietly become 2 March and bound a range nobody picked.
  if (localInstant(day, 0, 0, 0, 0) === undefined) return undefined;

  return new Date(year, month - 1, date + 1, 0, 0, 0, 0).toISOString();
}
