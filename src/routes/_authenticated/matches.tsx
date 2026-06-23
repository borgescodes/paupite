import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";

interface MatchRow {
  id: string;
  stage: string | null;
  group_name: string | null;
  kickoff_at: string;
  status: string;
  home_score: number;
  away_score: number;
  home_team_id: string | null;
  away_team_id: string | null;
  home_team?: { name: string; short_name: string | null; flag_url: string | null } | null;
  away_team?: { name: string; short_name: string | null; flag_url: string | null } | null;
}

interface BetRow { match_id: string; home_score: number; away_score: number; points: number }

export const Route = createFileRoute("/_authenticated/matches")({
  component: MatchesPage,
});

function MatchesPage() {
  const { user } = useAuth();
  const [matches, setMatches] = useState<MatchRow[]>([]);
  const [bets, setBets] = useState<Record<string, BetRow>>({});
  const [editing, setEditing] = useState<MatchRow | null>(null);

  useEffect(() => {
    void load();
    const ch = supabase
      .channel("matches-rt")
      .on("postgres_changes", { event: "*", schema: "public", table: "matches" }, () => void load())
      .on("postgres_changes", { event: "*", schema: "public", table: "bets" }, () => void load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [user?.id]);

  async function load() {
    const { data: m } = await supabase
      .from("matches")
      .select("*, home_team:home_team_id(name,short_name,flag_url), away_team:away_team_id(name,short_name,flag_url)")
      .order("kickoff_at", { ascending: true });
    setMatches((m ?? []) as unknown as MatchRow[]);
    if (user) {
      const { data: b } = await supabase.from("bets").select("match_id,home_score,away_score,points").eq("user_id", user.id);
      const map: Record<string, BetRow> = {};
      (b ?? []).forEach((r) => (map[r.match_id] = r as BetRow));
      setBets(map);
    }
  }

  return (
    <div style={{ maxWidth: 800, margin: "40px auto", padding: 16, fontFamily: "system-ui" }}>
      <Link to="/home">← voltar</Link>
      <h1>Partidas</h1>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr><th>Quando</th><th>Jogo</th><th>Placar</th><th>Status</th><th>Meu palpite</th><th></th></tr>
        </thead>
        <tbody>
          {matches.map((m) => {
            const bet = bets[m.id];
            const locked = new Date(m.kickoff_at) <= new Date();
            return (
              <tr key={m.id} style={{ borderTop: "1px solid #ddd" }}>
                <td>{new Date(m.kickoff_at).toLocaleString()}</td>
                <td>{m.home_team?.name ?? "?"} × {m.away_team?.name ?? "?"}</td>
                <td>{m.home_score} - {m.away_score}</td>
                <td>{m.status}</td>
                <td>{bet ? `${bet.home_score}-${bet.away_score} (${bet.points}pt)` : "-"}</td>
                <td>
                  <button disabled={locked} onClick={() => setEditing(m)}>
                    {locked ? "Travado" : (bet ? "Editar" : "Palpitar")}
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {editing && user && (
        <BetModal
          match={editing}
          current={bets[editing.id]}
          userId={user.id}
          onClose={() => { setEditing(null); void load(); }}
        />
      )}
    </div>
  );
}

function BetModal({ match, current, userId, onClose }: {
  match: MatchRow; current?: BetRow; userId: string; onClose: () => void;
}) {
  const [h, setH] = useState(current?.home_score ?? 0);
  const [a, setA] = useState(current?.away_score ?? 0);
  const [err, setErr] = useState<string | null>(null);

  async function save() {
    setErr(null);
    const { error } = await supabase.from("bets").upsert({
      user_id: userId, match_id: match.id, home_score: h, away_score: a,
    }, { onConflict: "user_id,match_id" });
    if (error) return setErr(error.message);
    onClose();
  }

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.4)", display: "grid", placeItems: "center" }}>
      <div style={{ background: "white", padding: 16, minWidth: 280 }}>
        <h3>{match.home_team?.name} × {match.away_team?.name}</h3>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <input type="number" min={0} value={h} onChange={(e) => setH(Number(e.target.value))} style={{ width: 60 }} />
          <span>x</span>
          <input type="number" min={0} value={a} onChange={(e) => setA(Number(e.target.value))} style={{ width: 60 }} />
        </div>
        <div style={{ marginTop: 12, display: "flex", gap: 8 }}>
          <button onClick={save}>Salvar</button>
          <button onClick={onClose}>Cancelar</button>
        </div>
        {err && <p style={{ color: "crimson" }}>{err}</p>}
      </div>
    </div>
  );
}
