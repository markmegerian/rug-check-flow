import { useEffect, useState, useCallback, useMemo, useRef, type ChangeEvent } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown, Plus, Search, Upload } from "lucide-react";
import { Input } from "@/components/ui/input";
import { useSortableTable, type SortState } from "@/hooks/useSortableTable";
import { usePaginatedList } from "@/hooks/usePaginatedList";
import { PaginationControls } from "@/components/ui/pagination-controls";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { supabase, SUPABASE_URL } from "@/integrations/supabase/client";
import type { Tables, TablesInsert } from "@/integrations/supabase/types";
import { useAuth } from "@/contexts/AuthContext";
import { useClients, useInvalidateClients } from "@/hooks/useClients";
import { useRugCountsByClient, useInvalidateRugs } from "@/hooks/useRugs";
import { ClientDetailSheet } from "@/components/office/ClientDetailSheet";
import { LoadingState } from "@/components/states/PageState";

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

type ImportedClientRow = FormData & { portal_email?: string };

type OnboardingEmailResponse = {
  success?: boolean;
  provider_status?: string;
  provider_response?: unknown;
  delivery_instructions?: {
    portal_url: string;
    email: string;
    reset_link: string | null;
    temporary_password: string;
    note: string | null;
  };
  error?: string;
  details?: unknown;
};

const emptyForm: FormData = {
  name: "", contact_name: "", phone: "", email: "", address: "", notes: "", pricing_tier: "standard", route_day: "",
};

// --- CSV parsing utilities ---

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
      if (inQuotes && rawCsv[idx + 1] === "\"") { cell += "\""; idx += 1; }
      else inQuotes = !inQuotes;
      continue;
    }
    if (char === "," && !inQuotes) { row.push(cell.trim()); cell = ""; continue; }
    if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && rawCsv[idx + 1] === "\n") idx += 1;
      row.push(cell.trim());
      if (row.some((v) => v.length > 0)) rows.push(row);
      row = []; cell = "";
      continue;
    }
    cell += char;
  }
  if (cell.length > 0 || row.length > 0) {
    row.push(cell.trim());
    if (row.some((v) => v.length > 0)) rows.push(row);
  }
  return rows;
};

const normalizeTier = (value: string): PricingTier => {
  if (value === "preferred" || value === "vip") return value;
  return "standard";
};

const resolveColumn = (headers: string[], key: keyof ImportedClientRow): number =>
  headers.findIndex((header) => CSV_HEADER_SYNONYMS[key].includes(header));

// --- Onboarding email helpers ---

const mapOnboardingEmailErrorMessage = (message: string | undefined) => {
  if (!message) return "Unknown error";
  let activeProject = "unknown";
  try { activeProject = new URL(SUPABASE_URL).hostname.split(".")[0] ?? "unknown"; } catch { activeProject = "unknown"; }
  if (message.toLowerCase().includes("failed to send request to edge function")) {
    return `Edge function send-portal-onboarding-email is not reachable from project ${activeProject}. Verify this frontend is pointed at the same project where the function is deployed.`;
  }
  return message;
};

const extractOnboardingErrorDetail = (details: unknown) => {
  if (!details) return null;
  if (typeof details === "string") return details;
  if (typeof details === "object") {
    const c = details as Record<string, unknown>;
    if (typeof c.message === "string") return c.message;
    if (typeof c.error === "string") return c.error;
    return JSON.stringify(details);
  }
  return String(details);
};

const extractProviderMessage = (response: unknown) => {
  if (!response || typeof response !== "object") return null;
  const c = response as Record<string, unknown>;
  return typeof c.message === "string" ? c.message : typeof c.error === "string" ? c.error : typeof c.name === "string" ? c.name : null;
};

const buildManualOnboardingInstructions = (instructions: NonNullable<OnboardingEmailResponse["delivery_instructions"]>) => {
  const lines = [
    "RugBoost portal sign-in instructions",
    `Portal URL: ${instructions.portal_url}`,
    `Email: ${instructions.email}`,
    `Temporary password: ${instructions.temporary_password}`,
    `Set-password link: ${instructions.reset_link ?? `${instructions.portal_url}/auth/forgot-password`}`,
    "Action required: user must change password before continuing.",
  ];
  if (instructions.note) lines.push(instructions.note);
  return lines.join("\n");
};

type ClientSortCol = "name" | "contact" | "phone" | "route_day" | "rugs" | "tier";

function SortableHead({
  col,
  sort,
  onToggle,
  className,
  children,
}: {
  col: ClientSortCol;
  sort: SortState<ClientSortCol> | null;
  onToggle: (col: ClientSortCol) => void;
  className?: string;
  children: React.ReactNode;
}) {
  const active = sort?.column === col;
  const Icon = active ? (sort.direction === "asc" ? ArrowUp : ArrowDown) : ArrowUpDown;
  return (
    <TableHead className={className}>
      <button
        className="flex items-center gap-1 hover:text-foreground transition-colors -ml-1 px-1"
        onClick={() => onToggle(col)}
      >
        {children}
        <Icon className={`h-3 w-3 shrink-0 ${active ? "text-foreground" : "text-muted-foreground/50"}`} />
      </button>
    </TableHead>
  );
}

export function ClientsTab() {
  const { toast } = useToast();
  const { hasRole, isSuperAdmin } = useAuth();
  const csvInputRef = useRef<HTMLInputElement | null>(null);
  const { data: clients = [], isLoading: loading } = useClients();
  const { data: rugCounts = {} } = useRugCountsByClient();
  const invalidateClients = useInvalidateClients();
  const invalidateRugs = useInvalidateRugs();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormData>({ ...emptyForm });
  const [portalUsers, setPortalUsers] = useState<PortalUser[]>([]);
  const [newPortalEmail, setNewPortalEmail] = useState("");
  const [filterDay, setFilterDay] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [importing, setImporting] = useState(false);
  const [portalActionId, setPortalActionId] = useState<string | null>(null);
  const [deletingClient, setDeletingClient] = useState(false);

  const { sort, toggleSort } = useSortableTable<ClientSortCol>("name");

  const getFunctionAuthHeaders = useCallback(async () => {
    const { data } = await supabase.auth.getSession();
    const accessToken = data.session?.access_token;
    if (!accessToken) return null;
    return { Authorization: `Bearer ${accessToken}` };
  }, []);

  const fetchPortalUsers = async (clientId: string) => {
    const { data } = await supabase.from("portal_users").select("*").eq("client_id", clientId);
    setPortalUsers(data ?? []);
  };

  const openAdd = () => {
    setEditingId(null); setForm({ ...emptyForm }); setPortalUsers([]); setNewPortalEmail(""); setSheetOpen(true);
  };

  const openEdit = (c: Client) => {
    setEditingId(c.id);
    setForm({ name: c.name, contact_name: c.contact_name, phone: c.phone, email: c.email, address: c.address, notes: c.notes, pricing_tier: c.pricing_tier, route_day: c.route_day ?? "" });
    fetchPortalUsers(c.id);
    setNewPortalEmail("");
    setSheetOpen(true);
  };

  const save = async () => {
    if (!form.name.trim()) return;
    if (editingId) {
      const { error } = await supabase.from("clients").update(form).eq("id", editingId);
      if (error) { toast({ title: "Update failed", description: error.message, variant: "destructive" }); return; }
    } else {
      const { error } = await supabase.from("clients").insert(form);
      if (error) { toast({ title: "Create failed", description: error.message, variant: "destructive" }); return; }
    }
    setSheetOpen(false);
    invalidateClients();
  };

  const updateField = <K extends keyof FormData>(key: K, value: FormData[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  // CSV Import
  const handleCsvImport = async (file: File) => {
    setImporting(true);
    try {
      const text = await file.text();
      const rows = parseCsvRows(text);
      if (rows.length < 2) { toast({ title: "No client rows found", description: "The CSV did not contain any rows with a client name.", variant: "destructive" }); setImporting(false); return; }

      const headers = rows[0].map((h) => h.trim().toLowerCase());
      const nameIdx = resolveColumn(headers, "name");
      if (nameIdx < 0) { throw new Error("CSV is missing a name column."); }

      const contactIdx = resolveColumn(headers, "contact_name");
      const phoneIdx = resolveColumn(headers, "phone");
      const emailIdx = resolveColumn(headers, "email");
      const addressIdx = resolveColumn(headers, "address");
      const notesIdx = resolveColumn(headers, "notes");
      const tierIdx = resolveColumn(headers, "pricing_tier");
      const routeIdx = resolveColumn(headers, "route_day");
      const portalEmailIdx = resolveColumn(headers, "portal_email");

      const imported: ImportedClientRow[] = rows.slice(1).map((cols) => ({
        name: (cols[nameIdx] ?? "").trim(),
        contact_name: contactIdx >= 0 ? (cols[contactIdx] ?? "").trim() : "",
        phone: phoneIdx >= 0 ? (cols[phoneIdx] ?? "").trim() : "",
        email: emailIdx >= 0 ? (cols[emailIdx] ?? "").trim() : "",
        address: addressIdx >= 0 ? (cols[addressIdx] ?? "").trim() : "",
        notes: notesIdx >= 0 ? (cols[notesIdx] ?? "").trim() : "",
        pricing_tier: normalizeTier(tierIdx >= 0 ? (cols[tierIdx] ?? "").trim().toLowerCase() : ""),
        route_day: routeIdx >= 0 ? (cols[routeIdx] ?? "").trim() : "",
        portal_email: portalEmailIdx >= 0 ? (cols[portalEmailIdx] ?? "").trim().toLowerCase() || undefined : undefined,
      })).filter((r) => r.name.length > 0);

      if (imported.length === 0) { toast({ title: "No client rows found", description: "The CSV did not contain any rows with a client name.", variant: "destructive" }); setImporting(false); return; }

      let createdClients = 0, createdPortalUsers = 0, failedRows = 0;
      for (const row of imported) {
        const clientPayload: TablesInsert<"clients"> = { name: row.name, contact_name: row.contact_name, phone: row.phone, email: row.email, address: row.address, notes: row.notes, pricing_tier: row.pricing_tier, route_day: row.route_day };
        const { data: insertedClient, error: clientError } = await supabase.from("clients").insert(clientPayload).select("id").single();
        if (clientError || !insertedClient?.id) { failedRows += 1; continue; }
        createdClients += 1;
        if (row.portal_email) {
          const { error: portalError } = await supabase.from("portal_users").insert({ client_id: insertedClient.id, email: row.portal_email, status: "invited" });
          if (portalError) failedRows += 1;
          else createdPortalUsers += 1;
        }
      }
      invalidateClients();
      invalidateRugs();
      toast({ title: "Client import complete", description: `${createdClients} clients added, ${createdPortalUsers} portal logins staged as invited, ${failedRows} rows failed. No onboarding emails were sent.` });
    } catch (error) {
      toast({ title: "CSV import failed", description: error instanceof Error ? error.message : "Unknown parsing error", variant: "destructive" });
    }
    setImporting(false);
  };

  const triggerCsvPicker = () => { if (!importing) csvInputRef.current?.click(); };
  const handleCsvFileChange = async (event: ChangeEvent<HTMLInputElement>) => { const file = event.target.files?.[0]; event.target.value = ""; if (file) await handleCsvImport(file); };

  // Portal user management
  const addPortalUser = async () => {
    const email = newPortalEmail.trim().toLowerCase();
    if (!email || !editingId) return;
    if (portalUsers.some((u) => u.email === email)) { toast({ title: "Email already exists", variant: "destructive" }); return; }
    const { error } = await supabase.from("portal_users").insert({ client_id: editingId, email, status: "invited" });
    if (error) { toast({ title: "Failed", description: error.message, variant: "destructive" }); return; }
    setNewPortalEmail("");
    toast({ title: "Portal login staged", description: `${email} added as invited. Activate and send onboarding when ready.` });
    fetchPortalUsers(editingId);
  };

  const sendOnboardingEmail = async (portalUserId: string) => {
    const authHeaders = await getFunctionAuthHeaders();
    if (!authHeaders) { toast({ title: "Session expired", description: "Please sign out and sign in again before sending onboarding email.", variant: "destructive" }); return false; }

    const { data, error } = await supabase.functions.invoke<OnboardingEmailResponse>("send-portal-onboarding-email", { body: { portal_user_id: portalUserId }, headers: authHeaders });

    if (error || data?.error) {
      const detail = extractOnboardingErrorDetail(data?.details);
      toast({ title: "Onboarding email failed", description: detail ? `${mapOnboardingEmailErrorMessage(data?.error || error?.message)} (${detail})` : mapOnboardingEmailErrorMessage(data?.error || error?.message), variant: "destructive" });
      return false;
    }

    if (data?.provider_status === "sent") {
      toast({ title: "Onboarding email sent" });
    } else if (data?.provider_status === "failed") {
      const providerMessage = extractProviderMessage(data.provider_response) ?? "Email provider rejected delivery.";
      const instructions = data.delivery_instructions;
      if (instructions) {
        try { await navigator.clipboard.writeText(buildManualOnboardingInstructions(instructions)); toast({ title: "Email delivery failed; instructions copied", description: providerMessage, variant: "destructive" }); }
        catch { toast({ title: "Email delivery failed", description: `${providerMessage} Copy details manually from the portal user record.`, variant: "destructive" }); }
      } else { toast({ title: "Email delivery failed", description: providerMessage, variant: "destructive" }); }
    } else {
      const instructions = data?.delivery_instructions;
      if (instructions) {
        try { await navigator.clipboard.writeText(buildManualOnboardingInstructions(instructions)); toast({ title: "No email provider configured", description: "Manual sign-in instructions were copied to your clipboard." }); }
        catch { toast({ title: "No email provider configured", description: "Copy sign-in instructions manually from the portal user details." }); }
      } else { toast({ title: "Account activated", description: "Email provider is not configured, so no outbound email was sent." }); }
    }
    return true;
  };

  const activatePortalUser = async (portalUser: PortalUser, sendEmail: boolean) => {
    if (!editingId) return;
    setPortalActionId(portalUser.id);
    if (portalUser.status !== "active") {
      const { error: activateError } = await supabase.from("portal_users").update({ status: "active" }).eq("id", portalUser.id);
      if (activateError) { toast({ title: "Activation failed", description: activateError.message, variant: "destructive" }); setPortalActionId(null); return; }
    }
    if (sendEmail) await sendOnboardingEmail(portalUser.id);
    else toast({ title: "Portal user activated", description: `${portalUser.email} can now sign in.` });
    await fetchPortalUsers(editingId);
    setPortalActionId(null);
  };

  const removePortalUser = async (id: string) => {
    const user = portalUsers.find((u) => u.id === id);
    await supabase.from("portal_users").delete().eq("id", id);
    if (user) toast({ title: "Portal user removed", description: user.email });
    if (editingId) fetchPortalUsers(editingId);
  };

  const filteredClients = useMemo(() => {
    let result = clients;
    if (filterDay) {
      result = result.filter((c) => filterDay === "unassigned" ? !c.route_day : c.route_day === filterDay);
    }
    const q = searchQuery.trim().toLowerCase();
    if (q) {
      result = result.filter((c) =>
        c.name.toLowerCase().includes(q) ||
        (c.contact_name ?? "").toLowerCase().includes(q) ||
        (c.phone ?? "").toLowerCase().includes(q) ||
        (c.email ?? "").toLowerCase().includes(q)
      );
    }
    if (sort) {
      const dir = sort.direction === "asc" ? 1 : -1;
      result = [...result].sort((a, b) => {
        let cmp = 0;
        switch (sort.column) {
          case "name": cmp = a.name.localeCompare(b.name); break;
          case "contact": cmp = (a.contact_name ?? "").localeCompare(b.contact_name ?? ""); break;
          case "phone": cmp = (a.phone ?? "").localeCompare(b.phone ?? ""); break;
          case "route_day": cmp = (a.route_day ?? "").localeCompare(b.route_day ?? ""); break;
          case "rugs": cmp = (rugCounts[a.id] ?? 0) - (rugCounts[b.id] ?? 0); break;
          case "tier": cmp = a.pricing_tier.localeCompare(b.pricing_tier); break;
        }
        return cmp * dir;
      });
    }
    return result;
  }, [clients, filterDay, searchQuery, sort, rugCounts]);

  const pagination = usePaginatedList(filteredClients);

  // Reset to page 0 when search or filter changes
  useEffect(() => { pagination.resetPage(); }, [searchQuery, filterDay, sort]);

  const canDeleteClient = hasRole("admin") || isSuperAdmin;

  const deleteClientAccount = async () => {
    if (!editingId || !canDeleteClient) return;
    setDeletingClient(true);
    const { error } = await supabase.from("clients").delete().eq("id", editingId);
    if (error) { toast({ title: "Delete failed", description: error.message, variant: "destructive" }); setDeletingClient(false); return; }
    toast({ title: "Client account deleted" });
    setDeletingClient(false); setSheetOpen(false); setEditingId(null); setPortalUsers([]);
    invalidateClients(); invalidateRugs();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <LoadingState title="Loading clients" description="Fetching client records..." />
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 overflow-auto h-full animate-fade-in-up">
      <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
        <h2 className="text-lg font-semibold text-foreground">Clients</h2>
        <div className="flex items-center gap-2 ml-auto flex-wrap">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search clients..."
              className="pl-8 h-9 w-[200px]"
            />
          </div>
          <Button size="sm" variant="outline" onClick={triggerCsvPicker} disabled={importing}>
            <Upload className="h-4 w-4 mr-1" />
            {importing ? "Importing..." : "Import CSV"}
          </Button>
          <input ref={csvInputRef} type="file" accept=".csv,text/csv" className="hidden" onChange={handleCsvFileChange} />
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
          <Badge variant="secondary" className="text-xs">
            {filteredClients.length === clients.length
              ? `${clients.length}`
              : `${filteredClients.length} of ${clients.length}`}
          </Badge>
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
            <SortableHead col="name" sort={sort} onToggle={toggleSort}>Client</SortableHead>
            <SortableHead col="contact" sort={sort} onToggle={toggleSort} className="hidden md:table-cell">Contact</SortableHead>
            <SortableHead col="phone" sort={sort} onToggle={toggleSort} className="hidden sm:table-cell">Phone</SortableHead>
            <SortableHead col="route_day" sort={sort} onToggle={toggleSort} className="hidden lg:table-cell w-24">Route Day</SortableHead>
            <SortableHead col="rugs" sort={sort} onToggle={toggleSort} className="w-16 text-center">Rugs</SortableHead>
            <SortableHead col="tier" sort={sort} onToggle={toggleSort} className="w-24">Tier</SortableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {pagination.items.map((c) => (
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

      <PaginationControls
        page={pagination.page}
        totalPages={pagination.totalPages}
        total={pagination.total}
        hasPrev={pagination.hasPrev}
        hasNext={pagination.hasNext}
        onPrev={pagination.prevPage}
        onNext={pagination.nextPage}
        label="clients"
      />

      <ClientDetailSheet
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        editingId={editingId}
        form={form}
        onUpdateField={updateField}
        onSave={save}
        portalUsers={portalUsers}
        newPortalEmail={newPortalEmail}
        onNewPortalEmailChange={setNewPortalEmail}
        onAddPortalUser={addPortalUser}
        onRemovePortalUser={removePortalUser}
        onActivatePortalUser={activatePortalUser}
        portalActionId={portalActionId}
        canDeleteClient={canDeleteClient}
        deletingClient={deletingClient}
        onDeleteClient={deleteClientAccount}
      />
    </div>
  );
}
