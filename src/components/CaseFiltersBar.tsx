import { useMemo, useRef } from 'react';
import type { CaseFilters, Team } from '../types/cases';
import type { CaseState } from '../types/cases';
import { debounce } from '../utils/debounce';
import { chipBase, chipActive, chipInactive } from '../lib/ui/chip';

interface CaseFiltersBarProps {
  filters: CaseFilters;
  onChange: (filters: CaseFilters) => void;
  /**
   * When true, render only the state chips and hide the date-range + search
   * inputs. Used by surfaces whose backend endpoint accepts only a state
   * filter (e.g. the admin cross-tenant view), so no control is shown that
   * silently does nothing.
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

const inputClass =
  'px-3 py-1.5 bg-fm-surface-alt border border-fm-border rounded-fm-input text-sm text-fm-text-primary placeholder:text-fm-text-tertiary focus:ring-2 focus:ring-fm-accent focus:border-transparent transition-colors';


export function CaseFiltersBar({ filters, onChange, stateOnly = false, teams }: CaseFiltersBarProps) {
  const debouncedSearch = useMemo(
    () =>
      debounce((value: string) => {
        onChange({ ...filters, search: value || undefined });
      }, 300),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [onChange]
  );

  const searchRef = useRef<HTMLInputElement>(null);

  const handleStateClick = (value: CaseState | '') => {
    onChange({ ...filters, state: value || undefined });
  };

  const handleDateFrom = (value: string) => {
    onChange({ ...filters, date_from: value || undefined });
  };

  const handleDateTo = (value: string) => {
    onChange({ ...filters, date_to: value || undefined });
  };

  const handleTeam = (value: string) => {
    onChange({ ...filters, team_id: value || undefined });
  };

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
          <input
            type="date"
            defaultValue={filters.date_from ?? ''}
            onChange={(e) => handleDateFrom(e.target.value)}
            className={inputClass}
            aria-label="From date"
          />
          <input
            type="date"
            defaultValue={filters.date_to ?? ''}
            onChange={(e) => handleDateTo(e.target.value)}
            className={inputClass}
            aria-label="To date"
          />

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
