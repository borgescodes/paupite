import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { BiErrorCircle, BiRefresh, BiWorld } from "react-icons/bi";
import { toast } from "sonner";

import { DaySelector } from "@/components/mobile/DaySelector";
import { MatchCard } from "@/components/mobile/MatchCard";
import { MobileShell } from "@/components/mobile/MobileShell";
import type { ScoreValue } from "@/components/mobile/types";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import {
  buildMatchDays,
  matchDateKey,
  toMatchCard,
  type BetRow,
  type MatchRow,
} from "@/lib/matches";

export const Route = createFileRoute("/_authenticated/home")({
  component: HomePage,
});

function HomePage() {
  const { user, profile, loading: authLoading } = useAuth();
  const [matches, setMatches] = useState<MatchRow[]>([]);
  const [bets, setBets] = useState<Record<string, BetRow>>({});
  const [drafts, setDrafts] = useState<Record<string, ScoreValue>>({});
  const [selectedDate, setSelectedDate] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [savedId, setSavedId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!user?.id) return;
    setError(null);

    const primaryMatchResult = await supabase
      .from("matches")
      .select(
        "id,kickoff_at,status,stage,group_name,venue,city,country,home_score,away_score,home_team:teams!matches_home_team_id_fkey(id,name,short_name,country_code,flag_url),away_team:teams!matches_away_team_id_fkey(id,name,short_name,country_code,flag_url)",
      )
      .order("kickoff_at", { ascending: true });
    let matchData: unknown[] | null = primaryMatchResult.data;
    let matchError = primaryMatchResult.error;

    // Transição segura caso o frontend chegue antes da migration aditiva.
    if (matchError?.message.includes("venue")) {
      const fallbackMatchResult = await supabase
        .from("matches")
        .select(
          "id,kickoff_at,status,stage,group_name,home_score,away_score,home_team:teams!matches_home_team_id_fkey(id,name,short_name,country_code,flag_url),away_team:teams!matches_away_team_id_fkey(id,name,short_name,country_code,flag_url)",
        )
        .order("kickoff_at", { ascending: true });
      matchData = fallbackMatchResult.data;
      matchError = fallbackMatchResult.error;
    }

    const betResult = await supabase
      .from("bets")
      .select("match_id,home_score,away_score,points")
      .eq("user_id", user.id);

    if (matchError || betResult.error) {
      setError(matchError?.message ?? betResult.error?.message ?? "Falha ao carregar partidas.");
      setLoading(false);
      return;
    }

    const nextMatches = (matchData ?? []) as MatchRow[];
    const nextBets: Record<string, BetRow> = {};
    for (const row of (betResult.data ?? []) as BetRow[]) nextBets[row.match_id] = row;
    setMatches(nextMatches);
    setBets(nextBets);
    setDrafts((current) => {
      const next = { ...current };
      for (const bet of Object.values(nextBets)) {
        if (!next[bet.match_id]) {
          next[bet.match_id] = { home: bet.home_score, away: bet.away_score };
        }
      }
      return next;
    });
    setLoading(false);
  }, [user?.id]);

  useEffect(() => {
    void load();
    if (!user?.id) return;
    const channel = supabase
      .channel(`home-matches-${user.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "matches" }, () => void load())
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "bets", filter: `user_id=eq.${user.id}` },
        () => void load(),
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [load, user?.id]);

  const days = useMemo(() => buildMatchDays(matches), [matches]);

  useEffect(() => {
    if (!days.length || days.some((day) => day.date === selectedDate)) return;
    const today = matchDateKey(new Date().toISOString());
    const nextDate = days.find((day) => day.date >= today)?.date ?? days.at(-1)?.date ?? "";
    setSelectedDate(nextDate);
  }, [days, selectedDate]);

  const visibleMatches = useMemo(
    () =>
      matches
        .filter((match) => matchDateKey(match.kickoff_at) === selectedDate)
        .map((match) => toMatchCard(match, bets[match.id], drafts[match.id])),
    [bets, drafts, matches, selectedDate],
  );

  async function saveBet(matchId: string) {
    if (!user?.id) return;
    const match = matches.find((item) => item.id === matchId);
    if (!match || new Date(match.kickoff_at) <= new Date() || match.status !== "scheduled") {
      setError("O prazo para este palpite já terminou.");
      return;
    }
    const value = drafts[matchId] ?? {
      home: bets[matchId]?.home_score ?? 0,
      away: bets[matchId]?.away_score ?? 0,
    };
    if (
      !Number.isInteger(value.home) ||
      !Number.isInteger(value.away) ||
      value.home < 0 ||
      value.away < 0 ||
      value.home > 99 ||
      value.away > 99
    ) {
      setError("Informe um placar válido entre 0 e 99.");
      return;
    }

    setSavingId(matchId);
    setSavedId(null);
    setError(null);
    const { error: saveError } = await supabase.from("bets").upsert(
      {
        user_id: user.id,
        match_id: matchId,
        home_score: value.home,
        away_score: value.away,
      },
      { onConflict: "user_id,match_id" },
    );
    setSavingId(null);
    if (saveError) {
      setError(saveError.message);
      toast.error("Não foi possível salvar o palpite.");
      return;
    }
    setBets((current) => ({
      ...current,
      [matchId]: { match_id: matchId, home_score: value.home, away_score: value.away, points: 0 },
    }));
    setSavedId(matchId);
    toast.success("Palpite salvo.");
    window.setTimeout(() => setSavedId((current) => (current === matchId ? null : current)), 2500);
  }

  if (authLoading || loading) {
    return (
      <div className="app-backdrop min-h-screen">
        <div className="mx-auto max-w-xl space-y-4 p-4">
          <Skeleton className="h-16 w-full rounded-2xl" />
          <Skeleton className="h-20 w-full rounded-2xl" />
          <Skeleton className="h-80 w-full rounded-3xl" />
          <Skeleton className="h-80 w-full rounded-3xl" />
        </div>
      </div>
    );
  }

  return (
    <MobileShell active="partidas">
      {days.length > 0 && (
        <DaySelector days={days} selectedDate={selectedDate} onSelect={setSelectedDate} />
      )}

      <div className="relative overflow-hidden">
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          <div className="animate-blob-drift absolute -top-12 -left-10 size-56 rounded-full bg-brand/20 blur-3xl" />
          <div className="animate-blob-drift absolute top-1/3 -right-12 size-64 rounded-full bg-success/15 blur-3xl [animation-delay:-9s]" />
        </div>

        <main className="screen-enter relative z-10 mx-auto max-w-xl space-y-4 px-3 py-4">
          <div className="px-1">
            <p className="eyebrow text-brand">Copa do Mundo 2026</p>
            <h1 className="mt-1 text-2xl font-extrabold tracking-tight">Partidas e palpites</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Escolha o placar antes do início de cada jogo.
            </p>
          </div>
          {error && (
            <div className="glass-card flex items-start gap-2 rounded-2xl border-destructive/30 p-3 text-sm text-destructive">
              <BiErrorCircle className="mt-0.5 size-5 shrink-0" />
              <span className="flex-1">{error}</span>
              <Button
                size="icon"
                variant="ghost"
                className="size-8 rounded-xl"
                aria-label="Tentar carregar novamente"
                onClick={() => void load()}
              >
                <BiRefresh className="size-5" />
              </Button>
            </div>
          )}

          {!error && matches.length === 0 && (
            <div className="glass-card rounded-3xl border-dashed p-9 text-center">
              <div className="mx-auto grid size-14 place-items-center rounded-2xl bg-brand/12 text-brand">
                <BiWorld className="size-7" />
              </div>
              <p className="font-bold">Nenhuma partida cadastrada</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Um superadmin pode importar o JSON oficial na área administrativa.
              </p>
            </div>
          )}

          {matches.length > 0 && visibleMatches.length === 0 && (
            <div className="glass-card rounded-3xl p-8 text-center text-sm text-muted-foreground">
              Nenhuma partida nesta data.
            </div>
          )}

          {visibleMatches.map((match) => (
            <MatchCard
              key={match.id}
              data={match}
              saving={savingId === match.id}
              saveMessage={savedId === match.id ? "Palpite salvo." : null}
              onGuessChange={(value) => setDrafts((current) => ({ ...current, [match.id]: value }))}
              onSubmitGuess={() => void saveBet(match.id)}
            />
          ))}
        </main>
      </div>
    </MobileShell>
  );
}
