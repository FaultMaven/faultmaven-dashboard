import type { PersonLabel } from '../lib/cases/driver';

/**
 * A case's creator or driver, as a name (ADR-020 D5).
 *
 * The display name when the server sent one; otherwise a short id in
 * monospace, with the whole id on hover, so a missing name never shows a
 * bare 36-character id and never shows nothing. A core that predates the
 * fields sends neither, which renders as a muted dash with a spoken "Unknown".
 */
export function CasePersonName({ label }: { label: PersonLabel | null }) {
  if (!label) {
    return (
      <span className="text-fm-text-tertiary">
        <span aria-hidden="true">—</span>
        <span className="sr-only">Unknown</span>
      </span>
    );
  }
  return (
    <span title={label.title} className={label.isId ? 'font-mono text-xs' : undefined}>
      {label.text}
    </span>
  );
}
