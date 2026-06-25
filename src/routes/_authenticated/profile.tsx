import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  BiBarChartAlt2,
  BiBullseye,
  BiCheckCircle,
  BiLogOut,
  BiPalette,
  BiSave,
  BiShieldQuarter,
  BiSolidTrophy,
} from "react-icons/bi";
import { toast } from "sonner";

import { MobileShell } from "@/components/mobile/MobileShell";
import { AvatarUploader } from "@/components/profile/AvatarUploader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/hooks/use-auth";
import { useThemeMode, type AccentTheme } from "@/hooks/use-theme";
import { supabase } from "@/integrations/supabase/client";
import type { RankingEntry } from "@/lib/ranking";

type Stats = Pick<
  RankingEntry,
  "total_points" | "rank_position" | "exact_scores_count" | "outcome_hits_count" | "bets_count"
>;

export const Route = createFileRoute("/_authenticated/profile")({
  component: ProfilePage,
});

function ProfilePage() {
  const { user, profile, loading } = useAuth();
  const navigate = useNavigate();
  const { accentTheme, setAccentTheme } = useThemeMode(user?.id);
  const [displayName, setDisplayName] = useState("");
  const [nickname, setNickname] = useState("");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [freeStats, setFreeStats] = useState<Stats | null>(null);
  const [poolStats, setPoolStats] = useState<Stats | null>(null);
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
    ]).then(([freeResult, poolResult]) => {
      setFreeStats(freeResult.data);
      setPoolStats(poolResult.data);
      setError(freeResult.error?.message ?? poolResult.error?.message ?? null);
    });
  }, [profile, user]);

  if (loading || !profile || !user) {
    return (
      <div className="app-backdrop min-h-screen p-4">
        <div className="mx-auto max-w-xl space-y-4">
          <Skeleton className="mx-auto size-32 rounded-full" />
          <Skeleton className="mx-auto h-8 w-44 rounded-xl" />
          <Skeleton className="h-36 rounded-3xl" />
          <Skeleton className="h-72 rounded-3xl" />
        </div>
      </div>
    );
  }

  const profileName = nickname || displayName || profile.email;
  const profileId = profile.id;
  const isStaff = profile.role === "admin" || profile.role === "superadmin";

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const { error: saveError } = await supabase
      .from("profiles")
      .update({ display_name: displayName.trim() || null, nickname: nickname.trim() || null })
      .eq("id", profileId);
    setBusy(false);
    if (saveError) {
      setError(saveError.message);
      toast.error("Não foi possível salvar o perfil.");
      return;
    }
    window.dispatchEvent(new Event("paupite:profile-updated"));
    toast.success("Perfil salvo.");
  }

  async function signOut() {
    await supabase.auth.signOut();
    navigate({ to: "/auth" });
  }

  return (
    <MobileShell active="perfil">
      <main className="screen-enter mx-auto max-w-xl space-y-5 px-3 py-5">
        <section className="glass-card rounded-3xl p-5 text-center">
          <AvatarUploader
            userId={profileId}
            name={profileName}
            avatarUrl={avatarUrl}
            onUploaded={(url) => {
              setAvatarUrl(url);
              window.dispatchEvent(new Event("paupite:profile-updated"));
            }}
          />
          <h1 className="mt-3 text-2xl font-extrabold tracking-tight">{profileName}</h1>
          <p className="text-sm text-muted-foreground">{profile.email}</p>
          <Badge className="mt-2 rounded-full" variant="secondary">
            {profile.role === "player"
              ? "Participante"
              : profile.role === "admin"
                ? "Administrador"
                : "Superadministrador"}
          </Badge>
        </section>

        <section className="grid grid-cols-2 gap-3">
          <StatsCard title="Resenha" stats={freeStats} accent="brand" />
          <StatsCard title="Bolão" stats={poolStats} accent="warning" />
        </section>

        <Card className="glass-card">
          <CardHeader className="pb-3">
            <p className="eyebrow text-brand">Dados públicos</p>
            <CardTitle className="text-lg">Editar perfil</CardTitle>
          </CardHeader>
          <CardContent>
            <form className="space-y-4" onSubmit={save}>
              <Field id="display-name" label="Nome">
                <Input
                  id="display-name"
                  value={displayName}
                  autoComplete="name"
                  onChange={(event) => setDisplayName(event.target.value)}
                />
              </Field>
              <Field id="nickname" label="Apelido no ranking">
                <Input
                  id="nickname"
                  maxLength={32}
                  value={nickname}
                  placeholder="Como você quer aparecer"
                  onChange={(event) => setNickname(event.target.value)}
                />
              </Field>
              <Button className="h-11 w-full rounded-2xl" disabled={busy}>
                <BiSave className="size-5" />
                {busy ? "Salvando..." : "Salvar perfil"}
              </Button>
            </form>
            {error && <p className="mt-3 text-sm text-destructive">{error}</p>}
          </CardContent>
        </Card>

        <Card className="glass-card">
          <CardHeader className="pb-3">
            <p className="eyebrow flex items-center gap-1.5 text-brand">
              <BiPalette className="size-4" />
              Aparência
            </p>
            <CardTitle className="text-lg">Tema do Pau Pite</CardTitle>
          </CardHeader>
          <CardContent>
            <div
              className="grid grid-cols-2 gap-2 sm:grid-cols-3"
              role="group"
              aria-label="Tema visual"
            >
              {accentOptions.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  aria-pressed={accentTheme === option.value}
                  className={`tap-feedback flex min-h-14 items-center gap-3 rounded-2xl border px-3 text-left text-sm font-bold transition-colors ${
                    accentTheme === option.value
                      ? "border-brand bg-brand/10 ring-2 ring-brand/20"
                      : "border-border bg-background/55 hover:bg-accent"
                  }`}
                  onClick={() => setAccentTheme(option.value)}
                >
                  <span
                    className={`size-7 shrink-0 rounded-full ${option.swatch} ring-2 ring-background shadow-sm`}
                  />
                  {option.label}
                </button>
              ))}
            </div>
            <p className="mt-3 text-xs text-muted-foreground">
              Paleta aplicada imediatamente e salva no perfil.
            </p>
          </CardContent>
        </Card>

        {isStaff && (
          <Card className="glass-card overflow-hidden border-brand/30">
            <div className="h-1 bg-brand" />
            <CardContent className="space-y-3 p-4">
              <div className="flex items-start gap-3">
                <div className="grid size-10 shrink-0 place-items-center rounded-2xl bg-brand/12 text-brand">
                  <BiShieldQuarter className="size-5" />
                </div>
                <div>
                  <p className="font-extrabold">
                    {profile.role === "superadmin" ? "Zona superadmin" : "Zona admin"}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Gerencie jogos e os recursos permitidos para seu nível de acesso.
                  </p>
                </div>
              </div>
              <Button asChild className="w-full">
                <Link to="/admin">Abrir administração</Link>
              </Button>
            </CardContent>
          </Card>
        )}

        <Button
          variant="outline"
          className="h-11 w-full rounded-2xl"
          onClick={() => void signOut()}
        >
          <BiLogOut className="size-5" />
          Sair
        </Button>
      </main>
    </MobileShell>
  );
}

const accentOptions: Array<{ value: AccentTheme; label: string; swatch: string }> = [
  { value: "blue", label: "Azul", swatch: "bg-sky-500" },
  { value: "pink", label: "Rosa", swatch: "bg-pink-500" },
  { value: "purple", label: "Roxo", swatch: "bg-violet-500" },
  { value: "green", label: "Verde", swatch: "bg-emerald-500" },
  { value: "red", label: "Vermelho", swatch: "bg-red-500" },
  {
    value: "brazil",
    label: "Brasil",
    swatch: "bg-[linear-gradient(135deg,#16a34a_0_34%,#facc15_34%_66%,#2563eb_66%)]",
  },
];

function StatsCard({
  title,
  stats,
  accent,
}: {
  title: string;
  stats: Stats | null;
  accent: "brand" | "warning";
}) {
  return (
    <Card className="glass-card interactive-card">
      <CardContent className="p-4">
        <div
          className={
            accent === "brand"
              ? "grid size-9 place-items-center rounded-xl bg-brand/12 text-brand"
              : "grid size-9 place-items-center rounded-xl bg-warning/15 text-warning"
          }
        >
          <BiSolidTrophy className="size-5" />
        </div>
        <p className="mt-3 text-2xl font-extrabold">{stats?.total_points ?? 0} pts</p>
        <p className="text-xs font-bold text-muted-foreground">
          {title} · {stats?.rank_position ? `${stats.rank_position}º` : "sem posição"}
        </p>
        <div className="mt-2 flex flex-wrap gap-x-2 gap-y-1 text-[10px] text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            <BiBullseye className="size-3" />
            {stats?.exact_scores_count ?? 0} exatos
          </span>
          <span className="inline-flex items-center gap-1">
            <BiCheckCircle className="size-3" />
            {stats?.outcome_hits_count ?? 0} acertos
          </span>
          <span className="inline-flex items-center gap-1">
            <BiBarChartAlt2 className="size-3" />
            {stats?.bets_count ?? 0} palpites
          </span>
        </div>
      </CardContent>
    </Card>
  );
}

function Field({ id, label, children }: { id: string; label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      {children}
    </div>
  );
}
