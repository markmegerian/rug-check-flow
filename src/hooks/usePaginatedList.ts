import { useMemo, useState } from "react";

const DEFAULT_PAGE_SIZE = 10;

export function usePaginatedList<T>(items: T[], pageSize = DEFAULT_PAGE_SIZE) {
  const [page, setPage] = useState(0);

  // Reset to page 0 when items change significantly
  const totalPages = Math.max(1, Math.ceil(items.length / pageSize));
  const safePage = Math.min(page, totalPages - 1);

  const paginatedItems = useMemo(
    () => items.slice(safePage * pageSize, (safePage + 1) * pageSize),
    [items, safePage, pageSize]
  );

  const hasPrev = safePage > 0;
  const hasNext = safePage < totalPages - 1;

  return {
    items: paginatedItems,
    page: safePage,
    totalPages,
    total: items.length,
    hasPrev,
    hasNext,
    setPage,
    nextPage: () => setPage((p) => Math.min(p + 1, totalPages - 1)),
    prevPage: () => setPage((p) => Math.max(p - 1, 0)),
    resetPage: () => setPage(0),
  } as const;
}
