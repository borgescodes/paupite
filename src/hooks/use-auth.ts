import { useEffect, useSyncExternalStore } from "react";
import { useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { User } from "@supabase/supabase-js";

export interface Profile {
  id: string;
  email: string;
  display_name: string | null;
  nickname: string | null;
  avatar_url: string | null;
  favorite_country_code: string | null;
  role: "superadmin" | "admin" | "player";
  status: "invited" | "active" | "disabled";
  must_change_password: boolean;
  first_access_completed_at: string | null;
  last_password_reset_at: string | null;
  temporary_password_set_at: string | null;
}

type AuthSnapshot = {
  user: User | null;
  loading: boolean;
};

const authListeners = new Set<() => void>();
let authSnapshot: AuthSnapshot = { user: null, loading: true };
let authListenerStarted = false;

export const authProfileQueryKey = (userId: string | null | undefined) =>
  ["auth-profile", userId ?? null] as const;

export async function fetchProfile(userId: string): Promise<Profile | null> {
  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", userId)
    .maybeSingle();
  if (error) return null;
  return (data as Profile | null) ?? null;
}

function emitAuthChange() {
  for (const listener of authListeners) listener();
}

function setAuthSnapshot(next: AuthSnapshot) {
  authSnapshot = next;
  emitAuthChange();
}

function subscribeAuth(listener: () => void) {
  authListeners.add(listener);
  return () => authListeners.delete(listener);
}

function getAuthSnapshot() {
  return authSnapshot;
}

function ensureAuthListener(queryClient: QueryClient) {
  if (authListenerStarted) return;
  authListenerStarted = true;

  supabase.auth.getUser().then(({ data }) => {
    setAuthSnapshot({ user: data.user, loading: false });
  });

  const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
    const previousUserId = authSnapshot.user?.id;
    const nextUser = session?.user ?? null;
    setAuthSnapshot({ user: nextUser, loading: false });

    if (previousUserId && previousUserId !== nextUser?.id) {
      queryClient.removeQueries({ queryKey: authProfileQueryKey(previousUserId) });
    }
    if (nextUser?.id) {
      void queryClient.invalidateQueries({ queryKey: authProfileQueryKey(nextUser.id) });
    }
  });

  window.addEventListener("beforeunload", () => sub.subscription.unsubscribe(), { once: true });
}

export function useAuth() {
  const queryClient = useQueryClient();

  useEffect(() => {
    ensureAuthListener(queryClient);
  }, [queryClient]);

  const { user, loading: authLoading } = useSyncExternalStore(
    subscribeAuth,
    getAuthSnapshot,
    getAuthSnapshot,
  );

  const profileQuery = useQuery({
    queryKey: authProfileQueryKey(user?.id),
    enabled: Boolean(user?.id),
    queryFn: () => fetchProfile(user!.id),
  });

  useEffect(() => {
    if (!user?.id) return;
    const refreshProfile = () => {
      void queryClient.invalidateQueries({ queryKey: authProfileQueryKey(user.id) });
    };
    window.addEventListener("paupite:profile-updated", refreshProfile);

    return () => {
      window.removeEventListener("paupite:profile-updated", refreshProfile);
    };
  }, [queryClient, user?.id]);

  const profile = user ? (profileQuery.data ?? null) : null;
  const loading = authLoading || Boolean(user?.id && profileQuery.isLoading);

  return {
    user,
    profile,
    loading,
    isAdmin: profile?.role === "admin" || profile?.role === "superadmin",
  };
}
