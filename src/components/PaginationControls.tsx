interface PaginationControlsProps {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
}

export function PaginationControls({ page, pageSize, total, onPageChange }: PaginationControlsProps) {
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const canPrev = page > 0;
  const canNext = page + 1 < pageCount;
  const rangeStart = total === 0 ? 0 : page * pageSize + 1;
  const rangeEnd = Math.min((page + 1) * pageSize, total);

  return (
    <div className="flex items-center justify-between text-sm text-fm-text-tertiary mt-4">
      <div>
        Page {page + 1} of {pageCount} · Showing {rangeStart}–{rangeEnd} of {total}
      </div>
      <div className="flex gap-2">
        <button
          onClick={() => onPageChange(page - 1)}
          disabled={!canPrev}
          className="px-3 py-1 border border-fm-border rounded-fm-btn text-fm-text-secondary hover:bg-fm-elevated disabled:opacity-50 transition-colors"
        >
          Prev
        </button>
        <button
          onClick={() => onPageChange(page + 1)}
          disabled={!canNext}
          className="px-3 py-1 border border-fm-border rounded-fm-btn text-fm-text-secondary hover:bg-fm-elevated disabled:opacity-50 transition-colors"
        >
          Next
        </button>
      </div>
    </div>
  );
}
