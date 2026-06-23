import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

interface Row {
  user_id: string;
  display_name: string | null;
  nickname: string | null;
  total_points: number;
  exact_scores_count: number;
  outcome_hits_count: number;
  bets_count: number;
  rank_position: number;
}

export const Route = createFileRoute("/_authenticated/ranking")({
  component: RankingPage,
});

function RankingPage() {
  const [rows, setRows] = useState<Row[]>([]);

  useEffect(() => {
    supabase.from("ranking").select("*").order("rank_position", { ascending: true })
      .then(({ data }) => setRows((data ?? []) as Row[]));
  }, []);

  return (
    <div style={{ maxWidth: 720, margin: "40px auto", padding: 16, fontFamily: "system-ui" }}>
      <Link to="/home">← voltar</Link>
      <h1>Ranking</h1>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr><th>#</th><th>Jogador</th><th>Pontos</th><th>Exatos</th><th>Vencedor</th><th>Palpites</th></tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.user_id} style={{ borderTop: "1px solid #ddd" }}>
              <td>{r.rank_position}</td>
              <td>{r.display_name ?? r.nickname ?? "-"}</td>
              <td><strong>{r.total_points}</strong></td>
              <td>{r.exact_scores_count}</td>
              <td>{r.outcome_hits_count}</td>
              <td>{r.bets_count}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
