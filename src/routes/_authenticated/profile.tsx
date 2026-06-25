import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { LogOut, Save, ShieldCheck, Trophy } from "lucide-react";
import { useEffect, useState } from "react";

import { MobileShell } from "@/components/mobile/MobileShell";
import { AvatarUploader } from "@/components/profile/AvatarUploader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/hooks/use-auth";
import { supabase as _supabaseTyped } from "@/integrations/supabase/client";
const supabase = _supabaseTyped as any;

interface Stats {
  total_points: number | null;
  rank_position: number | null;
  exact_scores_count: number | null;
  bets_count: number | null;
}

export const Route = createFileRoute("/_authenticated/profile")({
  component: ProfilePage,
});

function ProfilePage() {
  const { user, profile, loading } = useAuth();
  const navigate = useNavigate();
  const [displayName, setDisplayName] = useState("");
  const [nickname, setNickname] = useState("");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [freeStats, setFreeStats] = useState<Stats | null>(null);
  const [poolStats, setPoolStats] = useState<Stats | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!profile || !user) return;
    setDisplayName(profile.display_name ?? "");
    setNickname(profile.nickname ?? "");
    setAvatarUrl(profile.avatar_url);
    Promise.all([
      supabase.from("ranking_free").select("*").eq("user_id", user.id).maybeSingle(),
      supabase.from("ranking_pool").select("*").eq("user_id", user.id).maybeSingle(),
    ]).then(([freeResult, poolResult]: [any, any]) => {
      setFreeStats(freeResult.data as Stats | null);
      setPoolStats(poolResult.data as Stats | null);
      setError(freeResult.error?.message ?? poolResult.error?.message ?? null);
    });
  }, [profile, user]);

  if (loading || !profile || !user) {
    return <p className="p-8 text-center text-sm text-muted-foreground">Carregando...</p>;
  }

  const profileName = nickname || displayName || profile.email;

  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (!profile) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    const { error: saveError } = await supabase
      .from("profiles")
      .update({ display_name: displayName.trim() || null, nickname: nickname.trim() || null })
      .eq("id", profile.id);
    setBusy(false);
    if (saveError) setError(saveError.message);
    else setMessage("Perfil salvo.");
  }

  async function signOut() {
    await supabase.auth.signOut();
    navigate({ to: "/auth" });
  }

  return (
    <MobileShell active="perfil">
      <main className="mx-auto max-w-xl space-y-4 px-3 py-5">
        <AvatarUploader
          userId={profile.id}
          name={profileName}
          avatarUrl={avatarUrl}
          onUploaded={(url) => {
            setAvatarUrl(url);
            setMessage("Avatar atualizado.");
          }}
        />
        <div className="text-center">
          <h1 className="text-2xl font-extrabold">{profileName}</h1>
          <p className="text-sm text-muted-foreground">{profile.email}</p>
          <Badge variant="secondary" className="mt-2">
            {profile.role}
          </Badge>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <StatsCard title="Resenha" stats={freeStats} />
          <StatsCard title="Bolão" stats={poolStats} />
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Editar perfil</CardTitle>
          </CardHeader>
          <CardContent>
            <form className="space-y-4" onSubmit={save}>
              <Field label="Nome">
                <Input
                  value={displayName}
                  onChange={(event) => setDisplayName(event.target.value)}
                />
              </Field>
              <Field label="Apelido no ranking">
                <Input
                  maxLength={32}
                  value={nickname}
                  onChange={(event) => setNickname(event.target.value)}
                />
              </Field>
              <Button className="w-full" disabled={busy}>
                <Save className="size-4" />
                {busy ? "Salvando..." : "Salvar perfil"}
              </Button>
            </form>
            {error && <p className="mt-3 text-sm text-destructive">{error}</p>}
            {message && <p className="mt-3 text-sm text-success">{message}</p>}
          </CardContent>
        </Card>

        {(profile.role === "admin" || profile.role === "superadmin") && (
          <Card className="border-brand/30">
            <CardContent className="space-y-3 p-4">
              <p className="flex items-center gap-2 font-bold">
                <ShieldCheck className="size-4 text-brand" />
                {profile.role === "superadmin" ? "Zona superadmin" : "Zona admin"}
              </p>
              <Button asChild className="w-full">
                <Link to="/admin">Abrir administração</Link>
              </Button>
            </CardContent>
          </Card>
        )}

        <Button variant="outline" className="w-full" onClick={() => void signOut()}>
          <LogOut className="size-4" />
          Sair
        </Button>
      </main>
    </MobileShell>
  );
}

function StatsCard({ title, stats }: { title: string; stats: Stats | null }) {
  return (
    <Card>
      <CardContent className="p-3">
        <Trophy className="size-4 text-warning" />
        <p className="mt-2 text-xl font-extrabold">{stats?.total_points ?? 0} pts</p>
        <p className="text-[11px] text-muted-foreground">
          {title} · {stats?.rank_position ? `${stats.rank_position}º` : "sem posição"}
        </p>
        <p className="mt-1 text-[10px] text-muted-foreground">
          {stats?.exact_scores_count ?? 0} exatos · {stats?.bets_count ?? 0} palpites
        </p>
      </CardContent>
    </Card>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {children}
    </div>
  );
}
