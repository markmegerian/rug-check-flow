import { supabaseExtended } from "@/integrations/supabase/extended";
import type { Database } from "@/integrations/supabase/types";
import type { JobItemView, JobView } from "@/lib/jobs-view";

type JobsSummaryRow = {
  job_key: string;
  source_type: "pickup" | "walkin";
  client_id: string;
  client_name: string;
  client_address: string | null;
  scheduled_date: string;
  route_day: string;
  request_ids: string[] | null;
  primary_request_id: string | null;
  statuses: Database["public"]["Enums"]["pickup_request_status"][] | null;
  updated_at: string;
  notes: string[] | null;
  items: unknown;
  total_count: number;
};

export type JobsSummaryPage = {
  rows: JobView[];
  total: number;
};

function parseJobItems(items: unknown): JobItemView[] {
  if (!Array.isArray(items)) return [];
  return items as JobItemView[];
}

export async function fetchJobsSummary({
  sourceType,
  search,
  page = 0,
  pageSize = 10,
}: {
  sourceType?: "pickup" | "walkin";
  search?: string;
  page?: number;
  pageSize?: number;
} = {}): Promise<JobsSummaryPage> {
  const { data, error } = await supabaseExtended.rpc("get_jobs_summary", {
    p_source_type: sourceType ?? null,
    p_search: search?.trim() ? search.trim() : null,
    p_page: page,
    p_page_size: pageSize,
  });
  if (error) throw error;

  const rows = (data ?? []) as JobsSummaryRow[];
  return {
    rows: rows.map((row) => ({
      key: row.job_key,
      sourceType: row.source_type,
      clientId: row.client_id,
      clientName: row.client_name,
      clientAddress: row.client_address,
      scheduledDate: row.scheduled_date,
      routeDay: row.route_day,
      requestIds: row.request_ids ?? [],
      primaryRequestId: row.primary_request_id ?? "",
      statuses: row.statuses ?? [],
      updatedAt: row.updated_at,
      notes: row.notes ?? [],
      items: parseJobItems(row.items),
    })),
    total: rows.length > 0 ? Number(rows[0].total_count ?? 0) : 0,
  };
}
