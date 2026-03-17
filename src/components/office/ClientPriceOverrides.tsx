import { useEffect, useState, useCallback } from "react";
import { Pencil, Trash2, Plus, Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import {
  supabaseExtended,
  type ExtendedTableRow,
} from "@/integrations/supabase/extended";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";

type PriceOverride = ExtendedTableRow<"price_overrides">;
type Service = Tables<"services">;

interface ClientPriceOverridesProps {
  clientId: string;
}

export function ClientPriceOverrides({ clientId }: ClientPriceOverridesProps) {
  const { toast } = useToast();
  const { user } = useAuth();

  const [overrides, setOverrides] = useState<PriceOverride[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [loading, setLoading] = useState(true);

  // Add-form state
  const [showAddForm, setShowAddForm] = useState(false);
  const [selectedServiceId, setSelectedServiceId] = useState("");
  const [newPrice, setNewPrice] = useState("");
  const [adding, setAdding] = useState(false);

  // Inline-edit state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editPrice, setEditPrice] = useState("");

  const fetchOverrides = useCallback(async () => {
    const { data, error } = await supabaseExtended
      .from("price_overrides")
      .select("*")
      .eq("client_id", clientId)
      .order("created_at", { ascending: false });

    if (error) {
      toast({
        title: "Error loading price overrides",
        description: error.message,
        variant: "destructive",
      });
      return;
    }
    setOverrides(data ?? []);
  }, [clientId, toast]);

  const fetchServices = useCallback(async () => {
    const { data, error } = await supabase
      .from("services")
      .select("*")
      .eq("active", true)
      .order("sort_order");

    if (error) {
      toast({
        title: "Error loading services",
        description: error.message,
        variant: "destructive",
      });
      return;
    }
    setServices(data ?? []);
  }, [toast]);

  useEffect(() => {
    setLoading(true);
    Promise.all([fetchOverrides(), fetchServices()]).finally(() =>
      setLoading(false),
    );
  }, [fetchOverrides, fetchServices]);

  // Services that don't already have an override for this client
  const availableServices = services.filter(
    (s) => !overrides.some((o) => o.service_id === s.id),
  );

  const handleAdd = async () => {
    if (!selectedServiceId || !newPrice || !user) return;

    const service = services.find((s) => s.id === selectedServiceId);
    if (!service) return;

    setAdding(true);
    const { error } = await supabaseExtended.from("price_overrides").insert({
      client_id: clientId,
      service_id: service.id,
      service_name: service.name,
      original_price: service.base_price,
      adjusted_price: parseFloat(newPrice),
      override_reason: "client_price_override",
      overridden_by: user.id,
    });

    if (error) {
      toast({
        title: "Failed to add override",
        description: error.message,
        variant: "destructive",
      });
    } else {
      toast({ title: "Price override added" });
      setShowAddForm(false);
      setSelectedServiceId("");
      setNewPrice("");
      await fetchOverrides();
    }
    setAdding(false);
  };

  const handleUpdate = async (id: string) => {
    const price = parseFloat(editPrice);
    if (isNaN(price)) return;

    const { error } = await supabaseExtended
      .from("price_overrides")
      .update({ adjusted_price: price })
      .eq("id", id);

    if (error) {
      toast({
        title: "Failed to update override",
        description: error.message,
        variant: "destructive",
      });
    } else {
      toast({ title: "Price override updated" });
      setEditingId(null);
      setEditPrice("");
      await fetchOverrides();
    }
  };

  const handleDelete = async (id: string) => {
    const { error } = await supabaseExtended
      .from("price_overrides")
      .delete()
      .eq("id", id);

    if (error) {
      toast({
        title: "Failed to remove override",
        description: error.message,
        variant: "destructive",
      });
    } else {
      toast({ title: "Price override removed" });
      await fetchOverrides();
    }
  };

  const startEdit = (override: PriceOverride) => {
    setEditingId(override.id);
    setEditPrice(String(override.adjusted_price));
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditPrice("");
  };

  const formatCurrency = (value: number) =>
    new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
    }).format(value);

  if (loading) {
    return <p className="text-sm text-muted-foreground py-2">Loading price overrides...</p>;
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-foreground">Price Overrides</h3>
        {!showAddForm && (
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-xs"
            onClick={() => setShowAddForm(true)}
            disabled={availableServices.length === 0}
          >
            <Plus className="h-3.5 w-3.5 mr-1" />
            Add Override
          </Button>
        )}
      </div>

      {showAddForm && (
        <div className="rounded-md border p-3 space-y-3">
          <div className="space-y-2">
            <Label className="text-xs">Service</Label>
            <Select value={selectedServiceId} onValueChange={setSelectedServiceId}>
              <SelectTrigger className="h-8 text-xs">
                <SelectValue placeholder="Select a service" />
              </SelectTrigger>
              <SelectContent>
                {availableServices.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.name} ({formatCurrency(s.base_price)} / {s.unit})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label className="text-xs">Override Price</Label>
            <Input
              type="number"
              step="0.01"
              min="0"
              placeholder="0.00"
              value={newPrice}
              onChange={(e) => setNewPrice(e.target.value)}
              className="h-8 text-xs"
            />
          </div>
          <div className="flex gap-2">
            <Button
              size="sm"
              className="h-7 text-xs"
              onClick={handleAdd}
              disabled={adding || !selectedServiceId || !newPrice}
            >
              {adding ? "Saving..." : "Save"}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-7 text-xs"
              onClick={() => {
                setShowAddForm(false);
                setSelectedServiceId("");
                setNewPrice("");
              }}
            >
              Cancel
            </Button>
          </div>
        </div>
      )}

      {overrides.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Using standard pricing. Add an override to set a custom price for this client.
        </p>
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-xs">Service</TableHead>
                <TableHead className="text-xs text-right">Base</TableHead>
                <TableHead className="text-xs text-right">Override</TableHead>
                <TableHead className="text-xs w-[80px]" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {overrides.map((o) => {
                const isEditing = editingId === o.id;
                return (
                  <TableRow key={o.id}>
                    <TableCell className="text-xs font-medium">
                      {o.service_name}
                    </TableCell>
                    <TableCell className="text-xs text-right text-muted-foreground">
                      {formatCurrency(o.original_price)}
                    </TableCell>
                    <TableCell className="text-xs text-right">
                      {isEditing ? (
                        <Input
                          type="number"
                          step="0.01"
                          min="0"
                          value={editPrice}
                          onChange={(e) => setEditPrice(e.target.value)}
                          className="h-7 w-24 text-xs ml-auto"
                          autoFocus
                          onKeyDown={(e) => {
                            if (e.key === "Enter") handleUpdate(o.id);
                            if (e.key === "Escape") cancelEdit();
                          }}
                        />
                      ) : (
                        <span className="font-semibold">
                          {formatCurrency(o.adjusted_price)}
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      {isEditing ? (
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6"
                            onClick={() => handleUpdate(o.id)}
                          >
                            <Check className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6"
                            onClick={cancelEdit}
                          >
                            <X className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      ) : (
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6"
                            onClick={() => startEdit(o)}
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6 text-destructive hover:text-destructive"
                            onClick={() => handleDelete(o.id)}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
