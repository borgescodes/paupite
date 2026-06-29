import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { BiErrorCircle, BiRefresh, BiWorld } from "react-icons/bi";
import { toast } from "sonner";

import { DaySelector } from "@/components/mobile/DaySelector";
import { MatchCard } from "@/components/mobile/MatchCard";
import { MobileShell } from "@/components/mobile/MobileShell";
import type { PredictionValue } from "@/components/mobile/types";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import {
  deriveKnockoutPredictionFields,
  isKnockoutStage,
  validateKnockoutPrediction,
  type KnockoutScoringRules,
} from "@/lib/knockout";
import {
  buildMatchDays,
  matchDateKey,
  toMatchCard,
  type BetRow,
  type BetTrend,
  type MatchRow,
} from "@/lib/matches";

export const Route = createFileRoute("/_authenticated/home")({
  component: HomePage,
});

type HomeMatchesData = {
  matches: MatchRow[];
  bets: Record<string, BetRow>;
  trends: Record<string, BetTrend>;
  scoringRules: KnockoutScoringRules | null;
};

const emptyMatches: MatchRow[] = [];
const emptyBets: Record<string, BetRow> = {};
const emptyTrends: Record<string, BetTrend> = {};
const homeMatchesQueryKey = (userId: string | null | undefined) =>
  ["home-matches", userId] as const;

function HomePage() {
  const { user, loading: authLoading } = useAuth();
  const queryClient = useQueryClient();
  const [drafts, setDrafts] = useState<Record<string, PredictionValue>>({});
  const [selectedDate, setSelectedDate] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [savedId, setSavedId] = useState<string | null>(null);
  const [editingIds, setEditingIds] = useState<Record<string, boolean>>({});

  const homeQuery = useQuery({
    queryKey: homeMatchesQueryKey(user?.id),
    enabled: Boolean(user?.id),
    queryFn: () => fetchHomeMatches(user!.id),
  });

  const matches = homeQuery.data?.matches ?? emptyMatches;
  const bets = homeQuery.data?.bets ?? emptyBets;
  const trends = homeQuery.data?.trends ?? emptyTrends;
  const scoringRules = homeQuery.data?.scoringRules ?? null;
  const error = localError ?? (homeQuery.error instanceof Error ? homeQuery.error.message : null);
  const loading = authLoading || (homeQuery.isLoading && !homeQuery.data);

  useEffect(() => {
    if (!homeQuery.data?.bets) return;
    setDrafts((current) => {
      const next = { ...current };
      for (const bet of Object.values(homeQuery.data.bets)) {
        if (!next[bet.match_id]) {
          next[bet.match_id] = {
            home: bet.regulation_home_score ?? bet.home_score,
            away: bet.regulation_away_score ?? bet.away_score,
            qualifiedTeamId: bet.predicted_qualified_team_id ?? null,
            qualificationMethod: bet.predicted_qualification_method ?? null,
          };
        }
      }
      return next;
    });
  }, [homeQuery.data?.bets]);

  useEffect(() => {
    if (!user?.id) return;
    const channel = supabase
      .channel(`home-matches-${user.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "matches" }, () => {
        void queryClient.invalidateQueries({ queryKey: homeMatchesQueryKey(user.id) });
      })
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "bets", filter: `user_id=eq.${user.id}` },
        () => {
          void queryClient.invalidateQueries({ queryKey: homeMatchesQueryKey(user.id) });
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [queryClient, user?.id]);

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
        .map((match) =>
          toMatchCard(match, bets[match.id], drafts[match.id], trends[match.id], scoringRules),
        ),
    [bets, drafts, matches, scoringRules, selectedDate, trends],
  );

  async function saveBet(matchId: string) {
    if (!user?.id) return;
    const match = matches.find((item) => item.id === matchId);
    if (!match || new Date(match.kickoff_at) <= new Date() || match.status !== "scheduled") {
      setLocalError("O prazo para este palpite já terminou.");
      return;
    }
    const value = drafts[matchId] ?? {
      home: bets[matchId]?.home_score ?? 0,
      away: bets[matchId]?.away_score ?? 0,
      qualifiedTeamId: bets[matchId]?.predicted_qualified_team_id ?? null,
      qualificationMethod: bets[matchId]?.predicted_qualification_method ?? null,
    };
    if (
      !Number.isInteger(value.home) ||
      !Number.isInteger(value.away) ||
      value.home < 0 ||
      value.away < 0 ||
      value.home > 99 ||
      value.away > 99
    ) {
      setLocalError("Informe um placar válido entre 0 e 99.");
      return;
    }

    const knockout = isKnockoutStage(match.stage);
    let predictedQualifiedTeamId = value.qualifiedTeamId ?? null;
    let predictedQualificationMethod = value.qualificationMethod ?? null;

    if (knockout) {
      const validationError = validateKnockoutPrediction({
        homeScore: value.home,
        awayScore: value.away,
        homeTeamId: match.home_team?.id,
        awayTeamId: match.away_team?.id,
        qualifiedTeamId: predictedQualifiedTeamId,
        qualificationMethod: predictedQualificationMethod,
      });
      if (validationError) {
        setLocalError(validationError);
        return;
      }
      const derived = deriveKnockoutPredictionFields({
        homeScore: value.home,
        awayScore: value.away,
        homeTeamId: match.home_team?.id,
        awayTeamId: match.away_team?.id,
        qualifiedTeamId: predictedQualifiedTeamId,
        qualificationMethod: predictedQualificationMethod,
      });
      predictedQualifiedTeamId = derived.qualifiedTeamId;
      predictedQualificationMethod = derived.qualificationMethod;
    }

    setSavingId(matchId);
    setSavedId(null);
    setLocalError(null);
    const { error: saveError } = await supabase.from("bets").upsert(
      {
        user_id: user.id,
        match_id: matchId,
        home_score: value.home,
        away_score: value.away,
        regulation_home_score: knockout ? value.home : null,
        regulation_away_score: knockout ? value.away : null,
        predicted_qualified_team_id: knockout ? predictedQualifiedTeamId : null,
        predicted_qualification_method: knockout ? predictedQualificationMethod : null,
      },
      { onConflict: "user_id,match_id" },
    );
    setSavingId(null);
    if (saveError) {
      setLocalError(saveError.message);
      toast.error("Não foi possível salvar o palpite.");
      return;
    }
    queryClient.setQueryData<HomeMatchesData>(homeMatchesQueryKey(user.id), (current) =>
      current
        ? {
            ...current,
            bets: {
              ...current.bets,
              [matchId]: {
                match_id: matchId,
                home_score: value.home,
                away_score: value.away,
                regulation_home_score: knockout ? value.home : null,
                regulation_away_score: knockout ? value.away : null,
                predicted_qualified_team_id: knockout ? predictedQualifiedTeamId : null,
                predicted_qualification_method: knockout ? predictedQualificationMethod : null,
                points: current.bets[matchId]?.points ?? 0,
              },
            },
          }
        : current,
    );
    setEditingIds((current) => ({ ...current, [matchId]: false }));
    void queryClient.invalidateQueries({ queryKey: homeMatchesQueryKey(user.id) });
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
                onClick={() => {
                  setLocalError(null);
                  void homeQuery.refetch();
                }}
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
              editing={editingIds[match.id] ?? !match.guess.saved}
              saving={savingId === match.id}
              saveMessage={savedId === match.id ? "Palpite salvo." : null}
              onGuessChange={(value) => setDrafts((current) => ({ ...current, [match.id]: value }))}
              onEditGuess={() => setEditingIds((current) => ({ ...current, [match.id]: true }))}
              onSubmitGuess={() => void saveBet(match.id)}
            />
          ))}
        </main>
      </div>
    </MobileShell>
  );
}

async function fetchHomeMatches(userId: string): Promise<HomeMatchesData> {
  const primaryMatchResult = await supabase
    .from("matches")
    .select(
      "id,match_number,kickoff_at,status,stage,group_name,venue,city,country,home_score,away_score,bracket_source_home,bracket_source_away,qualification_method,qualified_team_id,regulation_home_score,regulation_away_score,home_team:teams!matches_home_team_id_fkey(id,external_key,name,short_name,country_code,flag_url),away_team:teams!matches_away_team_id_fkey(id,external_key,name,short_name,country_code,flag_url)",
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

  const [betResult, trendsResult] = await Promise.all([
    supabase
      .from("bets")
      .select(
        "match_id,home_score,away_score,regulation_home_score,regulation_away_score,predicted_qualified_team_id,predicted_qualification_method,knockout_points_breakdown,points",
      )
      .eq("user_id", userId),
    supabase.from("match_bet_trends").select("match_id,total_bets,home_pct,draw_pct,away_pct"),
  ]);
  const scoringRulesResult = await supabase
    .from("pool_scoring_rules")
    .select("stage_weights,base_points,team_multipliers")
    .limit(1)
    .maybeSingle();

  if (matchError || betResult.error) {
    throw new Error(
      matchError?.message ?? betResult.error?.message ?? "Falha ao carregar partidas.",
    );
  }

  const bets: Record<string, BetRow> = {};
  for (const row of (betResult.data ?? []) as BetRow[]) bets[row.match_id] = row;

  const trends: Record<string, BetTrend> = {};
  for (const row of (trendsResult.data ?? []) as BetTrend[]) {
    if (row.match_id) trends[row.match_id] = row;
  }

  return {
    matches: (matchData ?? []) as MatchRow[],
    bets,
    trends,
    scoringRules: (scoringRulesResult.data as KnockoutScoringRules | null) ?? null,
  };
}
