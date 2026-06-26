import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { BiGroup, BiInfoCircle, BiRefresh, BiSolidTrophy } from "react-icons/bi";

import { MobileShell } from "@/components/mobile/MobileShell";
import { RankingPodium } from "@/components/mobile/RankingPodium";
import { RankingRow } from "@/components/mobile/RankingRow";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { isActiveEnrollment, type RankingEntry } from "@/lib/ranking";

export const Route = createFileRoute("/_authenticated/ranking")({
  component: RankingPage,
});

type RankingMode = "free" | "pool";

type RankingData = {
  rows: RankingEntry[];
  enrollmentStatus: string | null;
};

const rankingQueryKey = (mode: RankingMode, userId: string | null | undefined) =>
  ["ranking", mode, userId] as const;

function RankingPage() {
  const { user } = useAuth();
  const [mode, setMode] = useState<RankingMode>("free");

  const rankingQuery = useQuery({
    queryKey: rankingQueryKey(mode, user?.id),
    queryFn: () => fetchRanking(mode, user?.id ?? null),
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
            <RankingPodium rows={podium} currentUserId={user?.id} />
            <div className="space-y-2">
              {remaining.map((row) => (
                <RankingRow key={row.user_id} row={row} isMe={row.user_id === user?.id} />
              ))}
            </div>
          </>
        )}
      </main>
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
