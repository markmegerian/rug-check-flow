import { useCallback, useMemo, useState } from "react";

export type SortDirection = "asc" | "desc";
export type SortState<T extends string> = { column: T; direction: SortDirection } | null;

export function useSortableTable<T extends string>(defaultCol?: T, defaultDir: SortDirection = "asc") {
  const defaultSort: SortState<T> = useMemo(
    () => (defaultCol ? { column: defaultCol, direction: defaultDir } : null),
    [defaultCol, defaultDir]
  );
  const [sort, setSort] = useState<SortState<T>>(defaultSort);

  const toggleSort = useCallback(
    (column: T) => {
      setSort((prev) => {
        if (!prev || prev.column !== column) return { column, direction: "asc" };
        if (prev.direction === "asc") return { column, direction: "desc" };
        return defaultSort;
      });
    },
    [defaultSort]
  );

  return { sort, toggleSort } as const;
}
