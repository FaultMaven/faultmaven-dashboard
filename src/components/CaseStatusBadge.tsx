import type { CaseStatus } from '../types/cases';

interface CaseStatusBadgeProps {
  status: CaseStatus;
}

const statusConfig: Record<CaseStatus, { label: string; className: string }> = {
  inquiry: {
    label: 'Inquiry',
    className: 'bg-fm-accent/10 text-fm-accent border border-fm-accent/30',
  },
  investigating: {
    label: 'Investigating',
    className: 'bg-fm-warning/10 text-fm-warning border border-fm-warning/30',
  },
  resolved: {
    label: 'Resolved',
    className: 'bg-fm-success/10 text-fm-success border border-fm-success/30',
  },
  closed: {
    label: 'Closed',
    className: 'bg-fm-text-tertiary/10 text-fm-text-tertiary border border-fm-text-tertiary/30',
  },
};

export function CaseStatusBadge({ status }: CaseStatusBadgeProps) {
  const config = statusConfig[status] ?? {
    label: status,
    className: 'bg-fm-elevated text-fm-text-secondary border border-fm-border',
  };

  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${config.className}`}>
      {config.label}
    </span>
  );
}
