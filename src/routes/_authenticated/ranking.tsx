import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { useState } from "react";
import {
  BiBarChartAlt2,
  BiBullseye,
  BiGroup,
  BiInfoCircle,
  BiRefresh,
  BiSolidTrophy,
} from "react-icons/bi";

import { MobileShell } from "@/components/mobile/MobileShell";
import { RankingPodium } from "@/components/mobile/RankingPodium";
import { RankingRow } from "@/components/mobile/RankingRow";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { isActiveEnrollment, rankingInitials, rankingName, type RankingEntry } from "@/lib/ranking";

export const Route = createFileRoute("/_authenticated/ranking")({
  component: RankingPage,
});

type RankingMode = "free" | "pool";

type RankingData = {
  rows: RankingEntry[];
  enrollmentStatus: string | null;
};

type ScoreRules = {
  exact_score_points: number | null;
  outcome_points: number | null;
  goal_difference_bonus: number | null;
};

type PublicClosedBetHistoryItem = {
  matchId: string;
  home: string;
  away: string;
  finalHome: number;
  finalAway: number;
  guessHome: number;
  guessAway: number;
  points: number;
};

const rankingQueryKey = (mode: RankingMode, userId: string | null | undefined) =>
  ["ranking", mode, userId] as const;
const scoreRulesQueryKey = ["score-rules"] as const;
const publicProfileHistoryQueryKey = (userId: string | null | undefined) =>
  ["public-profile-history", userId] as const;

function RankingPage() {
  const { user } = useAuth();
  const [mode, setMode] = useState<RankingMode>("free");
  const [selectedPlayer, setSelectedPlayer] = useState<RankingEntry | null>(null);

  const rankingQuery = useQuery({
    queryKey: rankingQueryKey(mode, user?.id),
    queryFn: () => fetchRanking(mode, user?.id ?? null),
  });
  const scoreRulesQuery = useQuery({
    queryKey: scoreRulesQueryKey,
    queryFn: fetchScoreRules,
  });

  const rows = rankingQuery.data?.rows ?? [];
  const enrollmentStatus = rankingQuery.data?.enrollmentStatus ?? null;
  const loading = rankingQuery.isLoading && !rankingQuery.data;
  const error = rankingQuery.error instanceof Error ? rankingQuery.error.message : null;

  const podium = rows.filter((row) => (row.rank_position ?? 99) <= 3);
  const remaining = rows.filter((row) => (row.rank_position ?? 0) > 3);
  const participates = isActiveEnrollment(enrollmentStatus);

  return (
    <MobileShell active="ranking">
      <main className="screen-enter mx-auto max-w-xl space-y-5 px-3 py-5">
        <header className="text-center">
          <div className="mx-auto grid size-14 place-items-center rounded-2xl bg-warning/15 text-warning">
            <BiSolidTrophy className="size-8" />
          </div>
          <p className="eyebrow mt-3 text-brand">Classificação</p>
          <h1 className="mt-1 text-3xl font-extrabold tracking-tight">Ranking</h1>
          <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
            A Resenha reúne todos os palpites. O Bolão considera apenas inscrições confirmadas.
          </p>
        </header>

        <ScoreExplanationCard rules={scoreRulesQuery.data ?? null} />

        <Tabs value={mode} onValueChange={(value) => setMode(value as "free" | "pool")}>
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="free">Da Resenha</TabsTrigger>
            <TabsTrigger value="pool">Do Bolão</TabsTrigger>
          </TabsList>
        </Tabs>

        {mode === "pool" && !participates && !loading && (
          <Card className="glass-card border-brand/25">
            <CardContent className="flex items-start gap-3 p-4">
              <div className="grid size-10 shrink-0 place-items-center rounded-2xl bg-brand/12 text-brand">
                <BiGroup className="size-5" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="font-extrabold">Você pode acompanhar, mas ainda não participa.</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Sua posição aparecerá aqui quando a inscrição do bolão estiver confirmada.
                </p>
                <Button asChild size="sm" variant="outline" className="mt-3">
                  <Link to="/pool">Ver minha inscrição</Link>
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {loading && (
          <div className="space-y-3">
            <Skeleton className="h-44 rounded-3xl" />
            <Skeleton className="h-20 rounded-2xl" />
            <Skeleton className="h-20 rounded-2xl" />
          </div>
        )}

        {error && (
          <Card className="border-destructive/30 bg-destructive/5">
            <CardContent className="flex items-center gap-3 p-4 text-sm text-destructive">
              <BiInfoCircle className="size-5 shrink-0" />
              <span className="flex-1">{error}</span>
              <Button
                size="icon"
                variant="ghost"
                aria-label="Recarregar ranking"
                onClick={() => void rankingQuery.refetch()}
              >
                <BiRefresh className="size-5" />
              </Button>
            </CardContent>
          </Card>
        )}

        {!loading && !error && rows.length === 0 && (
          <Card className="glass-card border-dashed">
            <CardContent className="p-9 text-center text-sm text-muted-foreground">
              <BiSolidTrophy className="mx-auto mb-3 size-8 text-warning/70" />
              {mode === "pool"
                ? "Ainda não há participantes confirmados no ranking oficial."
                : "O ranking será preenchido assim que os palpites forem registrados."}
            </CardContent>
          </Card>
        )}

        {!loading && !error && (
          <>
            <RankingPodium
              rows={podium}
              currentUserId={user?.id}
              onOpenProfile={setSelectedPlayer}
            />
            <div className="space-y-2">
              {remaining.map((row) => (
                <RankingRow
                  key={row.user_id}
                  row={row}
                  isMe={row.user_id === user?.id}
                  onOpenProfile={setSelectedPlayer}
                />
              ))}
            </div>
          </>
        )}
      </main>
      <PublicProfileDrawer
        player={selectedPlayer}
        mode={mode}
        currentUserId={user?.id}
        onOpenChange={(open) => {
          if (!open) setSelectedPlayer(null);
        }}
      />
    </MobileShell>
  );
}

async function fetchRanking(mode: RankingMode, userId: string | null): Promise<RankingData> {
  const view = mode === "free" ? "ranking_free" : "ranking_pool";
  const rankingPromise = supabase.from(view).select("*").order("rank_position");
  const enrollmentPromise = userId
    ? supabase.from("enrollments").select("status").eq("user_id", userId).maybeSingle()
    : Promise.resolve({ data: null, error: null });
  const [rankingResult, enrollmentResult] = await Promise.all([rankingPromise, enrollmentPromise]);

  const error = rankingResult.error?.message ?? enrollmentResult.error?.message ?? null;
  if (error) throw new Error(error);

  return {
    rows: (rankingResult.data ?? []) as RankingEntry[],
    enrollmentStatus: enrollmentResult.data?.status ?? null,
  };
}

async function fetchScoreRules(): Promise<ScoreRules | null> {
  const { data, error } = await supabase
    .from("score_rules")
    .select("exact_score_points,outcome_points,goal_difference_bonus")
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return data;
}

async function fetchPublicClosedBetHistory(userId: string): Promise<PublicClosedBetHistoryItem[]> {
  const [betsResult, matchesResult] = await Promise.all([
    supabase.from("bets").select("match_id,home_score,away_score,points").eq("user_id", userId),
    supabase
      .from("matches")
      .select(
        "id,status,home_score,away_score,home_team:teams!matches_home_team_id_fkey(short_name,name),away_team:teams!matches_away_team_id_fkey(short_name,name)",
      )
      .in("status", ["finished", "closed"])
      .order("kickoff_at", { ascending: false }),
  ]);

  if (betsResult.error || matchesResult.error) {
    throw new Error(
      betsResult.error?.message ?? matchesResult.error?.message ?? "Falha ao carregar perfil.",
    );
  }

  return buildPublicClosedBetHistory(betsResult.data ?? [], matchesResult.data ?? []);
}

function buildPublicClosedBetHistory(
  bets: Array<{ match_id: string; home_score: number; away_score: number; points: number }>,
  matches: Array<{
    id: string;
    home_score: number;
    away_score: number;
    home_team?: { short_name: string | null; name: string | null } | null;
    away_team?: { short_name: string | null; name: string | null } | null;
  }>,
) {
  const betByMatch = new Map(bets.map((bet) => [bet.match_id, bet]));

  return matches
    .map((match) => {
      const bet = betByMatch.get(match.id);
      if (!bet) return null;
      return {
        matchId: match.id,
        home: match.home_team?.short_name || match.home_team?.name || "Casa",
        away: match.away_team?.short_name || match.away_team?.name || "Fora",
        finalHome: match.home_score ?? 0,
        finalAway: match.away_score ?? 0,
        guessHome: bet.home_score ?? 0,
        guessAway: bet.away_score ?? 0,
        points: bet.points ?? 0,
      };
    })
    .filter((item): item is PublicClosedBetHistoryItem => Boolean(item))
    .slice(0, 8);
}

function ScoreExplanationCard({ rules }: { rules: ScoreRules | null }) {
  const exact = rules?.exact_score_points ?? 0;
  const outcome = rules?.outcome_points ?? 0;
  const bonus = rules?.goal_difference_bonus ?? 0;

  return (
    <Card className="glass-card border-brand/20">
      <CardContent className="p-0">
        <Accordion type="single" collapsible>
          <AccordionItem value="scoring" className="border-b-0 px-4">
            <AccordionTrigger className="py-3 text-sm font-extrabold hover:no-underline">
              <span className="flex items-center gap-2">
                <BiInfoCircle className="size-5 text-brand" />
                Como funciona a pontuação
              </span>
            </AccordionTrigger>
            <AccordionContent className="pb-4 text-sm text-muted-foreground">
              O ranking usa somente pontos já apurados em jogos encerrados. Placar exato vale{" "}
              <strong className="text-foreground">{exact}</strong> ponto(s); resultado correto vale{" "}
              <strong className="text-foreground">{outcome}</strong>. Quando o saldo de gols também
              bate, há bônus de <strong className="text-foreground">{bonus}</strong> ponto(s).
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </CardContent>
    </Card>
  );
}

function PublicProfileDrawer({
  player,
  mode,
  currentUserId,
  onOpenChange,
}: {
  player: RankingEntry | null;
  mode: RankingMode;
  currentUserId?: string;
  onOpenChange: (open: boolean) => void;
}) {
  const isOwnProfile = Boolean(player?.user_id && player.user_id === currentUserId);
  const historyQuery = useQuery({
    queryKey: publicProfileHistoryQueryKey(player?.user_id),
    enabled: Boolean(player?.user_id && !isOwnProfile),
    queryFn: () => fetchPublicClosedBetHistory(player!.user_id!),
  });

  if (!player) return null;

  const name = rankingName(player);
  const history = historyQuery.data ?? [];

  return (
    <Drawer open={Boolean(player)} onOpenChange={onOpenChange}>
      <DrawerContent className="max-h-[88vh]">
        <div className="mx-auto w-full max-w-xl overflow-y-auto px-4 pb-6">
          <DrawerHeader className="px-0 text-left">
            <DrawerTitle>Perfil público</DrawerTitle>
            <DrawerDescription>
              Dados públicos do ranking {mode === "pool" ? "do Bolão" : "da Resenha"}.
            </DrawerDescription>
          </DrawerHeader>

          <section className="flex items-center gap-3 rounded-3xl border border-border/70 bg-muted/35 p-4">
            <Avatar className="size-16 border border-border shadow-sm">
              {player.avatar_url && <AvatarImage src={player.avatar_url} alt={name} />}
              <AvatarFallback className="bg-brand/15 text-lg font-extrabold text-brand">
                {rankingInitials(player)}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1">
              <p className="truncate text-xl font-extrabold">{name}</p>
              <p className="text-sm text-muted-foreground">
                {player.rank_position ? `${player.rank_position}º lugar` : "Sem posição"} ·{" "}
                {player.total_points ?? 0} pontos
              </p>
            </div>
          </section>

          <section className="mt-3 grid grid-cols-3 gap-2">
            <PublicMetric
              icon={<BiBarChartAlt2 className="size-4" />}
              label="Palpites"
              value={player.bets_count ?? 0}
            />
            <PublicMetric
              icon={<BiBullseye className="size-4" />}
              label="Exatos"
              value={player.exact_scores_count ?? 0}
            />
            <PublicMetric
              icon={<BiSolidTrophy className="size-4" />}
              label="Acertos"
              value={player.outcome_hits_count ?? 0}
            />
          </section>

          <section className="mt-4 space-y-2">
            <p className="font-extrabold">Histórico encerrado</p>
            {historyQuery.isLoading && <Skeleton className="h-24 rounded-2xl" />}
            {!historyQuery.isLoading && history.length === 0 && (
              <p className="rounded-2xl border border-dashed border-border p-4 text-sm text-muted-foreground">
                Histórico público indisponível ou sem palpites encerrados.
              </p>
            )}
            {history.map((item) => (
              <div
                key={item.matchId}
                className="rounded-2xl border border-border/70 bg-background/55 p-3 text-sm"
              >
                <div className="flex items-center justify-between gap-3">
                  <p className="min-w-0 truncate font-extrabold">
                    {item.home} x {item.away}
                  </p>
                  <span className="shrink-0 rounded-full bg-brand/10 px-2 py-1 text-xs font-bold text-brand">
                    {item.points} pts
                  </span>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  Resultado{" "}
                  <strong className="text-foreground">
                    {item.finalHome} - {item.finalAway}
                  </strong>{" "}
                  · Palpite{" "}
                  <strong className="text-foreground">
                    {item.guessHome} - {item.guessAway}
                  </strong>
                </p>
              </div>
            ))}
          </section>
        </div>
      </DrawerContent>
    </Drawer>
  );
}

function PublicMetric({ icon, label, value }: { icon: ReactNode; label: string; value: number }) {
  return (
    <div className="rounded-2xl bg-muted/60 p-3">
      <div className="flex items-center gap-1.5 text-brand">{icon}</div>
      <p className="mt-1 text-lg font-extrabold tabular-nums">{value}</p>
      <p className="text-[10px] font-bold uppercase text-muted-foreground">{label}</p>
    </div>
  );
}
