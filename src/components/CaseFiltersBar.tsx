import { useMemo, useRef } from 'react';
import type { CaseFilters } from '../types/cases';
import type { CaseState } from '../types/cases';
import { debounce } from '../utils/debounce';
import { chipBase, chipActive, chipInactive } from '../lib/ui/chip';

interface CaseFiltersBarProps {
  filters: CaseFilters;
  onChange: (filters: CaseFilters) => void;
  /**
   * When true, render only the state chips and hide the search input. Used by
   * surfaces whose backend endpoint accepts only a state filter (e.g. the admin
   * cross-tenant view), so no control is shown that silently does nothing.
   */
  stateOnly?: boolean;
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


export function CaseFiltersBar({ filters, onChange, stateOnly = false }: CaseFiltersBarProps) {
  // `filters` is in the dependency list so the debounced search callback always
  // closes over the *current* filters. Memoizing on `[onChange]` alone captured
  // the first-render filters, so typing in search wiped the active state/archived
  // chips. (Cancelling a pending debounce when other filters change is a
  // separate follow-up — debounce has no cancel() yet.)
  const debouncedSearch = useMemo(
    () =>
      debounce((value: string) => {
        onChange({ ...filters, search: value || undefined });
      }, 300),
    [onChange, filters]
  );

  const searchRef = useRef<HTMLInputElement>(null);

  const handleStateClick = (value: CaseState | '') => {
    onChange({ ...filters, state: value || undefined });
  };

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

      {!stateOnly && (
        <input
          ref={searchRef}
          type="search"
          defaultValue={filters.search ?? ''}
          onChange={(e) => debouncedSearch(e.target.value)}
          placeholder="Search cases..."
          className={`flex-1 min-w-[200px] ${inputClass}`}
          aria-label="Search cases"
        />
      )}
    </div>
  );
}
