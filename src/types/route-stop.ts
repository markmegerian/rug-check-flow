export type RouteStopStatus = "queued" | "in_progress" | "completed" | "completed_with_exceptions" | "unable_to_complete";

export type RouteStopRow = {
  id: string;
  route_date: string;
  client_id: string;
  route_day: string;
  assigned_driver_id: string | null;
  delivery_list_id: string | null;
  status: RouteStopStatus;
  signature_data_url: string | null;
  started_at: string | null;
  completed_at: string | null;
  exception_code: string | null;
  notes: string;
  clients: { name: string; address: string } | null;
};

export type RouteStopItemRow = {
  id: string;
  route_stop_id: string;
  phase: "delivery" | "pickup";
  status: "pending" | "verified" | "disputed" | "exception" | "skipped";
  rug_id: string | null;
  pickup_request_item_id: string | null;
  delivery_list_item_id: string | null;
  notes: string;
  photo_urls: string[];
  exception_code: string | null;
  rugs: { tag: string; size_length: number | null; size_width: number | null } | null;
};

export type StopItem = {
  id: string;
  phase: "delivery" | "pickup";
  status: "pending" | "verified" | "disputed" | "exception" | "skipped";
  rugTag: string;
  rugSize: string;
  notes: string;
  photos: string[];
  exceptionCode?: string;
  deliveryListItemId?: string | null;
  loadedOnTruck?: boolean;
};

export type Stop = {
  id: string;
  clientName: string;
  clientAddress: string;
  date: string;
  status: RouteStopStatus;
  signatureDataUrl?: string;
  startedAt?: string;
  completedAt?: string;
  deliveryListId: string | null;
  deliveryItems: StopItem[];
  pickupItems: StopItem[];
  pendingEventCount: number;
};
