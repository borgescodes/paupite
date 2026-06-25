import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw redirect({ to: "/auth" });

    const profile = await getProfileForGuard(data.user.id);

    if (!profile || profile.status === "disabled") {
      await supabase.auth.signOut();
      throw redirect({ to: "/auth" });
    }

    if (profile.status === "invited" || profile.must_change_password) {
      throw redirect({ to: "/reset-password" });
    }

    return { user: data.user };
  },
  component: () => <Outlet />,
});

type GuardProfile = {
  status: "invited" | "active" | "disabled";
  must_change_password: boolean;
};

async function getProfileForGuard(userId: string): Promise<GuardProfile | null> {
  const { data, error } = await supabase
    .from("profiles")
    .select("status,must_change_password")
    .eq("id", userId)
    .maybeSingle();

  if (!error && data) {
    return {
      status: data.status as GuardProfile["status"],
      must_change_password: Boolean(data.must_change_password),
    };
  }

  // Compatibilidade temporária: se a migration de senha ainda não foi aplicada
  // no banco remoto, o login não deve quebrar por coluna inexistente.
  const { data: fallback, error: fallbackError } = await supabase
    .from("profiles")
    .select("status")
    .eq("id", userId)
    .maybeSingle();

  if (fallbackError || !fallback) return null;

  return {
    status: fallback.status as GuardProfile["status"],
    must_change_password: false,
  };
}
