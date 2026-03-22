import { describe, expect, it } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { usePaginatedList } from "@/hooks/usePaginatedList";
import { useSortableTable } from "@/hooks/useSortableTable";

describe("usePaginatedList", () => {
  const items = Array.from({ length: 25 }, (_, i) => `item-${i}`);

  it("defaults to page 0 with correct page size", () => {
    const { result } = renderHook(() => usePaginatedList(items, 10));
    expect(result.current.page).toBe(0);
    expect(result.current.items).toHaveLength(10);
    expect(result.current.totalPages).toBe(3);
    expect(result.current.total).toBe(25);
  });

  it("navigates to next page", () => {
    const { result } = renderHook(() => usePaginatedList(items, 10));
    act(() => result.current.nextPage());
    expect(result.current.page).toBe(1);
    expect(result.current.items).toHaveLength(10);
  });

  it("navigates to last page with correct count", () => {
    const { result } = renderHook(() => usePaginatedList(items, 10));
    act(() => result.current.nextPage());
    act(() => result.current.nextPage());
    expect(result.current.page).toBe(2);
    expect(result.current.items).toHaveLength(5);
  });

  it("cannot go past last page", () => {
    const { result } = renderHook(() => usePaginatedList(items, 10));
    act(() => result.current.nextPage());
    act(() => result.current.nextPage());
    act(() => result.current.nextPage());
    expect(result.current.page).toBe(2);
  });

  it("cannot go before first page", () => {
    const { result } = renderHook(() => usePaginatedList(items, 10));
    act(() => result.current.prevPage());
    expect(result.current.page).toBe(0);
  });

  it("resets to page 0", () => {
    const { result } = renderHook(() => usePaginatedList(items, 10));
    act(() => result.current.nextPage());
    act(() => result.current.resetPage());
    expect(result.current.page).toBe(0);
  });

  it("hasPrev/hasNext flags are correct", () => {
    const { result } = renderHook(() => usePaginatedList(items, 10));
    expect(result.current.hasPrev).toBe(false);
    expect(result.current.hasNext).toBe(true);

    act(() => result.current.nextPage());
    expect(result.current.hasPrev).toBe(true);
    expect(result.current.hasNext).toBe(true);

    act(() => result.current.nextPage());
    expect(result.current.hasPrev).toBe(true);
    expect(result.current.hasNext).toBe(false);
  });

  it("handles empty list", () => {
    const { result } = renderHook(() => usePaginatedList([], 10));
    expect(result.current.items).toHaveLength(0);
    expect(result.current.totalPages).toBe(1);
    expect(result.current.page).toBe(0);
  });

  it("handles list smaller than page size", () => {
    const { result } = renderHook(() => usePaginatedList([1, 2, 3], 10));
    expect(result.current.items).toEqual([1, 2, 3]);
    expect(result.current.totalPages).toBe(1);
    expect(result.current.hasNext).toBe(false);
  });
});

describe("useSortableTable", () => {
  it("starts with default sort column and direction", () => {
    const { result } = renderHook(() => useSortableTable("name", "asc"));
    expect(result.current.sort).toEqual({ column: "name", direction: "asc" });
  });

  it("starts with null sort when no default", () => {
    const { result } = renderHook(() => useSortableTable<string>());
    expect(result.current.sort).toBeNull();
  });

  it("toggles through asc → desc → null for default column", () => {
    const { result } = renderHook(() => useSortableTable("name", "asc"));

    act(() => result.current.toggleSort("name"));
    expect(result.current.sort).toEqual({ column: "name", direction: "desc" });

    act(() => result.current.toggleSort("name"));
    expect(result.current.sort).toEqual({ column: "name", direction: "asc" });
  });

  it("switches to new column in asc direction", () => {
    const { result } = renderHook(() => useSortableTable("name", "asc"));

    act(() => result.current.toggleSort("email"));
    expect(result.current.sort).toEqual({ column: "email", direction: "asc" });
  });

  it("cycles a new column through asc → desc", () => {
    const { result } = renderHook(() => useSortableTable("name", "asc"));

    act(() => result.current.toggleSort("email"));
    expect(result.current.sort?.direction).toBe("asc");

    act(() => result.current.toggleSort("email"));
    expect(result.current.sort?.direction).toBe("desc");
  });
});
