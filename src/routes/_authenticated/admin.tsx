import { createFileRoute, redirect } from "@tanstack/react-router";
import { useState } from "react";
import { BiFootball, BiGroup, BiImport, BiShieldQuarter, BiUser } from "react-icons/bi";

import { ImportAdmin } from "@/components/admin/ImportAdmin";
import { MatchesAdmin } from "@/components/admin/MatchesAdmin";
import { PoolAdmin } from "@/components/admin/PoolAdmin";
import { UsersAdmin } from "@/components/admin/UsersAdmin";
import { MobileShell } from "@/components/mobile/MobileShell";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/admin")({
  beforeLoad: async () => {
    const { data } = await supabase.auth.getUser();
    if (!data.user) throw redirect({ to: "/auth" });
    const { data: profile } = await supabase
      .from("profiles")
      .select("role,status")
      .eq("id", data.user.id)
      .maybeSingle();
    if (
      !profile ||
      profile.status !== "active" ||
      !["admin", "superadmin"].includes(profile.role)
    ) {
      throw redirect({ to: "/home" });
    }
  },
  component: AdminPage,
});

type Section = "matches" | "users" | "pool" | "import";

function AdminPage() {
  const { profile, loading } = useAuth();
  const [section, setSection] = useState<Section>("matches");

  if (loading || !profile) {
    return (
      <div className="app-backdrop min-h-screen p-4">
        <Skeleton className="mx-auto h-96 max-w-5xl rounded-3xl" />
      </div>
    );
  }

  const superadmin = profile.role === "superadmin";
  const sections = [
    { key: "matches" as const, label: "Jogos", icon: BiFootball, show: true },
    { key: "users" as const, label: "Usuários", icon: BiUser, show: true },
    { key: "pool" as const, label: "Bolão", icon: BiGroup, show: superadmin },
    { key: "import" as const, label: "Importar", icon: BiImport, show: superadmin },
  ].filter((item) => item.show);

  return (
    <MobileShell active="admin">
      <main className="screen-enter mx-auto max-w-5xl space-y-5 px-3 py-5 sm:px-4">
        <header className="glass-card flex items-center gap-3 rounded-3xl p-4 sm:p-5">
          <div className="grid size-12 shrink-0 place-items-center rounded-2xl bg-brand text-brand-foreground shadow-lg shadow-brand/20">
            <BiShieldQuarter className="size-6" />
          </div>
          <div className="min-w-0">
            <p className="eyebrow text-brand">
              {superadmin ? "Zona superadmin" : "Zona operacional"}
            </p>
            <h1 className="truncate text-2xl font-extrabold tracking-tight">Administração</h1>
            <p className="text-xs text-muted-foreground">
              Controles exibidos conforme seu nível de acesso.
            </p>
          </div>
        </header>

        <div className="no-scrollbar flex gap-2 overflow-x-auto pb-1">
          {sections.map((item) => {
            const Icon = item.icon;
            return (
              <Button
                key={item.key}
                variant={section === item.key ? "default" : "outline"}
                className={cn(
                  "shrink-0 rounded-2xl",
                  section === item.key && "bg-brand text-brand-foreground hover:bg-brand/90",
                )}
                onClick={() => setSection(item.key)}
              >
                <Icon className="size-5" />
                {item.label}
              </Button>
            );
          })}
        </div>

        <section>
          {section === "matches" && <MatchesAdmin />}
          {section === "users" && <UsersAdmin currentRole={profile.role} />}
          {section === "pool" && superadmin && <PoolAdmin />}
          {section === "import" && superadmin && <ImportAdmin />}
        </section>
      </main>
    </MobileShell>
  );
}
