import { useEffect, useMemo, useRef } from 'react';
import type { CaseFilters, Team } from '../types/cases';
import type { CaseState } from '../types/cases';
import { debounce } from '../utils/debounce';
import { chipBase, chipActive, chipInactive } from '../lib/ui/chip';

interface CaseFiltersBarProps {
  filters: CaseFilters;
  onChange: (filters: CaseFilters) => void;
  /**
   * When true, render only the state chips and hide the search and date inputs.
   * Used by surfaces whose backend endpoint accepts only a state filter (e.g.
   * the admin cross-tenant view), so no control is shown that silently does
   * nothing.
   */
  stateOnly?: boolean;
  /**
   * True while the list is showing free-text search results. The date inputs
   * are DISABLED then, because `POST /cases/search` accepts no date bounds —
   * the same rule `stateOnly` follows, applied to a state rather than a surface.
   */
  searchMode?: boolean;
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

const inputClass =
  'px-3 py-1.5 bg-fm-surface-alt border border-fm-border rounded-fm-input text-sm text-fm-text-primary placeholder:text-fm-text-tertiary focus:ring-2 focus:ring-fm-accent focus:border-transparent transition-colors';


export function CaseFiltersBar({
  filters,
  onChange,
  stateOnly = false,
  searchMode = false,
  teams,
}: CaseFiltersBarProps) {
  // `filters` is in the dependency list so the debounced search callback always
  // closes over the *current* filters. Memoizing on `[onChange]` alone captured
  // the first-render filters, so typing in search wiped the active state/archived
  // chips.
  const debouncedSearch = useMemo(
    () =>
      debounce((value: string) => {
        onChange({ ...filters, search: value || undefined });
      }, 300),
    [onChange, filters]
  );

  // Cancel any pending fire when the debounced callback is replaced (filters or
  // onChange changed) or the bar unmounts — otherwise a queued search built on
  // now-stale filters could land after the change that superseded it.
  useEffect(() => () => debouncedSearch.cancel(), [debouncedSearch]);

  const searchRef = useRef<HTMLInputElement>(null);

  const handleStateClick = (value: CaseState | '') => {
    onChange({ ...filters, state: value || undefined });
  };

  const handleTeam = (value: string) => {
    onChange({ ...filters, team_id: value || undefined });
  };

  const handleDateFrom = (value: string) => {
    onChange({ ...filters, date_from: value || undefined });
  };

  const handleDateTo = (value: string) => {
    onChange({ ...filters, date_to: value || undefined });
  };

  /**
   * Free text and date bounds cannot both apply, so say so rather than accept a
   * date and drop it. `POST /cases/search` takes a query, a limit and a team —
   * no dates — and filtering its top-N matches here would hide results while
   * reporting a count drawn from the unfiltered set.
   *
   * The bounds are KEPT in `filters` while disabled, not cleared: clearing them
   * would silently discard the user's range the moment they typed a character,
   * and they are meant to come back when the search box empties.
   */
  const datesDisabled = searchMode;
  const datesTitle = datesDisabled
    ? 'Date filters do not apply to a text search — clear the search box to use them.'
    : undefined;

  const showTeamFilter = !stateOnly && teams && teams.length > 0;

  return (
    <div className="flex flex-wrap items-center gap-3 mb-4">
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

            The pair is linked so the browser will not offer an inverted range
            at all — cheaper and clearer than accepting one and explaining the
            empty list afterwards.
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
          <div
            className={`flex items-center gap-2 ${datesDisabled ? 'opacity-50' : ''}`}
            title={datesTitle}
          >
            <span className="text-fm-xs text-fm-text-tertiary uppercase tracking-wide">
              Created
            </span>
            <input
              type="date"
              value={filters.date_from ?? ''}
              max={filters.date_to || undefined}
              onChange={(e) => handleDateFrom(e.target.value)}
              disabled={datesDisabled}
              className={`${inputClass} disabled:cursor-not-allowed`}
              aria-label="Created from"
            />
            <span className="text-fm-text-tertiary" aria-hidden="true">
              –
            </span>
            <input
              type="date"
              value={filters.date_to ?? ''}
              min={filters.date_from || undefined}
              onChange={(e) => handleDateTo(e.target.value)}
              disabled={datesDisabled}
              className={`${inputClass} disabled:cursor-not-allowed`}
              aria-label="Created to"
            />
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
