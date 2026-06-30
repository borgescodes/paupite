import { useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";

export type NotificationMatchPreview = {
  id: string;
  home: string;
  away: string;
  homeCountryCode: string | null;
  awayCountryCode: string | null;
};

export type Notification = Tables<"notifications"> & {
  matchPreview?: NotificationMatchPreview | null;
};

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

function notificationMatchId(notification: Tables<"notifications">) {
  if (notification.type !== "bet_scored" && notification.type !== "bet_reminder") return null;
  const data = notification.data;
  if (!data || typeof data !== "object" || Array.isArray(data)) return null;
  const matchId = data.match_id;
  return typeof matchId === "string" && matchId.length > 0 ? matchId : null;
}

async function withMatchPreviews(
  notifications: Tables<"notifications">[],
): Promise<Notification[]> {
  const matchIds = Array.from(
    new Set(
      notifications
        .map((notification) => notificationMatchId(notification))
        .filter((matchId): matchId is string => Boolean(matchId)),
    ),
  );

  if (matchIds.length === 0) return notifications;

  const { data, error } = await supabase
    .from("matches")
    .select(
      "id,home_team:teams!matches_home_team_id_fkey(short_name,name,country_code),away_team:teams!matches_away_team_id_fkey(short_name,name,country_code)",
    )
    .in("id", matchIds);

  if (error) return notifications;

  const previews = new Map<string, NotificationMatchPreview>();
  for (const match of data ?? []) {
    const homeTeam = Array.isArray(match.home_team) ? match.home_team[0] : match.home_team;
    const awayTeam = Array.isArray(match.away_team) ? match.away_team[0] : match.away_team;
    previews.set(match.id, {
      id: match.id,
      home: homeTeam?.short_name || homeTeam?.name || "CASA",
      away: awayTeam?.short_name || awayTeam?.name || "FORA",
      homeCountryCode: homeTeam?.country_code ?? null,
      awayCountryCode: awayTeam?.country_code ?? null,
    });
  }

  return notifications.map((notification) => ({
    ...notification,
    matchPreview: previews.get(notificationMatchId(notification) ?? "") ?? null,
  }));
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
      return withMatchPreviews((data ?? []) as Tables<"notifications">[]);
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

  const clearAllNotificationsMutation = useMutation({
    mutationFn: async () => {
      const ownerId = requireUserId(userId);
      const { error } = await supabase.from("notifications").delete().eq("user_id", ownerId);

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
    clearAllNotifications: clearAllNotificationsMutation.mutateAsync,
    isMarkingAsRead: markAsReadMutation.isPending,
    isMarkingAllAsRead: markAllAsReadMutation.isPending,
    isClearingAllNotifications: clearAllNotificationsMutation.isPending,
  };
}
