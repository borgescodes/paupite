export type RankingMode = "free" | "pool";

export type RankingMovement = number;

export interface RankingEntry {
  user_id: string | null;
  display_name: string | null;
  nickname: string | null;
  avatar_url: string | null;
  total_points: number | null;
  exact_scores_count: number | null;
  outcome_hits_count: number | null;
  knockout_qualified_count: number | null;
  knockout_combo_count: number | null;
  special_points: number | null;
  bets_count: number | null;
  rank_position: number | null;
}

export function rankingName(row: RankingEntry) {
  return row.nickname || row.display_name || "Jogador";
}

export function rankingInitials(row: RankingEntry) {
  return rankingName(row)
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

export function isActiveEnrollment(status?: string | null) {
  return Boolean(status && ["active", "confirmed", "paid"].includes(status));
}
