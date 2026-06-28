import { useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";

export type Notification = Tables<"notifications">;

const notificationsQueryKey = (userId: string | null | undefined) =>
  ["notifications", userId ?? null] as const;

const notificationListQueryKey = (userId: string | null | undefined) =>
  [...notificationsQueryKey(userId), "list"] as const;

const notificationUnreadQueryKey = (userId: string | null | undefined) =>
  [...notificationsQueryKey(userId), "unread-count"] as const;

function requireUserId(userId: string | null | undefined) {
  if (!userId) throw new Error("Usuário não autenticado.");
  return userId;
}

export function useNotifications(userId: string | null | undefined) {
  const queryClient = useQueryClient();
  const enabled = Boolean(userId);

  const notificationsQuery = useQuery({
    queryKey: notificationListQueryKey(userId),
    enabled,
    queryFn: async () => {
      const ownerId = requireUserId(userId);
      const { data, error } = await supabase
        .from("notifications")
        .select("id,user_id,type,title,message,data,read_at,created_at")
        .eq("user_id", ownerId)
        .order("created_at", { ascending: false })
        .limit(50);

      if (error) throw new Error(error.message);
      return (data ?? []) as Notification[];
    },
  });

  const unreadQuery = useQuery({
    queryKey: notificationUnreadQueryKey(userId),
    enabled,
    queryFn: async () => {
      const ownerId = requireUserId(userId);
      const { count, error } = await supabase
        .from("notifications")
        .select("id", { count: "exact", head: true })
        .eq("user_id", ownerId)
        .is("read_at", null);

      if (error) throw new Error(error.message);
      return count ?? 0;
    },
  });

  useEffect(() => {
    if (!userId) return;

    const channel = supabase
      .channel(`notifications-${userId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "notifications", filter: `user_id=eq.${userId}` },
        () => {
          void queryClient.invalidateQueries({ queryKey: notificationsQueryKey(userId) });
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [queryClient, userId]);

  const markAsReadMutation = useMutation({
    mutationFn: async (notificationId: string) => {
      const ownerId = requireUserId(userId);
      const { error } = await supabase
        .from("notifications")
        .update({ read_at: new Date().toISOString() })
        .eq("id", notificationId)
        .eq("user_id", ownerId)
        .is("read_at", null);

      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: notificationsQueryKey(userId) });
    },
  });

  const markAllAsReadMutation = useMutation({
    mutationFn: async () => {
      const ownerId = requireUserId(userId);
      const { error } = await supabase
        .from("notifications")
        .update({ read_at: new Date().toISOString() })
        .eq("user_id", ownerId)
        .is("read_at", null);

      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: notificationsQueryKey(userId) });
    },
  });

  return {
    notifications: notificationsQuery.data ?? [],
    unreadCount: unreadQuery.data ?? 0,
    isLoading: notificationsQuery.isLoading || unreadQuery.isLoading,
    isRefreshing: notificationsQuery.isFetching || unreadQuery.isFetching,
    error: notificationsQuery.error ?? unreadQuery.error,
    markAsRead: markAsReadMutation.mutateAsync,
    markAllAsRead: markAllAsReadMutation.mutateAsync,
    isMarkingAsRead: markAsReadMutation.isPending,
    isMarkingAllAsRead: markAllAsReadMutation.isPending,
  };
}
