interface MilestoneProgressProps {
  completed: number;
  total: number;
}

export function MilestoneProgress({ completed, total }: MilestoneProgressProps) {
  const pct = total > 0 ? Math.round((completed / total) * 100) : 0;

  return (
    <div className="flex items-center gap-2 min-w-[80px]">
      <div className="flex-1 h-1.5 bg-fm-elevated rounded-full overflow-hidden">
        <div
          className="h-full bg-fm-accent rounded-full transition-all"
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-xs text-fm-text-tertiary whitespace-nowrap">
        {completed}/{total}
      </span>
    </div>
  );
}
