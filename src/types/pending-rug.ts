export interface PendingRug {
  id: string;
  rugNumber: string;
  clientName: string;
  rugType?: string;
  length?: number;
  width?: number;
  requestedServices: string[];
  source: "pickup" | "walkin";
  pickupRequestId?: string;
  pickupRequestItemId?: string;
  pickupDate?: string;
  /** Client requested an estimate for this rug; show during check-in so staff don't miss it. */
  estimateRequested?: boolean;
  estimateRequestDetails?: string;
}
