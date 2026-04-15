import { supabase } from "@/integrations/supabase/client";
import { isCleaningCategory } from "@/lib/service-pricing";

type BaseRugServiceRow = {
  id?: string;
  rug_id: string;
  service_id: string | null;
  service_name: string;
  unit_price: number;
  line_total: number;
  edges: string[] | null;
  approval_status?: string | null;
};

let approvalStatusColumnAvailable: boolean | null = null;

function isMissingApprovalStatusColumnError(message: string | undefined) {
  return /approval_status/i.test(message ?? "") && /column|schema cache|Could not find/i.test(message ?? "");
}

function normalizeApprovalStatus(value: string | null | undefined) {
  if (value === "approved" || value === "rejected" || value === "pending") return value;
  return approvalStatusColumnAvailable === false ? "approved" : "pending";
}

function normalizeRow<T extends BaseRugServiceRow>(row: T) {
  return {
    ...row,
    edges: row.edges ?? [],
    approval_status: normalizeApprovalStatus(row.approval_status),
  };
}

export function isRugServiceApprovalStatusAvailable() {
  return approvalStatusColumnAvailable !== false;
}

export async function fetchRugServicesByRugId(rugId: string) {
  if (approvalStatusColumnAvailable === false) {
    const { data, error } = await supabase
      .from("rug_services")
      .select("id, rug_id, service_id, service_name, unit_price, line_total, edges")
      .eq("rug_id", rugId)
      .order("created_at", { ascending: true });

    return { data: ((data ?? []) as BaseRugServiceRow[]).map(normalizeRow), error, approvalStatusAvailable: false };
  }

  const withStatus = await supabase
    .from("rug_services")
    .select("id, rug_id, service_id, service_name, unit_price, line_total, edges, approval_status")
    .eq("rug_id", rugId)
    .order("created_at", { ascending: true });

  if (!withStatus.error) {
    approvalStatusColumnAvailable = true;
    return { data: ((withStatus.data ?? []) as BaseRugServiceRow[]).map(normalizeRow), error: null, approvalStatusAvailable: true };
  }

  if (!isMissingApprovalStatusColumnError(withStatus.error.message)) {
    return { data: [] as ReturnType<typeof normalizeRow>[], error: withStatus.error, approvalStatusAvailable: approvalStatusColumnAvailable !== false };
  }

  approvalStatusColumnAvailable = false;
  const fallback = await supabase
    .from("rug_services")
    .select("id, rug_id, service_id, service_name, unit_price, line_total, edges")
    .eq("rug_id", rugId)
    .order("created_at", { ascending: true });

  return { data: ((fallback.data ?? []) as BaseRugServiceRow[]).map(normalizeRow), error: fallback.error, approvalStatusAvailable: false };
}

export async function fetchRugServicesForRugIds(rugIds: string[]) {
  if (rugIds.length === 0) return { data: [] as ReturnType<typeof normalizeRow>[], error: null, approvalStatusAvailable: approvalStatusColumnAvailable !== false };

  if (approvalStatusColumnAvailable === false) {
    const { data, error } = await supabase
      .from("rug_services")
      .select("rug_id, line_total, service_name, edges")
      .in("rug_id", rugIds);

    return { data: ((data ?? []) as BaseRugServiceRow[]).map(normalizeRow), error, approvalStatusAvailable: false };
  }

  const withStatus = await supabase
    .from("rug_services")
    .select("rug_id, line_total, service_name, edges, approval_status")
    .in("rug_id", rugIds);

  if (!withStatus.error) {
    approvalStatusColumnAvailable = true;
    return { data: ((withStatus.data ?? []) as BaseRugServiceRow[]).map(normalizeRow), error: null, approvalStatusAvailable: true };
  }

  if (!isMissingApprovalStatusColumnError(withStatus.error.message)) {
    return { data: [] as ReturnType<typeof normalizeRow>[], error: withStatus.error, approvalStatusAvailable: approvalStatusColumnAvailable !== false };
  }

  approvalStatusColumnAvailable = false;
  const fallback = await supabase
    .from("rug_services")
    .select("rug_id, line_total, service_name, edges")
    .in("rug_id", rugIds);

  return { data: ((fallback.data ?? []) as BaseRugServiceRow[]).map(normalizeRow), error: fallback.error, approvalStatusAvailable: false };
}

export async function insertRugServices(rows: BaseRugServiceRow[]) {
  if (rows.length === 0) return { error: null, approvalStatusAvailable: approvalStatusColumnAvailable !== false };

  const serviceIds = [...new Set(rows.map((row) => row.service_id).filter(Boolean))] as string[];
  let categoryByServiceId: Record<string, string> = {};

  if (serviceIds.length > 0) {
    const { data } = await supabase
      .from("services")
      .select("id, category")
      .in("id", serviceIds);
    categoryByServiceId = Object.fromEntries(((data ?? []) as Array<{ id: string; category: string | null }>).map((row) => [row.id, row.category ?? ""]));
  }

  const rowsWithStatus = rows.map((row) => {
    const category = row.service_id ? categoryByServiceId[row.service_id] : null;
    const defaultApprovalStatus = isCleaningCategory(category) ? "approved" : "pending";
    return {
      ...row,
      edges: row.edges ?? [],
      approval_status: row.approval_status === "rejected"
        ? "rejected"
        : row.approval_status === "approved"
          ? "approved"
          : defaultApprovalStatus,
    };
  });

  if (approvalStatusColumnAvailable === false) {
    const { error } = await supabase.from("rug_services").insert(
      rowsWithStatus.map(({ approval_status: _approvalStatus, ...row }) => row),
    );
    return { error, approvalStatusAvailable: false };
  }

  const withStatus = await supabase.from("rug_services").insert(rowsWithStatus);
  if (!withStatus.error) {
    approvalStatusColumnAvailable = true;
    return { error: null, approvalStatusAvailable: true };
  }

  if (!isMissingApprovalStatusColumnError(withStatus.error.message)) {
    return { error: withStatus.error, approvalStatusAvailable: approvalStatusColumnAvailable !== false };
  }

  approvalStatusColumnAvailable = false;
  const fallback = await supabase.from("rug_services").insert(
    rowsWithStatus.map(({ approval_status: _approvalStatus, ...row }) => row),
  );
  return { error: fallback.error, approvalStatusAvailable: false };
}

export async function updateRugServiceApprovalStatus(serviceRowId: string, approvalStatus: "pending" | "approved" | "rejected") {
  if (approvalStatusColumnAvailable === false) {
    return { error: null, approvalStatusAvailable: false, skipped: true };
  }

  const result = await supabase
    .from("rug_services")
    .update({ approval_status: approvalStatus })
    .eq("id", serviceRowId);

  if (!result.error) {
    approvalStatusColumnAvailable = true;
    return { error: null, approvalStatusAvailable: true, skipped: false };
  }

  if (!isMissingApprovalStatusColumnError(result.error.message)) {
    return { error: result.error, approvalStatusAvailable: approvalStatusColumnAvailable !== false, skipped: false };
  }

  approvalStatusColumnAvailable = false;
  return { error: null, approvalStatusAvailable: false, skipped: true };
}
