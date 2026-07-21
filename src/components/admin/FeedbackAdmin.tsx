import { useEffect, useState } from "react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";

interface FeedbackRow {
  user_id: string;
  competition_id: string;
  tournament_suggestion: string | null;
  improvement_suggestion: string | null;
  created_at: string;
  updated_at: string;
}

interface UserLite {
  id: string;
  display_name: string | null;
  nickname: string | null;
  email: string;
}

export function FeedbackAdmin() {
  const [rows, setRows] = useState<FeedbackRow[]>([]);
  const [users, setUsers] = useState<Record<string, UserLite>>({});
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const [feedbackResult, usersResult] = await Promise.all([
        supabase
          .from("tournament_feedback")
          .select("*")
          .order("updated_at", { ascending: false }),
        supabase.from("profiles").select("id,display_name,nickname,email"),
      ]);
      if (cancelled) return;
      setRows((feedbackResult.data ?? []) as FeedbackRow[]);
      const map: Record<string, UserLite> = {};
      for (const u of (usersResult.data ?? []) as UserLite[]) map[u.id] = u;
      setUsers(map);
      setError(feedbackResult.error?.message ?? usersResult.error?.message ?? null);
      setLoading(false);
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <Card className="glass-card">
      <CardHeader>
        <CardTitle className="text-base">Respostas do formulário final</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {loading && <p className="text-sm text-muted-foreground">Carregando respostas...</p>}
        {error && <p className="text-sm text-destructive">{error}</p>}
        {!loading && rows.length === 0 && (
          <p className="text-sm text-muted-foreground">Nenhuma resposta enviada ainda.</p>
        )}
        {rows.map((row) => {
          const u = users[row.user_id];
          const name = u?.nickname || u?.display_name || u?.email || row.user_id;
          return (
            <div
              key={`${row.user_id}-${row.competition_id}`}
              className="rounded-2xl border border-border/70 bg-background/55 p-3 text-sm"
            >
              <p className="font-extrabold">{name}</p>
              <p className="text-[11px] text-muted-foreground">
                Atualizado em {new Date(row.updated_at).toLocaleString("pt-BR")}
              </p>
              <div className="mt-2 space-y-2">
                <div>
                  <p className="text-[11px] font-bold uppercase text-muted-foreground">
                    Próximo torneio
                  </p>
                  <p className="whitespace-pre-wrap">
                    {row.tournament_suggestion || <em className="text-muted-foreground">—</em>}
                  </p>
                </div>
                <div>
                  <p className="text-[11px] font-bold uppercase text-muted-foreground">
                    Melhorias
                  </p>
                  <p className="whitespace-pre-wrap">
                    {row.improvement_suggestion || <em className="text-muted-foreground">—</em>}
                  </p>
                </div>
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
