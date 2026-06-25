import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { ArrowLeft, FileJson, Gamepad2, ShieldCheck, Trophy, Users } from "lucide-react";
import { useState } from "react";


import { ImportAdmin } from "@/components/admin/ImportAdmin";
import { MatchesAdmin } from "@/components/admin/MatchesAdmin";
import { PoolAdmin } from "@/components/admin/PoolAdmin";
import { UsersAdmin } from "@/components/admin/UsersAdmin";
import { Button } from "@/components/ui/button";
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
    return <p className="p-8 text-center text-sm text-muted-foreground">Carregando...</p>;
  }

  const superadmin = profile.role === "superadmin";
  const sections = [
    { key: "matches" as const, label: "Jogos", icon: Gamepad2, show: true },
    { key: "users" as const, label: "Usuários", icon: Users, show: true },
    { key: "pool" as const, label: "Bolão", icon: Trophy, show: superadmin },
    { key: "import" as const, label: "Importar", icon: FileJson, show: superadmin },
  ].filter((item) => item.show);


  return (
    <div className="min-h-screen bg-muted/30">
      <header className="border-b bg-background">
        <div className="mx-auto flex max-w-5xl items-center gap-3 px-4 py-4">
          <Button asChild size="icon" variant="ghost">
            <Link to="/profile">
              <ArrowLeft className="size-4" />
            </Link>
          </Button>
          <div className="min-w-0 flex-1">
            <h1 className="flex items-center gap-2 truncate text-xl font-extrabold">
              <ShieldCheck className="size-5 text-brand" />
              Administração
            </h1>
            <p className="text-xs text-muted-foreground">
              {superadmin ? "Zona superadmin" : "Zona admin operacional"}
            </p>
          </div>
        </div>
      </header>

      <div className="no-scrollbar mx-auto flex max-w-5xl gap-2 overflow-x-auto px-4 py-3">
        {sections.map((item) => {
          const Icon = item.icon;
          return (
            <Button
              key={item.key}
              size="sm"
              variant={section === item.key ? "default" : "outline"}
              className={cn(
                section === item.key && "bg-brand text-brand-foreground hover:bg-brand/90",
              )}
              onClick={() => setSection(item.key)}
            >
              <Icon className="size-4" />
              {item.label}
            </Button>
          );
        })}
      </div>

      <main className="mx-auto max-w-5xl px-4 pb-12">
        {section === "matches" && <MatchesAdmin />}
        {section === "users" && <UsersAdmin currentRole={profile.role} />}
        {section === "pool" && superadmin && <PoolAdmin />}
        {section === "import" && superadmin && <ImportAdmin />}
      </main>

    </div>
  );
}
