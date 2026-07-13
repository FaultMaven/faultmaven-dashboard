import type { CaseSource } from '../lib/api';

const LABELS: Record<CaseSource, string> = {
  slack: 'Slack',
  copilot: 'Copilot',
  api: 'API',
};

const CLASSES: Record<CaseSource, string> = {
  slack: 'bg-fm-accent/10 text-fm-accent border-fm-accent/30',
  copilot: 'bg-fm-elevated text-fm-text-secondary border-fm-border',
  api: 'bg-fm-elevated text-fm-text-tertiary border-fm-border',
};

/**
 * Small pill showing a case's origin (ADR-012): Slack / Copilot / API.
 * Renders nothing when source is unknown (older cases before the field existed).
 */
export function SourceBadge({ source }: { source?: CaseSource }) {
  if (!source) return null;
  const label = LABELS[source] ?? source;
  const cls = CLASSES[source] ?? CLASSES.copilot;
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 text-fm-xs font-medium rounded-full border ${cls}`}
    >
      {label}
    </span>
  );
}
