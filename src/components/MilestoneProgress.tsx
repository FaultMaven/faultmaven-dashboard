interface MilestoneProgressProps {
  completed: number;
  total: number;
  /** When true, progress has stalled — show warning color */
  transparent?: boolean;
}

export function MilestoneProgress({ completed, total, transparent }: MilestoneProgressProps) {
  const pct = total > 0 ? Math.round((completed / total) * 100) : 0;
  const barColor = transparent ? 'bg-fm-warning' : 'bg-fm-accent';

  return (
    <div className="flex items-center gap-2 min-w-[80px]">
      <div className="flex-1 h-1.5 bg-fm-elevated rounded-full overflow-hidden">
        <div
          className={`h-full ${barColor} rounded-full transition-all`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-xs text-fm-text-tertiary whitespace-nowrap">
        {completed}/{total}
      </span>
    </div>
  );
}
