import { useCallback, useEffect, useState } from "react";
import { CheckCircle2 } from "lucide-react";
import { format } from "date-fns";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useInvalidateRugs } from "@/hooks/useRugs";
import { toast } from "@/hooks/use-toast";

interface ServiceRow {
  id: string;
  service_name: string;
  completed_at: string | null;
  completed_by: string | null;
}

interface ServiceChecklistDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  rugId: string;
  rugTag: string;
}

export function ServiceChecklistDialog({
  open,
  onOpenChange,
  rugId,
  rugTag,
}: ServiceChecklistDialogProps) {
  const { user } = useAuth();
  const invalidateRugs = useInvalidateRugs();
  const [services, setServices] = useState<ServiceRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [toggling, setToggling] = useState<string | null>(null);

  const fetchServices = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("rug_services")
      .select("id, service_name, completed_at, completed_by")
      .eq("rug_id", rugId)
      .order("service_name");

    if (error) {
      toast({
        title: "Failed to load services",
        description: error.message,
        variant: "destructive",
      });
    } else {
      setServices((data ?? []) as ServiceRow[]);
    }
    setLoading(false);
  }, [rugId]);

  useEffect(() => {
    if (open && rugId) {
      fetchServices();
    }
  }, [open, rugId, fetchServices]);

  const handleToggle = async (serviceId: string, currentlyCompleted: boolean) => {
    if (toggling) return;
    setToggling(serviceId);

    const updates = currentlyCompleted
      ? { completed_at: null, completed_by: null }
      : { completed_at: new Date().toISOString(), completed_by: user?.id ?? null };

    const { error } = await supabase
      .from("rug_services")
      .update(updates)
      .eq("id", serviceId);

    if (error) {
      toast({
        title: "Update failed",
        description: error.message,
        variant: "destructive",
      });
    } else {
      setServices((prev) =>
        prev.map((s) =>
          s.id === serviceId
            ? {
                ...s,
                completed_at: currentlyCompleted ? null : updates.completed_at!,
                completed_by: currentlyCompleted ? null : updates.completed_by,
              }
            : s
        )
      );
      invalidateRugs();
    }
    setToggling(null);
  };

  const completedCount = services.filter((s) => s.completed_at !== null).length;
  const totalCount = services.length;
  const progressPct = totalCount > 0 ? (completedCount / totalCount) * 100 : 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CheckCircle2 className="h-5 w-5 text-primary" />
            Services &mdash; {rugTag}
          </DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="py-8 text-center text-sm text-muted-foreground">
            Loading services...
          </div>
        ) : totalCount === 0 ? (
          <div className="py-8 text-center text-sm text-muted-foreground">
            No services found for this rug.
          </div>
        ) : (
          <div className="space-y-4">
            {/* Progress summary */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Progress</span>
                <span className="font-medium">
                  {completedCount}/{totalCount} services complete
                </span>
              </div>
              <Progress value={progressPct} className="h-2" />
            </div>

            {/* Service list */}
            <div className="space-y-1">
              {services.map((service) => {
                const isCompleted = service.completed_at !== null;
                return (
                  <label
                    key={service.id}
                    className="flex items-start gap-3 rounded-md border px-3 py-2.5 cursor-pointer hover:bg-muted/50 transition-colors"
                  >
                    <Checkbox
                      checked={isCompleted}
                      disabled={toggling === service.id}
                      onCheckedChange={() =>
                        handleToggle(service.id, isCompleted)
                      }
                      className="mt-0.5"
                    />
                    <div className="flex-1 min-w-0">
                      <span
                        className={`text-sm font-medium ${
                          isCompleted
                            ? "line-through text-muted-foreground"
                            : ""
                        }`}
                      >
                        {service.service_name}
                      </span>
                      {isCompleted && service.completed_at && (
                        <p className="text-xs text-muted-foreground mt-0.5">
                          Completed{" "}
                          {format(
                            new Date(service.completed_at),
                            "MMM d, h:mm a"
                          )}
                        </p>
                      )}
                    </div>
                  </label>
                );
              })}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
