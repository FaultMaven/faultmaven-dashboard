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

  return (
    <div className="flex items-center justify-between text-sm text-gray-600 mt-4">
      <div>
        Page {page + 1} of {pageCount} · Showing {Math.min((page + 1) * pageSize, total)} of {total}
      </div>
      <div className="flex gap-2">
        <button
          onClick={() => onPageChange(page - 1)}
          disabled={!canPrev}
          className="px-3 py-1 border border-gray-300 rounded disabled:opacity-50"
        >
          Prev
        </button>
        <button
          onClick={() => onPageChange(page + 1)}
          disabled={!canNext}
          className="px-3 py-1 border border-gray-300 rounded disabled:opacity-50"
        >
          Next
        </button>
      </div>
    </div>
  );
}










