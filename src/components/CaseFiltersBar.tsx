import { useEffect, useMemo, useRef, type Dispatch, type SetStateAction } from 'react';
import type { CaseFilters, Team } from '../types/cases';
import type { CaseState } from '../types/cases';
import { debounce } from '../utils/debounce';
import { chipBase, chipActive, chipInactive } from '../lib/ui/chip';

interface CaseFiltersBarProps {
  filters: CaseFilters;
  /** Accepts an updater as well as a value — see the debounced search below. */
  onChange: Dispatch<SetStateAction<CaseFilters>>;
  /**
   * When true, render only the state chips and hide the search and date inputs.
   * Used by surfaces whose backend endpoint accepts only a state filter (e.g.
   * the admin cross-tenant view), so no control is shown that silently does
   * nothing.
   */
  stateOnly?: boolean;

  /**
   * Teams the caller belongs to (ADR-013 §D4). When provided and non-empty,
   * renders a team filter — selecting a team narrows the list to cases shared
   * with it (the "team case view"). Omitted where team sharing is off, so the
   * control never appears in standalone.
   */
  teams?: Team[];
}

const STATE_OPTIONS: { value: CaseState | ''; label: string }[] = [
  { value: '', label: 'All' },
  { value: 'inquiry', label: 'Inquiry' },
  { value: 'investigating', label: 'Investigating' },
  { value: 'resolved', label: 'Resolved' },
  { value: 'closed', label: 'Closed' },
];

/**
 * Said once, so the tooltip and the announced description cannot disagree.
 *
 * It NAMES the creation-date range rather than saying "this filter", because
 * it no longer covers every filter it sits above: the state chips work during
 * a search as of #166, and a bare "this filter" above a row of live chips
 * reads as applying to them.
 */
const SEARCH_ONLY_REASON =
  'The creation-date range does not apply to a text search — clear the search box to use it.';

const inputClass =
  'px-3 py-1.5 bg-fm-surface-alt border border-fm-border rounded-fm-input text-sm text-fm-text-primary placeholder:text-fm-text-tertiary focus:ring-2 focus:ring-fm-accent focus:border-transparent transition-colors';


export function CaseFiltersBar({ filters, onChange, stateOnly = false, teams }: CaseFiltersBarProps) {
  /**
   * The debounced search reads the LATEST filters from a ref, so the callback
   * itself never goes stale and never needs replacing.
   *
   * The first version closed over `filters` and depended on `[onChange,
   * filters]` — correct about the stale closure it was fixing (memoizing on
   * `[onChange]` alone captured first-render filters and typing wiped the active
   * chips), but it made a NEW debounced function on every filter change, and the
   * cleanup then cancelled the pending one. So picking a date within 300ms of
   * typing destroyed the queued search: the box still read `payment` — it is
   * uncontrolled — while the list beside it was date-filtered across everything,
   * with nothing on screen admitting the disagreement.
   *
   * A ref fixes both at once. One debounced function for the life of the bar,
   * cancelled only on unmount, and it composes against whatever the filters are
   * when it fires rather than what they were when it was created.
   */
  const debouncedSearch = useMemo(
    () =>
      debounce((value: string) => {
        // FUNCTIONAL, so it composes against the filters at FIRE time. The
        // first version closed over `filters` and depended on `[onChange,
        // filters]`, which was right about the stale closure it fixed but built
        // a new debounced function on every filter change — and the cleanup
        // cancelled the pending one. Picking a date within 300ms of typing threw
        // the queued search away, leaving the (uncontrolled) box reading
        // `payment` while the list beside it was filtered by date across
        // everything, with nothing on screen admitting the disagreement.
        //
        // A ref would also fix the staleness, but reading `ref.current` during
        // render — which a `useMemo` factory does — is refused by lint, and
        // rightly. This has neither problem and is the shape React already uses.
        onChange((prev) => ({ ...prev, search: value || undefined }));
      }, 300),
    [onChange]
  );

  // Only on unmount now — a pending fire is no longer built on filters that can
  // have moved, so there is nothing to invalidate while the bar is alive.
  useEffect(() => () => debouncedSearch.cancel(), [debouncedSearch]);

  const searchRef = useRef<HTMLInputElement>(null);

  const handleStateClick = (value: CaseState | '') => {
    onChange((prev) => ({ ...prev, state: value || undefined }));
  };

  const handleTeam = (value: string) => {
    onChange((prev) => ({ ...prev, team_id: value || undefined }));
  };

  /**
   * DEBOUNCED, like the search box beside them.
   *
   * A date input reports every intermediate value as the year is typed —
   * 0002-09-14, 0020-09-14, 0202-09-14, 2026-09-14 — and each one landed in
   * `filters`, whose new identity re-creates `loadPage` and re-runs the effect.
   * So typing a year fired four `GET /cases` round trips, one of which sent
   * `created_after=0202-09-...` as a real bound (year 202 survives the
   * round-trip guard — it is a perfectly valid, if unlikely, date). It also
   * reset the pager to page 0 each time, so typing a date while on page 3 was
   * unrecoverable.
   *
   * Same 300ms as the search, and the same functional update, so a date landing
   * mid-flight composes against whatever the filters are when it fires.
   */
  const debouncedDateFrom = useMemo(
    () =>
      debounce((value: string) => {
        onChange((prev) => ({ ...prev, date_from: value || undefined }));
      }, 300),
    [onChange]
  );

  const debouncedDateTo = useMemo(
    () =>
      debounce((value: string) => {
        onChange((prev) => ({ ...prev, date_to: value || undefined }));
      }, 300),
    [onChange]
  );

  useEffect(() => () => debouncedDateFrom.cancel(), [debouncedDateFrom]);
  useEffect(() => () => debouncedDateTo.cancel(), [debouncedDateTo]);

  /**
   * Free text and date bounds cannot both apply, so say so rather than accept a
   * date and drop it. `POST /cases/search` takes a query, a limit, a team and a
   * state — no dates — and filtering its top-N matches here would hide results
   * while reporting a count drawn from the unfiltered set.
   *
   * READ FROM `filters.search`, NOT from a `searchMode` the list hook sets after
   * a request settles. That flag is a property of the LAST RESPONSE, and it is
   * wrong in both directions the moment one fails: a rejected search leaves it
   * false, so the dates stay enabled while `filters.search` is set and the next
   * pick is silently dropped — #51 again, in miniature, in the control built to
   * end it. A rejected list-load after clearing the box leaves it true, so the
   * dates stay disabled with no search running and no way back but another
   * filter change.
   *
   * `filters.search` cannot drift like that: it is the same value the request
   * branches on. An earlier comment justified the hook flag by saying reading
   * the search would grey the inputs out "during the 300ms debounce" — but the
   * debounce is what SETS `filters.search`, so it is only ever set when a search
   * is what happens next. The window it was guarding against does not exist.
   *
   * The bounds are KEPT in `filters` while disabled, not cleared: clearing them
   * would silently discard the user's range the moment they typed a character,
   * and they are meant to come back when the search box empties.
   */
  const searching = Boolean(filters.search);

  /**
   * `POST /cases/search` honours a query, a limit, a team AND — since contract
   * 3.9.0 — a state. It accepts NO date bounds, and that asymmetry is the
   * whole reason one control is disabled here and the other is not.
   *
   * The state chips were disabled too until #166. The field had always been
   * DECLARED on `CaseSearchRequest` and read by nothing, so sending it was
   * accepted, ignored, and answered 200 with unfiltered results — #51 restated
   * one layer down. Greying the chips out was the honest response to that: a
   * control that cannot work should not look like it can. 3.9.0 made the
   * server apply the field, `searchCases` now sends it, so the chips are live
   * and searching narrows by state like every other list does.
   *
   * The DATE inputs stay disabled, permanently as far as this contract goes.
   * Not an oversight and not symmetry for its own sake — `CaseSearchRequest`
   * has no date field to send, so re-enabling them would recreate exactly the
   * defect the state chips just stopped having.
   */
  const datesDisabled = searching;


  const showTeamFilter = !stateOnly && teams && teams.length > 0;

  return (
    <div className="flex flex-wrap items-center gap-3 mb-4">
      {/*
        ON SCREEN, not only in a tooltip and not only to a screen reader.
        A `title` does not render on a DISABLED control in Chrome or Safari
        (pointer events are suppressed), and `sr-only` is invisible by
        definition — so the previous version left a sighted mouse user looking
        at greyed-out controls with no explanation anywhere, which is the state
        it claimed to have fixed. One sentence, rendered, and referenced by
        every control it applies to.

        Rendered on the same condition as the controls it explains — `searching
        && !stateOnly`, not `searching` alone. It used to cover the chips too,
        and now that they stay live it would otherwise be a sentence about
        date inputs that a `stateOnly` bar does not render, explaining nothing
        the reader can see.
      */}
      {datesDisabled && !stateOnly && (
        <p
          id="search-only-reason"
          className="basis-full text-fm-xs text-fm-text-tertiary -mb-1"
        >
          {SEARCH_ONLY_REASON}
        </p>
      )}
      <div className="flex gap-1.5">
        {STATE_OPTIONS.map(({ value, label }) => {
          const isActive = (filters.state ?? '') === value;
          return (
            <button
              key={value}
              onClick={() => handleStateClick(value)}
              className={`${chipBase} ${isActive ? chipActive : chipInactive}`}
            >
              {label}
            </button>
          );
        })}
      </div>

      {showTeamFilter && (
        <select
          value={filters.team_id ?? ''}
          onChange={(e) => handleTeam(e.target.value)}
          className={inputClass}
          aria-label="Filter by team"
        >
          <option value="">All teams</option>
          {teams.map((team) => (
            <option key={team.team_id} value={team.team_id}>
              {team.name}
            </option>
          ))}
        </select>
      )}

      {!stateOnly && (
        <>
          {/*
            Restored with contract 3.8.0, which BINDS `created_after`/
            `created_before` on `GET /cases`. The first version of these inputs
            sent `date_from`/`date_to`, which the route never declared and
            FastAPI dropped without a word — a filter that looked like it worked
            and did nothing, deleted rather than left lying (#51).

            `value`, not `defaultValue`: these are controlled now, because the
            pair constrains each other through min/max and an uncontrolled input
            would keep showing a bound the other one has since invalidated.

            `min`/`max` link the pair, but ONLY as a hint: they grey out the
            calendar's out-of-range days and set `:out-of-range`, and neither
            blocks a TYPED value — so an inverted range still reaches the
            server, which refuses it with a 422. That refusal is the guarantee;
            this is the nudge. One-directional on purpose, too: a `max` on
            `from` makes an existing range impossible to move forward through
            the calendar without clearing `to` first.
          */}
          {/*
            ONE GROUP, with the word that says what the pair is FOR. Two bare
            date pickers side by side name neither their subject nor their
            direction: nothing on screen said whether they bounded creation or
            activity, or which end was which, and an `aria-label` answers that
            only for a screen reader. The group also keeps the pair from
            splitting across lines when the bar wraps, which is where a
            "from"/"to" reading breaks down completely.
          */}
          <div className={`flex items-center gap-2 ${datesDisabled ? 'opacity-50' : ''}`}>
            <span className="text-fm-xs text-fm-text-tertiary uppercase tracking-wide">
              Created
            </span>
            {/* A `title` on this wrapper was the only carrier of the reason, and
                assistive technology does not announce one on a non-interactive
                element — a screen-reader user heard "Created from, edit text,
                dimmed" and nothing else, and a keyboard-only sighted user could
                not hover it either. Rendered as real text instead, referenced
                by both inputs, and only while it applies. */}

            <input
              type="date"
              defaultValue={filters.date_from ?? ''}
              key={`from-${filters.date_from ?? ''}`}
              max={filters.date_to || undefined}
              onChange={(e) => debouncedDateFrom(e.target.value)}
              disabled={datesDisabled}
              aria-describedby={datesDisabled ? 'search-only-reason' : undefined}
              title={datesDisabled ? SEARCH_ONLY_REASON : undefined}
              className={`${inputClass} disabled:cursor-not-allowed`}
              aria-label="Created from"
            />
            <span className="text-fm-text-tertiary" aria-hidden="true">
              –
            </span>
            <input
              type="date"
              defaultValue={filters.date_to ?? ''}
              key={`to-${filters.date_to ?? ''}`}
              min={filters.date_from || undefined}
              onChange={(e) => debouncedDateTo(e.target.value)}
              disabled={datesDisabled}
              aria-describedby={datesDisabled ? 'search-only-reason' : undefined}
              title={datesDisabled ? SEARCH_ONLY_REASON : undefined}
              className={`${inputClass} disabled:cursor-not-allowed`}
              aria-label="Created to"
            />
            {/*
              A WAY OUT, and it stays enabled while the dates themselves are not.
              A range set before a search could not be removed: both inputs are
              disabled during one, and the range is deliberately KEPT so it
              returns when the box empties — so the only route back was to clear
              the search, watch the stale range silently re-apply, and then
              empty two inputs by hand. Meanwhile the empty state was saying
              "Clear the filters to see everything" with no control on the page
              that did it.
            */}
            {(filters.date_from || filters.date_to) && (
              <button
                type="button"
                onClick={() =>
                  onChange((prev) => ({
                    ...prev,
                    date_from: undefined,
                    date_to: undefined,
                  }))
                }
                className="text-fm-xs text-fm-text-tertiary hover:text-fm-text-primary underline underline-offset-2 rounded-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-fm-accent"
              >
                Clear
                <span className="sr-only"> the creation-date range</span>
              </button>
            )}
          </div>

          <input
            ref={searchRef}
            type="search"
            defaultValue={filters.search ?? ''}
            onChange={(e) => debouncedSearch(e.target.value)}
            placeholder="Search cases..."
            className={`flex-1 min-w-[200px] ${inputClass}`}
            aria-label="Search cases"
          />
        </>
      )}
    </div>
  );
}
