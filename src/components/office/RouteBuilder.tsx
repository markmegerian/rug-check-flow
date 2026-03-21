import { useCallback, useEffect, useMemo, useState } from "react";
import { format, addDays, startOfWeek } from "date-fns";
import {
  DndContext,
  DragOverlay,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragStartEvent,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, Package, Truck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

type ReadyRug = {
  id: string;
  tag: string;
  clientName: string;
  clientId: string | null;
  routeDay: string | null;
  size: string;
};

type ScheduleSlot = {
  day: string;
  date: string;
  rugs: ReadyRug[];
};

const WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"] as const;

function SortableRugItem({ rug, isOverlay }: { rug: ReadyRug; isOverlay?: boolean }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: rug.id,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "flex items-center gap-2 rounded-md border bg-card px-2.5 py-2 text-sm",
        isDragging && "opacity-30",
        isOverlay && "shadow-lg border-primary"
      )}
      {...attributes}
    >
      <button type="button" className="cursor-grab active:cursor-grabbing shrink-0 text-muted-foreground hover:text-foreground" {...listeners}>
        <GripVertical className="h-3.5 w-3.5" />
      </button>
      <Package className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
      <div className="min-w-0 flex-1">
        <span className="font-mono text-xs font-medium">{rug.tag}</span>
        <span className="text-xs text-muted-foreground ml-2 truncate">{rug.clientName}</span>
      </div>
      <span className="text-[10px] text-muted-foreground shrink-0">{rug.size}</span>
    </div>
  );
}

export function RouteBuilder() {
  const { toast } = useToast();
  const [readyRugs, setReadyRugs] = useState<ReadyRug[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeId, setActiveId] = useState<string | null>(null);

  const weekStart = useMemo(() => startOfWeek(new Date(), { weekStartsOn: 1 }), []);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  );

  useEffect(() => {
    const fetchReadyRugs = async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from("rugs")
        .select("id, tag, size_length, size_width, client_id, clients(name, route_day)")
        .eq("status", "ready")
        .order("checked_in_at", { ascending: true })
        .limit(200);

      if (error) {
        toast({ title: "Failed to load rugs", description: error.message, variant: "destructive" });
        setLoading(false);
        return;
      }

      const mapped = (data ?? []).map((rug: any) => ({
        id: rug.id,
        tag: rug.tag,
        clientName: rug.clients?.name ?? "Unknown",
        clientId: rug.client_id,
        routeDay: rug.clients?.route_day ?? null,
        size: `${rug.size_length ?? 0}' x ${rug.size_width ?? 0}'`,
      }));

      setReadyRugs(mapped);
      setLoading(false);
    };

    fetchReadyRugs();
  }, [toast]);

  // Build schedule slots grouped by weekday
  const schedule: ScheduleSlot[] = useMemo(() => {
    return WEEKDAYS.map((day, idx) => ({
      day,
      date: format(addDays(weekStart, idx), "yyyy-MM-dd"),
      rugs: readyRugs.filter((r) => r.routeDay === day),
    }));
  }, [readyRugs, weekStart]);

  const unscheduled = useMemo(
    () => readyRugs.filter((r) => !r.routeDay || !WEEKDAYS.includes(r.routeDay as any)),
    [readyRugs]
  );

  const activeRug = activeId ? readyRugs.find((r) => r.id === activeId) : null;

  const handleDragStart = useCallback((event: DragStartEvent) => {
    setActiveId(String(event.active.id));
  }, []);

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    setActiveId(null);
    const { active, over } = event;
    if (!over) return;

    const rugId = String(active.id);
    const targetDay = String(over.id);

    // Check if dropped onto a day column
    if (WEEKDAYS.includes(targetDay as any) || targetDay === "unscheduled") {
      setReadyRugs((prev) =>
        prev.map((r) =>
          r.id === rugId
            ? { ...r, routeDay: targetDay === "unscheduled" ? null : targetDay }
            : r
        )
      );
    }
  }, []);

  if (loading) {
    return <p className="text-sm text-muted-foreground p-4">Loading ready rugs...</p>;
  }

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold">Route Builder</h3>
          <p className="text-xs text-muted-foreground">
            Drag rugs between days to plan delivery routes. Week of {format(weekStart, "MMM d")}.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="secondary" className="text-xs">
            {readyRugs.length} ready
          </Badge>
          <Badge variant="outline" className="text-xs">
            {unscheduled.length} unscheduled
          </Badge>
        </div>
      </div>

      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
          {/* Unscheduled column */}
          <div className="rounded-lg border bg-muted/30 min-h-[200px]">
            <div className="px-3 py-2 border-b bg-muted/50 rounded-t-lg">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Unscheduled
                </span>
                <Badge variant="outline" className="text-[10px]">{unscheduled.length}</Badge>
              </div>
            </div>
            <SortableContext items={unscheduled.map((r) => r.id)} strategy={verticalListSortingStrategy} id="unscheduled">
              <div className="p-2 space-y-1.5 min-h-[120px]" data-droppable-id="unscheduled">
                {unscheduled.map((rug) => (
                  <SortableRugItem key={rug.id} rug={rug} />
                ))}
                {unscheduled.length === 0 && (
                  <p className="text-xs text-muted-foreground text-center py-6">All rugs scheduled</p>
                )}
              </div>
            </SortableContext>
          </div>

          {/* Day columns */}
          {schedule.map((slot) => (
            <div key={slot.day} className="rounded-lg border min-h-[200px]">
              <div className="px-3 py-2 border-b bg-card rounded-t-lg">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-xs font-semibold">{slot.day}</span>
                    <span className="text-[10px] text-muted-foreground ml-1.5">
                      {format(new Date(slot.date), "M/d")}
                    </span>
                  </div>
                  <Badge
                    variant={slot.rugs.length > 0 ? "default" : "outline"}
                    className="text-[10px]"
                  >
                    {slot.rugs.length}
                  </Badge>
                </div>
              </div>
              <SortableContext items={slot.rugs.map((r) => r.id)} strategy={verticalListSortingStrategy} id={slot.day}>
                <div className="p-2 space-y-1.5 min-h-[120px]" data-droppable-id={slot.day}>
                  {slot.rugs.map((rug) => (
                    <SortableRugItem key={rug.id} rug={rug} />
                  ))}
                  {slot.rugs.length === 0 && (
                    <div className="flex flex-col items-center justify-center py-6 text-muted-foreground">
                      <Truck className="h-5 w-5 mb-1 opacity-30" />
                      <p className="text-[10px]">Drop rugs here</p>
                    </div>
                  )}
                </div>
              </SortableContext>
            </div>
          ))}
        </div>

        <DragOverlay>
          {activeRug ? <SortableRugItem rug={activeRug} isOverlay /> : null}
        </DragOverlay>
      </DndContext>
    </div>
  );
}
