import { useState, useEffect, useCallback, useRef, type ChangeEvent } from "react";
import { Plus, Upload, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetFooter,
} from "@/components/ui/sheet";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import type { Tables, TablesInsert } from "@/integrations/supabase/types";

type Client = Tables<"clients">;
type PortalUser = Tables<"portal_users">;
type PricingTier = "standard" | "preferred" | "vip";

const TIER_LABELS: Record<PricingTier, string> = {
  standard: "Standard",
  preferred: "Preferred",
  vip: "VIP",
};

const TIER_COLORS: Record<PricingTier, string> = {
  standard: "bg-muted text-muted-foreground",
  preferred: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  vip: "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200",
};

const ROUTE_DAYS = ["", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"] as const;

type FormData = {
  name: string;
  contact_name: string;
  phone: string;
  email: string;
  address: string;
  notes: string;
  pricing_tier: PricingTier;
  route_day: string;
};

type ImportedClientRow = FormData & {
  portal_email?: string;
};

type OnboardingEmailResponse = {
  success?: boolean;
  provider_status?: string;
  provider_response?: unknown;
  error?: string;
  details?: unknown;
};

const emptyForm: FormData = {
  name: "",
  contact_name: "",
  phone: "",
  email: "",
  address: "",
  notes: "",
  pricing_tier: "standard",
  route_day: "",
};

const CSV_HEADER_SYNONYMS: Record<keyof ImportedClientRow, string[]> = {
  name: ["name", "client_name"],
  contact_name: ["contact_name", "contact", "primary_contact"],
  phone: ["phone", "phone_number"],
  email: ["email", "client_email"],
  address: ["address"],
  notes: ["notes"],
  pricing_tier: ["pricing_tier", "tier"],
  route_day: ["route_day", "route"],
  portal_email: ["portal_email", "portal_user_email", "portal_login_email"],
};

const parseCsvRows = (rawCsv: string): string[][] => {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;

  for (let idx = 0; idx < rawCsv.length; idx += 1) {
    const char = rawCsv[idx];

    if (char === "\"") {
      if (inQuotes && rawCsv[idx + 1] === "\"") {
        cell += "\"";
        idx += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === "," && !inQuotes) {
      row.push(cell.trim());
      cell = "";
      continue;
    }

    if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && rawCsv[idx + 1] === "\n") {
        idx += 1;
      }
      row.push(cell.trim());
      const hasContent = row.some((value) => value.length > 0);
      if (hasContent) rows.push(row);
      row = [];
      cell = "";
      continue;
    }

    cell += char;
  }

  if (cell.length > 0 || row.length > 0) {
    row.push(cell.trim());
    if (row.some((value) => value.length > 0)) rows.push(row);
  }

  return rows;
};

const normalizeTier = (value: string): PricingTier => {
  if (value === "preferred" || value === "vip") return value;
  return "standard";
};

const resolveColumn = (headers: string[], key: keyof ImportedClientRow): number =>
  headers.findIndex((header) => CSV_HEADER_SYNONYMS[key].includes(header));

export function ClientsTab() {
  const { toast } = useToast();
  const csvInputRef = useRef<HTMLInputElement | null>(null);
  const [clients, setClients] = useState<Client[]>([]);
  const [rugCounts, setRugCounts] = useState<Record<string, number>>({});
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormData>({ ...emptyForm });
  const [portalUsers, setPortalUsers] = useState<PortalUser[]>([]);
  const [newPortalEmail, setNewPortalEmail] = useState("");
  const [loading, setLoading] = useState(true);
  const [filterDay, setFilterDay] = useState("");
  const [importing, setImporting] = useState(false);
  const [portalActionId, setPortalActionId] = useState<string | null>(null);

  const fetchClients = useCallback(async () => {
    const { data, error } = await supabase
      .from("clients")
      .select("*")
      .order("name");
    if (error) {
      toast({ title: "Failed to load clients", description: error.message, variant: "destructive" });
    } else {
      setClients(data ?? []);
    }
    setLoading(false);
  }, [toast]);

  const fetchRugCounts = useCallback(async () => {
    const { data } = await supabase
      .from("rugs")
      .select("client_id");
    if (data) {
      const counts: Record<string, number> = {};
      data.forEach((r) => {
        if (r.client_id) counts[r.client_id] = (counts[r.client_id] || 0) + 1;
      });
      setRugCounts(counts);
    }
  }, []);

  useEffect(() => {
    fetchClients();
    fetchRugCounts();
  }, [fetchClients, fetchRugCounts]);

  const fetchPortalUsers = async (clientId: string) => {
    const { data } = await supabase
      .from("portal_users")
      .select("*")
      .eq("client_id", clientId);
    setPortalUsers(data ?? []);
  };

  const openAdd = () => {
    setEditingId(null);
    setForm({ ...emptyForm });
    setPortalUsers([]);
    setNewPortalEmail("");
    setSheetOpen(true);
  };

  const openEdit = (c: Client) => {
    setEditingId(c.id);
    setForm({
      name: c.name,
      contact_name: c.contact_name,
      phone: c.phone,
      email: c.email,
      address: c.address,
      notes: c.notes,
      pricing_tier: c.pricing_tier,
      route_day: c.route_day ?? "",
    });
    fetchPortalUsers(c.id);
    setNewPortalEmail("");
    setSheetOpen(true);
  };

  const save = async () => {
    if (!form.name.trim()) return;
    if (editingId) {
      const { error } = await supabase
        .from("clients")
        .update(form)
        .eq("id", editingId);
      if (error) {
        toast({ title: "Update failed", description: error.message, variant: "destructive" });
        return;
      }
    } else {
      const { error } = await supabase.from("clients").insert(form);
      if (error) {
        toast({ title: "Create failed", description: error.message, variant: "destructive" });
        return;
      }
    }
    setSheetOpen(false);
    fetchClients();
  };

  const updateField = <K extends keyof FormData>(key: K, value: FormData[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const parseImportedClients = (csvText: string): ImportedClientRow[] => {
    const rows = parseCsvRows(csvText);
    if (rows.length < 2) return [];

    const headers = rows[0].map((header) => header.trim().toLowerCase());
    const nameIdx = resolveColumn(headers, "name");
    if (nameIdx < 0) {
      throw new Error("CSV is missing a name column.");
    }

    const contactIdx = resolveColumn(headers, "contact_name");
    const phoneIdx = resolveColumn(headers, "phone");
    const emailIdx = resolveColumn(headers, "email");
    const addressIdx = resolveColumn(headers, "address");
    const notesIdx = resolveColumn(headers, "notes");
    const tierIdx = resolveColumn(headers, "pricing_tier");
    const routeIdx = resolveColumn(headers, "route_day");
    const portalEmailIdx = resolveColumn(headers, "portal_email");

    return rows.slice(1).map((cols) => {
      const name = (cols[nameIdx] ?? "").trim();
      const contact_name = contactIdx >= 0 ? (cols[contactIdx] ?? "").trim() : "";
      const phone = phoneIdx >= 0 ? (cols[phoneIdx] ?? "").trim() : "";
      const email = emailIdx >= 0 ? (cols[emailIdx] ?? "").trim() : "";
      const address = addressIdx >= 0 ? (cols[addressIdx] ?? "").trim() : "";
      const notes = notesIdx >= 0 ? (cols[notesIdx] ?? "").trim() : "";
      const rawTier = tierIdx >= 0 ? (cols[tierIdx] ?? "").trim().toLowerCase() : "";
      const route_day = routeIdx >= 0 ? (cols[routeIdx] ?? "").trim() : "";
      const portal_email = portalEmailIdx >= 0 ? (cols[portalEmailIdx] ?? "").trim().toLowerCase() : "";

      return {
        name,
        contact_name,
        phone,
        email,
        address,
        notes,
        pricing_tier: normalizeTier(rawTier),
        route_day,
        portal_email: portal_email || undefined,
      };
    });
  };

  const handleCsvImport = async (file: File) => {
    setImporting(true);
    try {
      const text = await file.text();
      const imported = parseImportedClients(text).filter((row) => row.name.length > 0);

      if (imported.length === 0) {
        toast({
          title: "No client rows found",
          description: "The CSV did not contain any rows with a client name.",
          variant: "destructive",
        });
        setImporting(false);
        return;
      }

      let createdClients = 0;
      let createdPortalUsers = 0;
      let failedRows = 0;

      for (const row of imported) {
        const clientPayload: TablesInsert<"clients"> = {
          name: row.name,
          contact_name: row.contact_name,
          phone: row.phone,
          email: row.email,
          address: row.address,
          notes: row.notes,
          pricing_tier: row.pricing_tier,
          route_day: row.route_day,
        };

        const { data: insertedClient, error: clientError } = await supabase
          .from("clients")
          .insert(clientPayload)
          .select("id")
          .single();

        if (clientError || !insertedClient?.id) {
          failedRows += 1;
          continue;
        }
        createdClients += 1;

        if (row.portal_email) {
          const { error: portalError } = await supabase
            .from("portal_users")
            .insert({ client_id: insertedClient.id, email: row.portal_email, status: "invited" });
          if (portalError) {
            failedRows += 1;
          } else {
            createdPortalUsers += 1;
          }
        }
      }

      await fetchClients();
      await fetchRugCounts();
      toast({
        title: "Client import complete",
        description: `${createdClients} clients added, ${createdPortalUsers} portal logins staged as invited, ${failedRows} rows failed. No onboarding emails were sent.`,
      });
    } catch (error) {
      toast({
        title: "CSV import failed",
        description: error instanceof Error ? error.message : "Unknown parsing error",
        variant: "destructive",
      });
    }
    setImporting(false);
  };

  const triggerCsvPicker = () => {
    if (importing) return;
    csvInputRef.current?.click();
  };

  const handleCsvFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    await handleCsvImport(file);
  };

  const addPortalUser = async () => {
    const email = newPortalEmail.trim().toLowerCase();
    if (!email || !editingId) return;
    if (portalUsers.some((u) => u.email === email)) {
      toast({ title: "Email already exists", variant: "destructive" });
      return;
    }
    const { error } = await supabase
      .from("portal_users")
      .insert({ client_id: editingId, email, status: "invited" });
    if (error) {
      toast({ title: "Failed", description: error.message, variant: "destructive" });
      return;
    }
    setNewPortalEmail("");
    toast({
      title: "Portal login staged",
      description: `${email} added as invited. Activate and send onboarding when ready.`,
    });
    fetchPortalUsers(editingId);
  };

  const sendOnboardingEmail = async (portalUserId: string) => {
    const { data, error } = await supabase.functions.invoke<OnboardingEmailResponse>(
      "send-portal-onboarding-email",
      { body: { portal_user_id: portalUserId } }
    );

    if (error || data?.error) {
      toast({
        title: "Onboarding email failed",
        description: data?.error || error?.message || "Unknown error",
        variant: "destructive",
      });
      return false;
    }

    if (data?.provider_status === "sent") {
      toast({ title: "Onboarding email sent" });
    } else {
      toast({
        title: "Account activated",
        description: "Email provider is not configured, so no outbound email was sent.",
      });
    }
    return true;
  };

  const activatePortalUser = async (portalUser: PortalUser, sendEmail: boolean) => {
    if (!editingId) return;
    setPortalActionId(portalUser.id);

    if (portalUser.status !== "active") {
      const { error: activateError } = await supabase
        .from("portal_users")
        .update({ status: "active" })
        .eq("id", portalUser.id);
      if (activateError) {
        toast({ title: "Activation failed", description: activateError.message, variant: "destructive" });
        setPortalActionId(null);
        return;
      }
    }

    if (sendEmail) {
      await sendOnboardingEmail(portalUser.id);
    } else {
      toast({ title: "Portal user activated", description: `${portalUser.email} can now sign in.` });
    }

    await fetchPortalUsers(editingId);
    setPortalActionId(null);
  };

  const removePortalUser = async (id: string) => {
    const user = portalUsers.find((u) => u.id === id);
    await supabase.from("portal_users").delete().eq("id", id);
    if (user) {
      toast({ title: "Portal user removed", description: user.email });
    }
    if (editingId) fetchPortalUsers(editingId);
  };

  if (loading) {
    return <div className="flex items-center justify-center h-full text-muted-foreground">Loading clients…</div>;
  }

  return (
    <div className="p-4 md:p-6 overflow-auto h-full animate-fade-in-up">
      <div className="flex items-center justify-between mb-4 gap-3">
        <h2 className="text-lg font-semibold text-foreground">Clients</h2>
        <div className="flex items-center gap-2 ml-auto">
          <Button
            size="sm"
            variant="outline"
            onClick={triggerCsvPicker}
            disabled={importing}
          >
            <Upload className="h-4 w-4 mr-1" />
            {importing ? "Importing..." : "Import CSV"}
          </Button>
          <input
            ref={csvInputRef}
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={handleCsvFileChange}
          />
          <Select value={filterDay || "all"} onValueChange={(v) => setFilterDay(v === "all" ? "" : v)}>
            <SelectTrigger className="w-[150px] h-9">
              <SelectValue placeholder="Route Day" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Days</SelectItem>
              <SelectItem value="unassigned">No Route Assigned</SelectItem>
              {ROUTE_DAYS.filter(Boolean).map((day) => (
                <SelectItem key={day} value={day}>{day}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {filterDay && (
            <Badge variant="secondary" className="text-xs">
              {clients.filter((c) => filterDay === "unassigned" ? !c.route_day : c.route_day === filterDay).length}
            </Badge>
          )}
          <Button size="sm" onClick={openAdd}>
            <Plus className="h-4 w-4 mr-1" /> Add Client
          </Button>
        </div>
      </div>
      <p className="text-xs text-muted-foreground mb-4">
        CSV columns: name, contact_name, phone, email, address, notes, pricing_tier, route_day, portal_email.
        Imported portal logins are staged as invited and never auto-send onboarding emails.
      </p>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Client</TableHead>
            <TableHead className="hidden md:table-cell">Contact</TableHead>
            <TableHead className="hidden sm:table-cell">Phone</TableHead>
            <TableHead className="hidden lg:table-cell w-24">Route Day</TableHead>
            <TableHead className="w-16 text-center">Rugs</TableHead>
            <TableHead className="w-24">Tier</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {clients.filter((c) => !filterDay || (filterDay === "unassigned" ? !c.route_day : c.route_day === filterDay)).map((c) => (
            <TableRow key={c.id} className="cursor-pointer" onClick={() => openEdit(c)}>
              <TableCell className="font-medium">{c.name}</TableCell>
              <TableCell className="hidden md:table-cell text-muted-foreground text-sm">{c.contact_name}</TableCell>
              <TableCell className="hidden sm:table-cell text-muted-foreground text-sm">{c.phone}</TableCell>
              <TableCell className="hidden lg:table-cell text-muted-foreground text-sm">{c.route_day || "—"}</TableCell>
              <TableCell className="text-center">{rugCounts[c.id] ?? 0}</TableCell>
              <TableCell>
                <Badge className={TIER_COLORS[c.pricing_tier]} variant="secondary">
                  {TIER_LABELS[c.pricing_tier]}
                </Badge>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto">
          <SheetHeader>
            <SheetTitle>{editingId ? "Edit Client" : "Add Client"}</SheetTitle>
            <SheetDescription>
              {editingId ? "Update client details." : "Add a new wholesale client."}
            </SheetDescription>
          </SheetHeader>

          <div className="space-y-4 py-6">
            <div className="space-y-2">
              <Label>Client Name</Label>
              <Input value={form.name} onChange={(e) => updateField("name", e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Contact Name</Label>
              <Input value={form.contact_name} onChange={(e) => updateField("contact_name", e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Phone</Label>
                <Input value={form.phone} onChange={(e) => updateField("phone", e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Email</Label>
                <Input value={form.email} onChange={(e) => updateField("email", e.target.value)} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Address</Label>
              <Textarea value={form.address} onChange={(e) => updateField("address", e.target.value)} rows={2} />
            </div>
            <div className="space-y-2">
              <Label>Pricing Tier</Label>
              <Select value={form.pricing_tier} onValueChange={(v) => updateField("pricing_tier", v as PricingTier)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="standard">Standard</SelectItem>
                  <SelectItem value="preferred">Preferred</SelectItem>
                  <SelectItem value="vip">VIP</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Route Day</Label>
              <Select value={form.route_day || "none"} onValueChange={(v) => updateField("route_day", v === "none" ? "" : v)}>
                <SelectTrigger><SelectValue placeholder="Not set" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Not set</SelectItem>
                  {ROUTE_DAYS.filter(Boolean).map((day) => (
                    <SelectItem key={day} value={day}>{day}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Notes</Label>
              <Textarea value={form.notes} onChange={(e) => updateField("notes", e.target.value)} rows={3} />
            </div>

            {editingId && (
              <>
                <Separator />
                <div className="space-y-3">
                  <h3 className="text-sm font-semibold text-foreground">Portal Users</h3>
                  <p className="text-xs text-muted-foreground">
                    New logins stay invited until you activate them. Onboarding emails are only sent when you choose
                    “Activate + Send” or “Send onboarding email”.
                  </p>
                  {portalUsers.length === 0 && (
                    <p className="text-sm text-muted-foreground">No portal users yet.</p>
                  )}
                  {portalUsers.map((u) => (
                    <div key={u.id} className="rounded-md border p-2.5 space-y-2 text-sm">
                      <div className="flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <p className="truncate">{u.email}</p>
                          <p className="text-xs text-muted-foreground">
                            {u.status === "active" ? "Active access" : "Pending activation"}
                          </p>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <Badge
                            variant="secondary"
                            className={
                              u.status === "active"
                                ? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200"
                                : "bg-muted text-muted-foreground"
                            }
                          >
                            {u.status === "active" ? "Active" : "Invited"}
                          </Badge>
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => removePortalUser(u.id)}>
                            <X className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {u.status !== "active" ? (
                          <>
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 text-xs"
                              onClick={() => activatePortalUser(u, false)}
                              disabled={portalActionId === u.id}
                            >
                              Activate
                            </Button>
                            <Button
                              size="sm"
                              className="h-7 text-xs"
                              onClick={() => activatePortalUser(u, true)}
                              disabled={portalActionId === u.id}
                            >
                              Activate + Send
                            </Button>
                          </>
                        ) : (
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 text-xs"
                            onClick={() => activatePortalUser(u, true)}
                            disabled={portalActionId === u.id}
                          >
                            Send onboarding email
                          </Button>
                        )}
                      </div>
                    </div>
                  ))}
                  <div className="flex gap-2">
                    <Input
                      placeholder="Email address"
                      type="email"
                      value={newPortalEmail}
                      onChange={(e) => setNewPortalEmail(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && addPortalUser()}
                    />
                    <Button size="sm" variant="secondary" onClick={addPortalUser} className="shrink-0">
                      Stage Login
                    </Button>
                  </div>
                </div>
              </>
            )}
          </div>

          <SheetFooter>
            <Button onClick={save} className="w-full">Save</Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </div>
  );
}
