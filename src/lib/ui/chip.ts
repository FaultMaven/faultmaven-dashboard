// Shared filter-chip styling so the state chips (CaseFiltersBar) and the source
// chips (AdminCaseListPage) can't visually drift.
export const chipBase =
  'px-3 py-1 text-sm font-medium rounded-full border transition-colors cursor-pointer';
export const chipActive = 'bg-fm-accent text-white border-fm-accent';
export const chipInactive =
  'text-fm-text-secondary border-fm-border hover:bg-fm-elevated';

/**
 * The accent call-to-action button.
 *
 * Two copies of this class list had already appeared on the case list — the
 * header's "New investigation" and the empty state's "Start an investigation" —
 * which is exactly how a design system drifts one button at a time.
 */
export const ACCENT_BUTTON =
  'inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-fm-btn ' +
  'bg-fm-accent-soft text-fm-accent border border-fm-accent-border ' +
  'hover:bg-fm-accent-hover transition-colors';
