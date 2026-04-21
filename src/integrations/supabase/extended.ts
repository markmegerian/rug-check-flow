import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import type { Database, Json } from "@/integrations/supabase/types";

type PickupRequestStatus = "pending" | "confirmed" | "assigned" | "completed" | "cancelled";
type EstimateStatus = "draft" | "needs_office_review" | "ready_to_send" | "sent" | "approved" | "rejected" | "needs_revision" | "expired";
type CommunicationChannel = "email" | "in_app_chat";
type CommunicationDirection = "outbound" | "inbound";
type PaymentAttemptStatus = "pending" | "succeeded" | "failed";

type RouteStopStatus = "queued" | "in_progress" | "completed" | "completed_with_exceptions" | "unable_to_complete";
type RouteStopItemStatus = "pending" | "verified" | "disputed" | "exception" | "skipped";
type RouteStopItemPhase = "delivery" | "pickup";

type ExtendedTables = Database["public"]["Tables"] & {
  route_stops: {
    Row: {
      id: string; route_date: string; client_id: string; route_day: string;
      assigned_driver_id: string | null; delivery_list_id: string | null;
      status: RouteStopStatus; signature_data_url: string | null;
      started_at: string | null; completed_at: string | null;
      exception_code: string | null; notes: string; created_at: string;
    };
    Insert: Record<string, unknown>;
    Update: Record<string, unknown>;
    Relationships: [];
  };
  route_stop_items: {
    Row: {
      id: string; route_stop_id: string; phase: RouteStopItemPhase;
      status: RouteStopItemStatus; rug_id: string | null;
      pickup_request_item_id: string | null; delivery_list_item_id: string | null;
      notes: string; photo_urls: string[]; exception_code: string | null; created_at: string;
    };
    Insert: Record<string, unknown>;
    Update: Record<string, unknown>;
    Relationships: [];
  };
  delivery_list_items: {
    Row: {
      id: string; delivery_list_id: string; rug_id: string;
      loaded_on_truck: boolean; created_at: string;
    };
    Insert: Record<string, unknown>;
    Update: Record<string, unknown>;
    Relationships: [];
  };
  communication_events: {
    Row: {
      id: string;
      client_id: string | null;
      rug_id: string | null;
      estimate_id: string | null;
      invoice_id: string | null;
      channel: CommunicationChannel;
      direction: CommunicationDirection;
      subject: string;
      body: string;
      sent_to: string | null;
      event_type: string;
      created_by: string | null;
      created_at: string;
    };
    Insert: {
      id?: string;
      client_id?: string | null;
      rug_id?: string | null;
      estimate_id?: string | null;
      invoice_id?: string | null;
      channel?: CommunicationChannel;
      direction?: CommunicationDirection;
      subject?: string;
      body?: string;
      sent_to?: string | null;
      event_type?: string;
      created_by?: string | null;
      created_at?: string;
    };
    Update: {
      id?: string;
      client_id?: string | null;
      rug_id?: string | null;
      estimate_id?: string | null;
      invoice_id?: string | null;
      channel?: CommunicationChannel;
      direction?: CommunicationDirection;
      subject?: string;
      body?: string;
      sent_to?: string | null;
      event_type?: string;
      created_by?: string | null;
      created_at?: string;
    };
    Relationships: [];
  };
  estimate_items: {
    Row: {
      id: string;
      estimate_id: string;
      rug_service_id: string | null;
      description: string;
      quantity: number;
      unit_price: number;
      total: number;
      created_at: string;
      client_approved: boolean | null;
      client_decision_at: string | null;
      service_category: string;
    };
    Insert: {
      id?: string;
      estimate_id: string;
      rug_service_id?: string | null;
      description: string;
      quantity?: number;
      unit_price?: number;
      total?: number;
      created_at?: string;
      client_approved?: boolean | null;
      client_decision_at?: string | null;
      service_category?: string;
    };
    Update: {
      id?: string;
      estimate_id?: string;
      rug_service_id?: string | null;
      description?: string;
      quantity?: number;
      unit_price?: number;
      total?: number;
      created_at?: string;
      client_approved?: boolean | null;
      client_decision_at?: string | null;
      service_category?: string;
    };
    Relationships: [];
  };
  estimates: {
    Row: {
      id: string;
      rug_id: string;
      client_id: string | null;
      estimate_number: string;
      status: EstimateStatus;
      version: number;
      total: number;
      sent_at: string | null;
      approved_at: string | null;
      rejected_at: string | null;
      expires_at: string | null;
      created_by: string | null;
      created_at: string;
      updated_at: string;
    };
    Insert: {
      id?: string;
      rug_id: string;
      client_id?: string | null;
      estimate_number: string;
      status?: EstimateStatus;
      version?: number;
      total?: number;
      sent_at?: string | null;
      approved_at?: string | null;
      rejected_at?: string | null;
      expires_at?: string | null;
      created_by?: string | null;
      created_at?: string;
      updated_at?: string;
    };
    Update: {
      id?: string;
      rug_id?: string;
      client_id?: string | null;
      estimate_number?: string;
      status?: EstimateStatus;
      version?: number;
      total?: number;
      sent_at?: string | null;
      approved_at?: string | null;
      rejected_at?: string | null;
      expires_at?: string | null;
      created_by?: string | null;
      created_at?: string;
      updated_at?: string;
    };
    Relationships: [];
  };
  estimate_send_batches: {
    Row: {
      id: string;
      client_id: string;
      company_id: string | null;
      scheduled_for: string;
      sent_at: string | null;
      status: "queued" | "sent" | "failed" | "cancelled";
      recipient_email: string | null;
      subject: string | null;
      body: string | null;
      created_by: string | null;
      created_at: string;
      updated_at: string;
    };
    Insert: Record<string, unknown>;
    Update: Record<string, unknown>;
    Relationships: [];
  };
  estimate_send_batch_items: {
    Row: {
      id: string;
      batch_id: string;
      estimate_id: string;
      created_at: string;
    };
    Insert: Record<string, unknown>;
    Update: Record<string, unknown>;
    Relationships: [];
  };
  payment_attempts: {
    Row: {
      id: string;
      invoice_id: string;
      client_id: string | null;
      provider: string;
      provider_payment_ref: string | null;
      amount: number;
      status: PaymentAttemptStatus;
      attempted_at: string;
      error_message: string | null;
      metadata: Json;
    };
    Insert: {
      id?: string;
      invoice_id: string;
      client_id?: string | null;
      provider?: string;
      provider_payment_ref?: string | null;
      amount?: number;
      status?: PaymentAttemptStatus;
      attempted_at?: string;
      error_message?: string | null;
      metadata?: Json;
    };
    Update: {
      id?: string;
      invoice_id?: string;
      client_id?: string | null;
      provider?: string;
      provider_payment_ref?: string | null;
      amount?: number;
      status?: PaymentAttemptStatus;
      attempted_at?: string;
      error_message?: string | null;
      metadata?: Json;
    };
    Relationships: [
      {
        foreignKeyName: "payment_attempts_client_id_fkey";
        columns: ["client_id"];
        isOneToOne: false;
        referencedRelation: "clients";
        referencedColumns: ["id"];
      },
      {
        foreignKeyName: "payment_attempts_invoice_id_fkey";
        columns: ["invoice_id"];
        isOneToOne: false;
        referencedRelation: "invoices";
        referencedColumns: ["id"];
      },
    ];
  };
  pickup_request_items: {
    Row: {
      id: string;
      pickup_request_id: string;
      rug_id: string | null;
      rug_number: string;
      rug_type: string;
      length: number | null;
      width: number | null;
      is_new: boolean;
      created_at: string;
      verified: boolean;
      driver_notes: string;
      driver_photo_urls: string[];
      checked_in_rug_id: string | null;
      estimate_requested: boolean;
      estimate_request_details: string | null;
    };
    Insert: {
      id?: string;
      pickup_request_id: string;
      rug_id?: string | null;
      rug_number: string;
      rug_type?: string;
      length?: number | null;
      width?: number | null;
      is_new?: boolean;
      created_at?: string;
      verified?: boolean;
      driver_notes?: string;
      driver_photo_urls?: string[];
      checked_in_rug_id?: string | null;
      estimate_requested?: boolean;
      estimate_request_details?: string | null;
    };
    Update: {
      id?: string;
      pickup_request_id?: string;
      rug_id?: string | null;
      rug_number?: string;
      rug_type?: string;
      length?: number | null;
      width?: number | null;
      is_new?: boolean;
      created_at?: string;
      verified?: boolean;
      driver_notes?: string;
      driver_photo_urls?: string[];
      checked_in_rug_id?: string | null;
      estimate_requested?: boolean;
      estimate_request_details?: string | null;
    };
    Relationships: [];
  };
  pickup_requests: {
    Row: {
      id: string;
      client_id: string;
      route_day: string;
      scheduled_date: string;
      status: PickupRequestStatus;
      notes: string;
      created_by: string | null;
      created_at: string;
      updated_at: string;
      assigned_driver_id: string | null;
      assigned_at: string | null;
      completed_at: string | null;
      signature_data_url: string | null;
    };
    Insert: {
      id?: string;
      client_id: string;
      route_day?: string;
      scheduled_date: string;
      status?: PickupRequestStatus;
      notes?: string;
      created_by?: string | null;
      created_at?: string;
      updated_at?: string;
      assigned_driver_id?: string | null;
      assigned_at?: string | null;
      completed_at?: string | null;
      signature_data_url?: string | null;
    };
    Update: {
      id?: string;
      client_id?: string;
      route_day?: string;
      scheduled_date?: string;
      status?: PickupRequestStatus;
      notes?: string;
      created_by?: string | null;
      created_at?: string;
      updated_at?: string;
      assigned_driver_id?: string | null;
      assigned_at?: string | null;
      completed_at?: string | null;
      signature_data_url?: string | null;
    };
    Relationships: [];
  };
};

type ExtendedFunctions = Database["public"]["Functions"] & {
  get_jobs_summary: {
    Args: Record<string, never>;
    Returns: {
      job_key: string;
      source_type: string;
      client_id: string;
      client_name: string;
      client_address: string | null;
      scheduled_date: string;
      route_day: string;
      request_ids: string[] | null;
      primary_request_id: string | null;
      statuses: PickupRequestStatus[] | null;
      updated_at: string;
      notes: string[] | null;
      items: Json;
    }[];
  };
  get_thread_summaries: {
    Args: { p_client_id?: string | null };
    Returns: {
      id: string;
      client_id: string;
      entity_id: string | null;
      thread_type: Database["public"]["Enums"]["thread_type"];
      status: Database["public"]["Enums"]["thread_status"];
      created_at: string;
      updated_at: string;
      client: Json | null;
      entity_label: string | null;
      last_message_at: string | null;
      last_message_body: string | null;
      last_message_sender: string | null;
      message_count: number;
      visible_message_count: number;
      unread: boolean;
    }[];
  };
  get_delivery_prep_snapshot: {
    Args: { p_target_date: string };
    Returns: {
      delivery_list_id: string;
      route_day: string;
      target_date: string;
      list_status: Database["public"]["Enums"]["delivery_list_status"];
      client_id: string;
      client_name: string;
      client_address: string | null;
      rug_id: string;
      rug_tag: string;
      rug_description: string | null;
      rug_status: string;
      size_length: number | null;
      size_width: number | null;
      confirmed_for_delivery: boolean;
      loaded_on_truck: boolean;
    }[];
  };
  get_checkin_pending_pickups: {
    Args: { p_target_date: string };
    Returns: {
      pickup_request_item_id: string;
      pickup_request_id: string;
      client_id: string;
      client_name: string;
      scheduled_date: string;
      rug_number: string;
      rug_type: string | null;
      length: number | null;
      width: number | null;
      estimate_requested: boolean;
      estimate_request_details: string | null;
    }[];
  };
  queue_estimate_group_batch: {
    Args: { p_estimate_ids: string[] };
    Returns: {
      queued_count: number;
    }[];
  };
  mark_portal_onboarding_complete: {
    Args: Record<string, never>;
    Returns: boolean;
  };
  mark_portal_password_changed: {
    Args: Record<string, never>;
    Returns: boolean;
  };
};

export type ExtendedDatabase = Omit<Database, "public"> & {
  public: Omit<Database["public"], "Tables" | "Enums" | "Functions"> & {
    Tables: ExtendedTables;
    Functions: ExtendedFunctions;
    Enums: Database["public"]["Enums"] & {
      communication_channel: CommunicationChannel;
      communication_direction: CommunicationDirection;
      estimate_status: EstimateStatus;
      payment_attempt_status: PaymentAttemptStatus;
      pickup_request_status: PickupRequestStatus;
    };
  };
};

export type ExtendedTableRow<TableName extends keyof ExtendedDatabase["public"]["Tables"]> =
  ExtendedDatabase["public"]["Tables"][TableName]["Row"];

export type ExtendedTableInsert<TableName extends keyof ExtendedDatabase["public"]["Tables"]> =
  ExtendedDatabase["public"]["Tables"][TableName]["Insert"];

export type EstimateReviewGroupRow = {
  client_id: string;
  client_name: string | null;
  client_email: string | null;
  company_name: string | null;
  status: EstimateStatus;
  estimate_count: number;
  total_amount: number;
  ready_count: number;
  review_count: number;
  sent_count: number;
  latest_created_at: string | null;
  estimate_ids: string[];
};

export const supabaseExtended = supabase as unknown as SupabaseClient<ExtendedDatabase>;
