import { useEffect, useState } from "react";
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

export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    const load = async (u: User | null) => {
      setUser(u);
      if (!u) {
        setProfile(null);
        setLoading(false);
        return;
      }
      const { data } = await supabase.from("profiles").select("*").eq("id", u.id).maybeSingle();
      if (mounted) {
        setProfile((data as Profile | null) ?? null);
        setLoading(false);
      }
    };

    supabase.auth.getUser().then(({ data }) => load(data.user));
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      load(session?.user ?? null);
    });

    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  return { user, profile, loading, isAdmin: profile?.role === "admin" || profile?.role === "superadmin" };
}
