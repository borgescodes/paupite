import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { LogOut, Save, ShieldCheck, Star, Trophy } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { MobileShell } from "@/components/mobile/MobileShell";
import { AvatarUploader } from "@/components/profile/AvatarUploader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";

interface Team {
  id: string;
  name: string;
  short_name: string | null;
  country_code: string | null;
}

interface ClubChoice {
  league: string;
  club: string;
}

interface Stats {
  total_points: number | null;
  rank_position: number | null;
  exact_scores_count: number | null;
  bets_count: number | null;
}

const leagueOptions: Record<string, string[]> = {
  Brasileirão: ["Flamengo", "Palmeiras", "Corinthians", "São Paulo", "Vasco", "Outro"],
  "Premier League": [
    "Arsenal",
    "Chelsea",
    "Liverpool",
    "Manchester City",
    "Manchester United",
    "Outro",
  ],
  "La Liga": ["Barcelona", "Real Madrid", "Atlético de Madrid", "Outro"],
  "Serie A": ["Inter", "Juventus", "Milan", "Napoli", "Outro"],
  Bundesliga: ["Bayern", "Borussia Dortmund", "Leverkusen", "Outro"],
};

export const Route = createFileRoute("/_authenticated/profile")({
  component: ProfilePage,
});

function ProfilePage() {
  const { user, profile, loading } = useAuth();
  const navigate = useNavigate();
  const [displayName, setDisplayName] = useState("");
  const [nickname, setNickname] = useState("");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [teams, setTeams] = useState<Team[]>([]);
  const [favoriteTeams, setFavoriteTeams] = useState<string[]>([]);
  const [clubs, setClubs] = useState<ClubChoice[]>([]);
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
      supabase.from("teams").select("id,name,short_name,country_code").order("name"),
      supabase.from("profile_badges").select("*").eq("user_id", user.id).maybeSingle(),
      supabase.from("ranking_free").select("*").eq("user_id", user.id).maybeSingle(),
      supabase.from("ranking_pool").select("*").eq("user_id", user.id).maybeSingle(),
    ]).then(([teamResult, badgeResult, freeResult, poolResult]) => {
      setTeams((teamResult.data ?? []) as Team[]);
      setFavoriteTeams((badgeResult.data?.favorite_team_codes ?? []) as string[]);
      setClubs(
        Array.isArray(badgeResult.data?.favorite_clubs)
          ? (badgeResult.data.favorite_clubs as unknown as ClubChoice[])
          : [],
      );
      setFreeStats(freeResult.data as Stats | null);
      setPoolStats(poolResult.data as Stats | null);
      setError(
        teamResult.error?.message ??
          badgeResult.error?.message ??
          freeResult.error?.message ??
          poolResult.error?.message ??
          null,
      );
    });
  }, [profile, user]);

  const selectedTeamLabels = useMemo(
    () =>
      favoriteTeams.map(
        (code) =>
          teams.find((team) => (team.country_code || team.short_name || "").toLowerCase() === code)
            ?.name ?? code.toUpperCase(),
      ),
    [favoriteTeams, teams],
  );

  if (loading || !profile || !user) {
    return <p className="p-8 text-center text-sm text-muted-foreground">Carregando...</p>;
  }

  const profileName = nickname || displayName || profile.email;

  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (!profile) return;
    const profileId = profile.id;
    setBusy(true);
    setError(null);
    setMessage(null);
    const profileResult = await supabase
      .from("profiles")
      .update({ display_name: displayName.trim() || null, nickname: nickname.trim() || null })
      .eq("id", profileId);
    const badgeResult = await supabase.from("profile_badges").upsert(
      {
        user_id: profileId,
        favorite_team_codes: favoriteTeams,
        favorite_clubs: clubs as unknown as Json,
      },
      { onConflict: "user_id" },
    );
    setBusy(false);
    const saveError = profileResult.error ?? badgeResult.error;
    if (saveError) {
      setError(saveError.message);
    } else {
      setMessage("Perfil salvo.");
    }
  }

  function toggleTeam(team: Team) {
    const code = (team.country_code || team.short_name || team.id).toLowerCase();
    setFavoriteTeams((current) => {
      if (current.includes(code)) return current.filter((item) => item !== code);
      if (current.length >= 2) return current;
      return [...current, code];
    });
  }

  function setLeague(index: number, league: string) {
    setClubs((current) => {
      const next = [...current];
      next[index] = { league, club: leagueOptions[league]?.[0] ?? "" };
      return next.filter((item) => item.league);
    });
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

              <div className="space-y-2">
                <Label>Seleções favoritas (até 2)</Label>
                <div className="max-h-48 space-y-1 overflow-y-auto rounded-lg border p-2">
                  {teams.map((team) => {
                    const code = (team.country_code || team.short_name || team.id).toLowerCase();
                    const checked = favoriteTeams.includes(code);
                    return (
                      <label
                        key={team.id}
                        className="flex items-center gap-2 rounded p-1.5 text-sm"
                      >
                        <Checkbox
                          checked={checked}
                          disabled={!checked && favoriteTeams.length >= 2}
                          onCheckedChange={() => toggleTeam(team)}
                        />
                        {team.name}
                      </label>
                    );
                  })}
                </div>
                <div className="flex flex-wrap gap-1">
                  {selectedTeamLabels.map((label) => (
                    <Badge key={label} className="bg-brand/15 text-brand">
                      <Star className="size-3" />
                      {label}
                    </Badge>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <Label>Ligas e clubes favoritos (até 2)</Label>
                {[0, 1].map((index) => {
                  const choice = clubs[index];
                  return (
                    <div key={index} className="grid grid-cols-2 gap-2">
                      <select
                        className="h-9 rounded-md border bg-background px-2 text-sm"
                        value={choice?.league ?? ""}
                        onChange={(event) => setLeague(index, event.target.value)}
                      >
                        <option value="">Escolha a liga</option>
                        {Object.keys(leagueOptions).map((league) => (
                          <option
                            key={league}
                            value={league}
                            disabled={clubs.some(
                              (item, itemIndex) => itemIndex !== index && item.league === league,
                            )}
                          >
                            {league}
                          </option>
                        ))}
                      </select>
                      <select
                        className="h-9 rounded-md border bg-background px-2 text-sm"
                        value={choice?.club ?? ""}
                        disabled={!choice?.league}
                        onChange={(event) =>
                          setClubs((current) => {
                            const next = [...current];
                            next[index] = { league: choice.league, club: event.target.value };
                            return next;
                          })
                        }
                      >
                        <option value="">Escolha o clube</option>
                        {(leagueOptions[choice?.league] ?? []).map((club) => (
                          <option key={club} value={club}>
                            {club}
                          </option>
                        ))}
                      </select>
                    </div>
                  );
                })}
                <p className="text-xs text-muted-foreground">
                  Os clubes usam badges textuais locais enquanto a licença de logos externos não for
                  validada.
                </p>
              </div>

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
