import { useEffect, useMemo, useState } from "react";
import { usePaginatedList } from "@/hooks/usePaginatedList";
import { PaginationControls } from "@/components/ui/pagination-controls";
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from "@/components/ui/table";
import { format } from "date-fns";
import { EmptyState, LoadingState } from "@/components/states/PageState";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useAuditLog } from "@/hooks/useAuditLog";

export function AuditLogTab() {
  const { data: infiniteData, isLoading: loading, hasNextPage, isFetchingNextPage: loadingMore, fetchNextPage } = useAuditLog();
  const [searchTerm, setSearchTerm] = useState("");

  const entries = useMemo(() => infiniteData?.pages.flat() ?? [], [infiniteData]);

  const filteredEntries = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();
    if (query.length === 0) return entries;
    return entries.filter((entry) => {
      const actor = (entry.user_name ?? "").toLowerCase();
      const action = (entry.action ?? "").toLowerCase();
      return actor.includes(query) || action.includes(query);
    });
  }, [entries, searchTerm]);

  const pagination = usePaginatedList(filteredEntries);
  const { resetPage } = pagination;
  useEffect(() => { resetPage(); }, [searchTerm, resetPage]);

  if (loading) {
    return (
      <div className="p-4 md:p-6 space-y-4 animate-fade-in-up">
        <h2 className="text-lg font-semibold">Audit Log</h2>
        <LoadingState title="Loading audit log" description="Retrieving latest system events..." />
      </div>
    );
  }

  if (entries.length === 0) {
    return (
      <div className="p-4 md:p-6 space-y-4 animate-fade-in-up">
        <h2 className="text-lg font-semibold">Audit Log</h2>
        <EmptyState
          title="No audit entries found"
          description="Activity events will appear here after users perform actions."
        />
      </div>
    );
  }

  if (filteredEntries.length === 0) {
    return (
      <div className="p-4 md:p-6 space-y-4 animate-fade-in-up">
        <h2 className="text-lg font-semibold">Audit Log</h2>
        <Input
          value={searchTerm}
          onChange={(event) => setSearchTerm(event.target.value)}
          placeholder="Search actor or action"
          className="max-w-sm"
        />
        <EmptyState
          title="No matching audit entries"
          description="Try a different search term."
          action={
            <Button variant="outline" size="sm" onClick={() => setSearchTerm("")}>
              Clear search
            </Button>
          }
        />
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 space-y-4 animate-fade-in-up">
      <h2 className="text-lg font-semibold">Audit Log</h2>
      <div className="flex flex-col md:flex-row md:items-center gap-2 md:gap-3">
        <Input
          value={searchTerm}
          onChange={(event) => setSearchTerm(event.target.value)}
          placeholder="Search actor or action"
          className="md:max-w-sm"
        />
        <p className="text-xs text-muted-foreground md:ml-auto">
          {filteredEntries.length} of {entries.length} shown
        </p>
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Timestamp</TableHead>
            <TableHead>User</TableHead>
            <TableHead>Action</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {pagination.items.map((entry) => (
            <TableRow key={entry.id}>
              <TableCell className="text-muted-foreground whitespace-nowrap">
                {format(new Date(entry.created_at), "M/d h:mm a")}
              </TableCell>
              <TableCell className="font-medium">{entry.user_name}</TableCell>
              <TableCell>{entry.action}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <PaginationControls
        page={pagination.page}
        totalPages={pagination.totalPages}
        total={pagination.total}
        hasPrev={pagination.hasPrev}
        hasNext={pagination.hasNext}
        onPrev={pagination.prevPage}
        onNext={pagination.nextPage}
        label="entries"
      />
      {hasNextPage && (
        <div className="flex justify-center pt-2">
          <Button variant="outline" size="sm" onClick={() => fetchNextPage()} disabled={loadingMore}>
            {loadingMore ? "Loading..." : "Load more"}
          </Button>
        </div>
      )}
      <p className="text-sm text-muted-foreground">Read-only log. No actions.</p>
    </div>
  );
}
