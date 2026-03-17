import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { supabaseExtended } from "@/integrations/supabase/extended";
import { useMemo } from "react";

export type Notification = {
  id: string;
  user_id: string;
  type: string;
  title: string;
  message: string;
  metadata: unknown;
  read: boolean;
  created_at: string;
};

const NOTIFICATIONS_KEY = "notifications";

export function useNotifications() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const {
    data: notifications = [],
    isLoading,
  } = useQuery({
    queryKey: [NOTIFICATIONS_KEY, user?.id],
    queryFn: async (): Promise<Notification[]> => {
      if (!user?.id) return [];
      const { data, error } = await supabaseExtended
        .from("notifications")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data ?? []) as Notification[];
    },
    enabled: !!user?.id,
    staleTime: 15_000,
    refetchInterval: 15_000,
  });

  const unreadCount = useMemo(
    () => notifications.filter((n) => !n.read).length,
    [notifications],
  );

  const markAsReadMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabaseExtended
        .from("notifications")
        .update({ read: true })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [NOTIFICATIONS_KEY] });
    },
  });

  const markAllAsReadMutation = useMutation({
    mutationFn: async () => {
      if (!user?.id) return;
      const { error } = await supabaseExtended
        .from("notifications")
        .update({ read: true })
        .eq("user_id", user.id)
        .eq("read", false);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [NOTIFICATIONS_KEY] });
    },
  });

  return {
    notifications,
    unreadCount,
    markAsRead: (id: string) => markAsReadMutation.mutate(id),
    markAllAsRead: () => markAllAsReadMutation.mutate(),
    isLoading,
  };
}
