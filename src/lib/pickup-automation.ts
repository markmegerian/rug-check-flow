import { supabaseExtended } from "@/integrations/supabase/extended";

/**
 * Auto-assign a pickup request to the single driver account.
 * Finds the first user with "driver" role and assigns + confirms the pickup.
 * Returns the driver name on success, null if no driver found.
 */
export async function autoAssignPickupToDriver(
  pickupRequestId: string,
): Promise<{ driverName: string } | null> {
  // Find the first driver
  const { data: roleRows } = await supabaseExtended
    .from("user_roles")
    .select("user_id")
    .eq("role", "driver")
    .limit(1);

  const driverId = roleRows?.[0]?.user_id;
  if (!driverId) return null;

  // Get driver name
  const { data: profile } = await supabaseExtended
    .from("profiles")
    .select("full_name, email")
    .eq("user_id", driverId)
    .limit(1)
    .maybeSingle();

  const driverName = profile?.full_name?.trim() || profile?.email || "Driver";

  // Assign and set status to "assigned"
  const now = new Date().toISOString();
  const { error } = await supabaseExtended
    .from("pickup_requests")
    .update({
      assigned_driver_id: driverId,
      assigned_at: now,
      status: "assigned",
    })
    .eq("id", pickupRequestId);

  if (error) {
    console.warn("Auto-assign pickup failed:", error.message);
    return null;
  }

  return { driverName };
}
