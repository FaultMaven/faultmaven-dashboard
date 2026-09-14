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
 * The three numbers in a real calendar day, or `undefined`.
 *
 * ONE parse for both exported functions. The `exclusiveEndOfLocalDay` arm used
 * to run the regex, repeat this destructuring, and then call the other function
 * purely to reuse its validation — four passes over the same string, and two
 * copies of a destructuring that a change to the capture-group order would
 * break in only one visible place.
 *
 * The captures are converted individually rather than with `match.map(Number)`.
 * That produced `[NaN, 2026, 9, 14]` — index 0 is `Number('2026-09-14')` — which
 * then needed `as unknown as [string, number, number, number]` to compile: a
 * double cast asserting a type the value does not have, in a repo whose
 * CLAUDE.md asks for strict TypeScript and no escape hatches. Reading the three
 * captures by name types correctly with no cast at all.
 */
function parseCalendarDay(
  day: string,
): { year: number; month: number; date: number } | undefined {
  const match = CALENDAR_DAY.exec(day);
  if (!match) return undefined;
  return { year: Number(match[1]), month: Number(match[2]), date: Number(match[3]) };
}

/**
 * A local-time instant built from PARTS, never by parsing the string.
 *
 * `new Date('2026-09-14')` is UTC midnight — ECMA-262 reads a date-only ISO
 * string as UTC, while the same string with a time is read as local. That one
 * inconsistency is the entire bug this module exists to avoid, and it is
 * invisible to anyone developing in UTC, which is to say to CI.
 *
 * Returns `undefined` unless the constructed date is the one that was asked
 * for, which is what catches a day that does not exist: `new Date(2026, 1, 30)`
 * rolls forward to 2 March rather than failing, so `2026-02-30` would otherwise
 * silently become a different, real day.
 *
 * It also rejects a year the wire cannot carry. `toISOString()` switches to the
 * EXPANDED form beyond year 9999 — measured, in America/Los_Angeles,
 * `new Date(9999, 11, 32)` serializes as `+010000-01-01T08:00:00.000Z` — which
 * Pydantic's datetime parser refuses, so the list would 422 on a date the
 * picker was happy to accept.
 */
function localMidnight(year: number, month: number, date: number): string | undefined {
  const instant = new Date(year, month - 1, date, 0, 0, 0, 0);

  if (
    instant.getFullYear() !== year
    || instant.getMonth() !== month - 1
    || instant.getDate() !== date
  ) {
    return undefined;
  }

  const iso = instant.toISOString();
  // An expanded-year ISO string starts with a sign; a normal one starts with a
  // digit. Cheaper and more honest than picking a year cutoff by hand.
  return /^\d/.test(iso) ? iso : undefined;
}

/** The first instant of `day` where the viewer is. `undefined` if not a real day. */
export function startOfLocalDay(day: string | undefined): string | undefined {
  if (!day) return undefined;
  const parsed = parseCalendarDay(day);
  return parsed ? localMidnight(parsed.year, parsed.month, parsed.date) : undefined;
}

/**
 * The EXCLUSIVE end of `day` where the viewer is — i.e. the next day's first
 * instant. `undefined` if `day` is not a real day.
 *
 * Named for what it is rather than for the day it is derived from: it is the
 * open end of `[start, end)`, and calling it "end of day" is what leads someone
 * to reach for 23:59:59.999 and reintroduce the sub-millisecond gap.
 *
 * `date + 1` hands month ends, leap days and DST transitions to the platform
 * rather than to string arithmetic — 30 September + 1 is 1 October, and on a DST
 * boundary the result is still the next local midnight. THE DAY ITSELF IS
 * VALIDATED FIRST: stepping past an impossible day would otherwise produce a
 * real instant for a date nobody picked.
 */
export function exclusiveEndOfLocalDay(day: string | undefined): string | undefined {
  if (!day) return undefined;
  const parsed = parseCalendarDay(day);
  if (!parsed) return undefined;
  // Validate the named day before stepping past it. `date + 1` is deliberately
  // NOT round-trip checked against itself — rolling into the next month is the
  // intended behaviour there, and only `localMidnight`'s expanded-year guard
  // still applies.
  if (localMidnight(parsed.year, parsed.month, parsed.date) === undefined) return undefined;

  const next = new Date(parsed.year, parsed.month - 1, parsed.date + 1, 0, 0, 0, 0);
  const iso = next.toISOString();
  return /^\d/.test(iso) ? iso : undefined;
}
