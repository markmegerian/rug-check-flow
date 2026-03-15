import { format } from "date-fns";
import { CalendarIcon, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

interface InvoiceFiltersProps {
  clientSearch: string;
  onClientSearchChange: (value: string) => void;
  dateFrom: Date | undefined;
  dateTo: Date | undefined;
  onDateFromChange: (date: Date | undefined) => void;
  onDateToChange: (date: Date | undefined) => void;
}

export function InvoiceFilters({
  clientSearch,
  onClientSearchChange,
  dateFrom,
  dateTo,
  onDateFromChange,
  onDateToChange,
}: InvoiceFiltersProps) {
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
        <Input
          type="text"
          placeholder="Search client…"
          className="h-8 w-44 pl-8 text-sm"
          value={clientSearch}
          onChange={(e) => onClientSearchChange(e.target.value)}
        />
      </div>
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="outline" size="sm" className={cn("gap-1.5 text-xs", !dateFrom && "text-muted-foreground")}>
            <CalendarIcon className="h-3.5 w-3.5" />
            {dateFrom ? format(dateFrom, "MMM d, yyyy") : "From"}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <Calendar mode="single" selected={dateFrom} onSelect={onDateFromChange} initialFocus className="p-3 pointer-events-auto" />
        </PopoverContent>
      </Popover>
      <span className="text-xs text-muted-foreground">→</span>
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="outline" size="sm" className={cn("gap-1.5 text-xs", !dateTo && "text-muted-foreground")}>
            <CalendarIcon className="h-3.5 w-3.5" />
            {dateTo ? format(dateTo, "MMM d, yyyy") : "To"}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <Calendar mode="single" selected={dateTo} onSelect={onDateToChange} initialFocus className="p-3 pointer-events-auto" />
        </PopoverContent>
      </Popover>
      {(dateFrom || dateTo) && (
        <Button variant="ghost" size="sm" className="h-7 px-2 text-xs text-muted-foreground" onClick={() => { onDateFromChange(undefined); onDateToChange(undefined); }}>
          <X className="h-3 w-3 mr-1" /> Clear
        </Button>
      )}
    </div>
  );
}
