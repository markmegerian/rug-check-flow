import { useEffect, useRef } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { runAllReminders } from "@/lib/reminder-engine";

/**
 * Periodically runs the reminder engine to generate automated notifications
 * for overdue invoices, stale pickup requests, and unresolved disputes.
 *
 * Only activates for users with "admin" or "office" roles.
 * Runs once on mount and then every 30 minutes.
 */
export function useReminderEngine() {
  const { user, hasRole } = useAuth();
  const intervalRef = useRef<ReturnType<typeof setInterval>>();

  useEffect(() => {
    if (!user || !(hasRole("admin") || hasRole("office"))) return;

    const run = async () => {
      try {
        // Get all admin/office user IDs to notify
        const { data: roles } = await supabase
          .from("user_roles")
          .select("user_id")
          .in("role", ["admin", "office"]);

        const staffIds = [...new Set((roles ?? []).map((r) => r.user_id))];
        if (staffIds.length > 0) {
          await runAllReminders(staffIds);
        }
      } catch (err) {
        // Silently swallow – the reminder engine is best-effort and should
        // never disrupt the user experience.
        console.error("[ReminderEngine]", err);
      }
    };

    // Run once on mount, then every 30 minutes
    run();
    intervalRef.current = setInterval(run, 30 * 60 * 1000);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [user, hasRole]);
}
