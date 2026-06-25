import { createFileRoute } from "@tanstack/react-router";
import { Medal, Trophy } from "lucide-react";
import { useEffect, useState } from "react";

import { MobileShell } from "@/components/mobile/MobileShell";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

interface RankingRow {
  user_id: string | null;
  display_name: string | null;
  nickname: string | null;
  avatar_url: string | null;
  total_points: number | null;
  exact_scores_count: number | null;
  outcome_hits_count: number | null;
  bets_count: number | null;
  rank_position: number | null;
}

export const Route = createFileRoute("/_authenticated/ranking")({
  component: RankingPage,
});

function RankingPage() {
  const { user } = useAuth();
  const [mode, setMode] = useState<"free" | "pool">("free");
  const [rows, setRows] = useState<RankingRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    const view = mode === "free" ? "ranking_free" : "ranking_pool";
    supabase
      .from(view)
      .select("*")
      .order("rank_position", { ascending: true })
      .then(async ({ data, error: loadError }) => {
        if (loadError && mode === "free") {
          const fallback = await supabase
            .from("ranking")
            .select("*")
            .order("rank_position", { ascending: true });
          setRows((fallback.data ?? []) as RankingRow[]);
          setError(fallback.error?.message ?? null);
        } else {
          setRows((data ?? []) as RankingRow[]);
          setError(loadError?.message ?? null);
        }
        setLoading(false);
      });
  }, [mode]);

  return (
    <MobileShell active="ranking">
      <main className="mx-auto max-w-xl space-y-4 px-3 py-5">
        <div className="text-center">
          <Trophy className="mx-auto size-8 text-warning" />
          <h1 className="mt-2 text-2xl font-extrabold">Ranking</h1>
          <p className="text-sm text-muted-foreground">
            Acompanhe a resenha e a classificação oficial do bolão.
          </p>
        </div>

        <Tabs value={mode} onValueChange={(value) => setMode(value as "free" | "pool")}>
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="free">Ranking da Resenha</TabsTrigger>
            <TabsTrigger value="pool">Ranking do Bolão</TabsTrigger>
          </TabsList>
        </Tabs>

        {loading && <p className="text-center text-sm text-muted-foreground">Carregando...</p>}
        {error && <p className="text-center text-sm text-destructive">{error}</p>}
        {!loading && !error && rows.length === 0 && (
          <Card>
            <CardContent className="p-8 text-center text-sm text-muted-foreground">
              {mode === "pool"
                ? "Ainda não há participantes confirmados no ranking oficial."
                : "O ranking será preenchido assim que os palpites forem registrados."}
            </CardContent>
          </Card>
        )}

        <div className="space-y-2">
          {rows.map((row) => {
            const name = row.nickname || row.display_name || "Jogador";
            const position = row.rank_position ?? 0;
            const isMe = row.user_id === user?.id;
            return (
              <Card
                key={row.user_id}
                className={cn(
                  "overflow-hidden shadow-none",
                  position <= 3 && "border-warning/60 bg-warning/5",
                  isMe && "ring-2 ring-brand/40",
                )}
              >
                <CardContent className="flex items-center gap-3 p-3">
                  <div className="grid w-9 shrink-0 place-items-center text-lg font-extrabold">
                    {position <= 3 ? (
                      <Medal
                        className={cn(
                          "size-6",
                          position === 1 && "text-warning",
                          position === 2 && "text-muted-foreground",
                          position === 3 && "text-amber-700",
                        )}
                      />
                    ) : (
                      `${position}º`
                    )}
                  </div>
                  <Avatar className="size-10">
                    {row.avatar_url && <AvatarImage src={row.avatar_url} alt={name} />}
                    <AvatarFallback className="bg-brand/15 font-bold text-brand">
                      {name.slice(0, 2).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-bold">
                      {name} {isMe && <span className="text-xs text-brand">(você)</span>}
                    </p>
                    <p className="text-[11px] text-muted-foreground">
                      {row.exact_scores_count ?? 0} exatos · {row.outcome_hits_count ?? 0} acertos ·{" "}
                      {row.bets_count ?? 0} palpites
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-xl font-extrabold tabular-nums">{row.total_points ?? 0}</p>
                    <p className="text-[10px] uppercase text-muted-foreground">pontos</p>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </main>
    </MobileShell>
  );
}
