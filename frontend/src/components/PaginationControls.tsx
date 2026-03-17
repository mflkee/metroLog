type PaginationControlsProps = {
  currentPage: number;
  pageSize: number;
  totalItems: number;
  onPageChange: (page: number) => void;
};

export function PaginationControls({
  currentPage,
  pageSize,
  totalItems,
  onPageChange,
}: PaginationControlsProps) {
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const startItem = totalItems === 0 ? 0 : (currentPage - 1) * pageSize + 1;
  const endItem = totalItems === 0 ? 0 : Math.min(currentPage * pageSize, totalItems);

  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="text-xs text-steel">
        Показаны {startItem}-{endItem} из {totalItems}
      </div>
      <div className="flex items-center gap-2">
        <button
          aria-label="Предыдущая страница"
          className="btn-secondary btn-sm"
          disabled={currentPage <= 1}
          type="button"
          onClick={() => onPageChange(currentPage - 1)}
        >
          ←
        </button>
        <span className="rounded-full border border-line px-3 py-1 text-xs text-steel">
          Страница {currentPage} из {totalPages}
        </span>
        <button
          aria-label="Следующая страница"
          className="btn-secondary btn-sm"
          disabled={currentPage >= totalPages}
          type="button"
          onClick={() => onPageChange(currentPage + 1)}
        >
          →
        </button>
      </div>
    </div>
  );
}
