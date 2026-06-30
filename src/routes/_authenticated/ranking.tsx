import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import {
  BiBarChartAlt2,
  BiBullseye,
  BiCheckDouble,
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
import { cn } from "@/lib/utils";
import {
  isActiveEnrollment,
  rankingInitials,
  rankingName,
  type RankingEntry,
  type RankingMode,
  type RankingMovement,
} from "@/lib/ranking";
import {
  defaultKnockoutBasePoints,
  defaultKnockoutStageWeights,
  defaultSpecialPoints,
  knockoutStageLabel,
} from "@/lib/knockout";

export const Route = createFileRoute("/_authenticated/ranking")({
  component: RankingPage,
});

type RankingData = {
  rows: RankingEntry[];
  enrollmentStatus: string | null;
};

type PoolScoringRules = {
  stage_weights: Record<string, number> | null;
  base_points: Record<string, number> | null;
  team_multipliers: Record<string, number> | null;
  special_points: Record<string, number> | null;
};

type PublicClosedBetHistoryItem = {
  matchId: string;
  status: "live" | "finished";
  home: string;
  away: string;
  finalHome: number;
  finalAway: number;
  guessHome: number;
  guessAway: number;
  points: number;
};

type PublicClosedBetHistoryRow = {
  match_id: string;
  status: "live" | "finished" | null;
  home: string | null;
  away: string | null;
  final_home: number | null;
  final_away: number | null;
  guess_home: number | null;
  guess_away: number | null;
  points: number | null;
};

type PublicProfileRpcClient = {
  rpc: (
    fn: "get_public_profile_closed_bets",
    args: { _user_id: string },
  ) => Promise<{ data: PublicClosedBetHistoryRow[] | null; error: { message: string } | null }>;
};

type RankingCurrentMovementRow = {
  user_id: string | null;
  movement: number | null;
};

const rankingQueryKey = (mode: RankingMode, userId: string | null | undefined) =>
  ["ranking", mode, userId] as const;
const scoreRulesQueryKey = ["pool-scoring-rules"] as const;
const rankingMovementsQueryKey = (mode: RankingMode) => ["ranking-current-movements", mode] as const;
const publicProfileHistoryQueryKey = (userId: string | null | undefined) =>
  ["public-profile-history", userId] as const;
const rankingRefreshIntervalMs = 10_000;
const softTabTriggerClass =
  "rounded-xl text-muted-foreground transition-all hover:bg-brand/10 hover:text-brand data-[state=active]:bg-brand/12 data-[state=active]:text-brand data-[state=active]:shadow-none data-[state=active]:ring-1 data-[state=active]:ring-brand/15";

function RankingPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [mode, setMode] = useState<RankingMode>("free");
  const [selectedPlayer, setSelectedPlayer] = useState<RankingEntry | null>(null);

  const rankingQuery = useQuery({
    queryKey: rankingQueryKey(mode, user?.id),
    queryFn: () => fetchRanking(mode, user?.id ?? null),
    refetchInterval: rankingRefreshIntervalMs,
  });
  const scoreRulesQuery = useQuery({
    queryKey: scoreRulesQueryKey,
    queryFn: fetchScoreRules,
  });
  const rankingMovementsQuery = useQuery({
    queryKey: rankingMovementsQueryKey(mode),
    queryFn: () => fetchRankingMovements(mode),
    refetchInterval: rankingRefreshIntervalMs,
  });

  useEffect(() => {
    const channel = supabase
      .channel(`ranking-current-movement-events-${mode}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "ranking_position_movement_events",
          filter: `mode=eq.${mode}`,
        },
        () => {
          void queryClient.invalidateQueries({ queryKey: rankingQueryKey(mode, user?.id) });
          void queryClient.invalidateQueries({ queryKey: rankingMovementsQueryKey(mode) });
        },
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "matches",
        },
        () => {
          void queryClient.invalidateQueries({ queryKey: rankingQueryKey(mode, user?.id) });
          void queryClient.invalidateQueries({ queryKey: rankingMovementsQueryKey(mode) });
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [mode, queryClient, user?.id]);

  const rows = rankingQuery.data?.rows ?? [];
  const enrollmentStatus = rankingQuery.data?.enrollmentStatus ?? null;
  const loading = rankingQuery.isLoading && !rankingQuery.data;
  const error = rankingQuery.error instanceof Error ? rankingQuery.error.message : null;

  const podium = rows.slice(0, 3);
  const remaining = rows.slice(3);
  const rankingMovements = rankingMovementsQuery.data ?? {};
  const participates = isActiveEnrollment(enrollmentStatus);
  const openOwnProfile = () => void navigate({ to: "/profile" });

  return (
    <MobileShell active="ranking">
      <main className="screen-enter mx-auto max-w-xl space-y-5 px-3 py-5">
        <header className="text-center">
          <div className="mx-auto grid size-14 place-items-center rounded-2xl bg-warning/15 text-warning">
            <BiSolidTrophy className="size-8" />
          </div>
          <p className="eyebrow mt-3 text-brand">Classificação</p>
          <h1 className="mt-1 text-3xl font-extrabold tracking-tight">Ranking</h1>
        </header>

        <ScoreExplanationCard rules={scoreRulesQuery.data ?? null} mode={mode} />

        <Tabs value={mode} onValueChange={(value) => setMode(value as "free" | "pool")}>
          <TabsList className="grid h-auto w-full grid-cols-2 gap-1 rounded-2xl bg-muted/45 p-1 ring-1 ring-border/40">
            <TabsTrigger value="free" className={softTabTriggerClass}>
              Da Resenha
            </TabsTrigger>
            <TabsTrigger value="pool" className={softTabTriggerClass}>
              Do Bolão
            </TabsTrigger>
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
              variant={mode}
              movementByUserId={rankingMovements}
              onOpenProfile={setSelectedPlayer}
              onOpenOwnProfile={openOwnProfile}
            />
            <div className="space-y-2">
              {remaining.map((row) => (
                <RankingRow
                  key={row.user_id}
                  row={row}
                  isMe={row.user_id === user?.id}
                  variant={mode}
                  movement={row.user_id ? rankingMovements[row.user_id] : undefined}
                  onOpenProfile={setSelectedPlayer}
                  onOpenOwnProfile={openOwnProfile}
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

async function fetchRankingMovements(mode: RankingMode): Promise<Record<string, RankingMovement>> {
  const { data, error } = await supabase
    .from("ranking_current_movement_events")
    .select("user_id,movement")
    .eq("mode", mode);

  if (error) return {};

  return ((data ?? []) as RankingCurrentMovementRow[]).reduce<Record<string, RankingMovement>>(
    (acc, item) => {
      if (!item.user_id || item.movement === null) return acc;
      acc[item.user_id] = item.movement;
      return acc;
    },
    {},
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

async function fetchScoreRules(): Promise<PoolScoringRules | null> {
  const { data, error } = await supabase
    .from("pool_scoring_rules")
    .select("stage_weights,base_points,team_multipliers,special_points")
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return data as PoolScoringRules | null;
}

async function fetchPublicClosedBetHistory(userId: string): Promise<PublicClosedBetHistoryItem[]> {
  const rpcClient = supabase as unknown as PublicProfileRpcClient;
  const { data, error } = await rpcClient.rpc("get_public_profile_closed_bets", {
    _user_id: userId,
  });

  if (error) throw new Error(error.message);

  return ((data ?? []) as PublicClosedBetHistoryRow[]).map((item) => ({
    matchId: item.match_id,
    status: item.status ?? "finished",
    home: item.home || "Casa",
    away: item.away || "Fora",
    finalHome: item.final_home ?? 0,
    finalAway: item.final_away ?? 0,
    guessHome: item.guess_home ?? 0,
    guessAway: item.guess_away ?? 0,
    points: item.points ?? 0,
  }));
}

function ScoreExplanationCard({
  rules,
  mode,
}: {
  rules: PoolScoringRules | null;
  mode: RankingMode;
}) {
  const basePoints = { ...defaultKnockoutBasePoints, ...(rules?.base_points ?? {}) };
  const stageWeights = { ...defaultKnockoutStageWeights, ...(rules?.stage_weights ?? {}) };
  const specialPoints = { ...defaultSpecialPoints, ...(rules?.special_points ?? {}) };
  const exactExample =
    (basePoints.exact_score ?? 3) +
    (basePoints.goal_difference ?? 1) +
    (basePoints.qualified_team ?? 2) +
    (basePoints.qualification_method ?? 1) +
    (basePoints.perfect_combo ?? 1);

  return (
    <Card className={cn("glass-card border-brand/20", mode === "pool" && "border-warning/35")}>
      <CardContent className="p-0">
        <Accordion type="single" collapsible>
          <AccordionItem value="scoring" className="border-b-0 px-4">
            <AccordionTrigger className="py-3 text-sm font-extrabold hover:no-underline">
              <span className="flex items-center gap-2">
                <BiInfoCircle className="size-5 text-brand" />
                Como funciona a pontuação
              </span>
            </AccordionTrigger>
            <AccordionContent className="space-y-3 pb-4 text-sm text-muted-foreground">
              <p>
                O ranking usa só pontos apurados em jogos encerrados desde o início oficial. Empate
                no ranking é decidido por quem enviou o primeiro palpite válido antes; editar depois
                não muda esse desempate.
              </p>
              <div className="rounded-2xl bg-muted/55 p-3">
                <p className="font-bold text-foreground">Mata-mata</p>
                <p className="mt-1">
                  Placar exato:{" "}
                  <strong className="text-foreground">{basePoints.exact_score}</strong>; resultado
                  no tempo:{" "}
                  <strong className="text-foreground">{basePoints.regulation_result}</strong>; saldo
                  de gols: <strong className="text-foreground">{basePoints.goal_difference}</strong>
                  ; classificado:{" "}
                  <strong className="text-foreground">{basePoints.qualified_team}</strong>; método:{" "}
                  <strong className="text-foreground">{basePoints.qualification_method}</strong>;
                  combo perfeito:{" "}
                  <strong className="text-foreground">{basePoints.perfect_combo}</strong>.
                </p>
              </div>
              <div className="rounded-2xl bg-brand/10 p-3">
                <p className="font-bold text-foreground">Exemplo prático</p>
                <p className="mt-1">
                  Jogo fake: Time A 0 x 1 Time B. Palpite 0 x 1, Time B classificado no tempo: 3
                  placar + 1 saldo + 2 classificado + 1 método + 1 combo ={" "}
                  <strong className="text-foreground">{exactExample} pts</strong> na Fase de 32.
                  Depois aplica multiplicador da fase e do time, se houver.
                </p>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {Object.entries(stageWeights).map(([stage, weight]) => (
                  <div
                    key={stage}
                    className="rounded-2xl border border-border/70 bg-background/55 p-2"
                  >
                    <p className="text-[10px] font-black uppercase text-muted-foreground">
                      {knockoutStageLabel(stage) ?? stage}
                    </p>
                    <p className="text-lg font-extrabold text-foreground">x{weight}</p>
                  </div>
                ))}
              </div>
              {mode === "pool" && (
                <p>
                  No Bolão entram só inscrições ativas. Palpites especiais somam: campeão{" "}
                  <strong className="text-foreground">{specialPoints.champion}</strong>, vice{" "}
                  <strong className="text-foreground">{specialPoints.runner_up}</strong>, 3º lugar{" "}
                  <strong className="text-foreground">{specialPoints.third_place}</strong> e pódio
                  perfeito{" "}
                  <strong className="text-foreground">{specialPoints.perfect_podium}</strong>.
                </p>
              )}
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
            <DrawerTitle>Perfil do jogador</DrawerTitle>
            <DrawerDescription>
              Histórico visível no ranking {mode === "pool" ? "do Bolão" : "da Resenha"}.
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

          <section className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-5">
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
            <PublicMetric
              icon={<BiCheckDouble className="size-4" />}
              label="Classif."
              value={player.knockout_qualified_count ?? 0}
            />
            <PublicMetric
              icon={<BiSolidTrophy className="size-4" />}
              label="Especiais"
              value={player.special_points ?? 0}
            />
          </section>

          <section className="mt-4 space-y-2">
            <p className="font-extrabold">Histórico de palpites</p>
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
                  <span
                    className={cn(
                      "shrink-0 rounded-full px-2 py-1 text-xs font-bold",
                      item.status === "live" ? "bg-live/10 text-live" : "bg-brand/10 text-brand",
                    )}
                  >
                    {item.status === "live" ? "Em andamento" : `${item.points} pts`}
                  </span>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {item.status === "live" ? "Placar atual" : "Resultado"}{" "}
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
