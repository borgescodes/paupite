import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { authProfileQueryKey, fetchProfile } from "@/hooks/use-auth";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async ({ context }) => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw redirect({ to: "/auth" });

    const profile = await context.queryClient.fetchQuery({
      queryKey: authProfileQueryKey(data.user.id),
      queryFn: () => fetchProfile(data.user.id),
    });

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
