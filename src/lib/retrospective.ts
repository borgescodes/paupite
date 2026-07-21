import { supabase } from "@/integrations/supabase/client";

export interface ArchivedCompetition {
  id: string;
  name: string;
  season: string | null;
  archived_at: string | null;
}

export interface BestMatch {
  matchId: string;
  homeName: string;
  awayName: string;
  homeScore: number;
  awayScore: number;
  guessHome: number;
  guessAway: number;
  kickoffAt: string;
  points: number;
}

export interface RankingEvolution {
  initial: number | null;
  best: number | null;
  final: number | null;
}

export interface RetrospectiveData {
  competition: ArchivedCompetition;
  championName: string | null;
  totalPoints: number;
  finalPosition: number | null;
  betsCount: number;
  exactScores: number;
  outcomeHits: number;
  bestMatch: BestMatch | null;
  evolution: RankingEvolution;
  feedback: {
    tournament_suggestion: string | null;
    improvement_suggestion: string | null;
  } | null;
  alreadyViewed: boolean;
}

/**
 * Loads the most recently archived competition, or null when none exists.
 */
export async function fetchArchivedCompetition(): Promise<ArchivedCompetition | null> {
  const { data, error } = await supabase
    .from("competitions")
    .select("id,name,season,archived_at,status")
    .eq("status", "archived")
    .order("archived_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error || !data) return null;
  return {
    id: data.id,
    name: data.name,
    season: data.season,
    archived_at: data.archived_at,
  };
}

export async function fetchRetrospective(
  userId: string,
  competition: ArchivedCompetition,
): Promise<RetrospectiveData> {
  const [ranking, championMatch, bestBet, movements, viewRow, feedbackRow] =
    await Promise.all([
      supabase
        .from("ranking_free")
        .select(
          "total_points,rank_position,bets_count,exact_scores_count,outcome_hits_count",
        )
        .eq("user_id", userId)
        .maybeSingle(),
      supabase
        .from("matches")
        .select(
          "id,stage,kickoff_at,qualified_team_id,home_score,away_score,home_team_id,away_team_id,home_team:teams!matches_home_team_id_fkey(name,short_name),away_team:teams!matches_away_team_id_fkey(name,short_name),qualified_team:teams!matches_qualified_team_id_fkey(name,short_name)",
        )
        .eq("competition_id", competition.id)
        .eq("stage", "final")
        .order("kickoff_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from("bets")
        .select(
          "match_id,home_score,away_score,points,match:matches!bets_match_id_fkey(id,kickoff_at,home_score,away_score,competition_id,home_team:teams!matches_home_team_id_fkey(name,short_name),away_team:teams!matches_away_team_id_fkey(name,short_name))",
        )
        .eq("user_id", userId)
        .gt("points", 0)
        .order("points", { ascending: false })
        .limit(20),
      supabase
        .from("ranking_position_movement_events")
        .select("current_rank_position,previous_rank_position,created_at,mode")
        .eq("user_id", userId)
        .eq("mode", "free")
        .order("created_at", { ascending: true }),
      supabase
        .from("user_retrospective_views")
        .select("user_id")
        .eq("user_id", userId)
        .eq("competition_id", competition.id)
        .maybeSingle(),
      supabase
        .from("tournament_feedback")
        .select("tournament_suggestion,improvement_suggestion")
        .eq("user_id", userId)
        .eq("competition_id", competition.id)
        .maybeSingle(),
    ]);

  const totalPoints = ranking.data?.total_points ?? 0;
  const finalPositionFromRanking = ranking.data?.rank_position ?? null;

  // Champion
  let championName: string | null = null;
  const finalMatch = championMatch.data;
  if (finalMatch?.qualified_team_id) {
    const qualified = (finalMatch as unknown as {
      qualified_team?: { name?: string | null; short_name?: string | null } | null;
    }).qualified_team;
    championName = qualified?.short_name || qualified?.name || null;
  }

  // Best match: filter to this competition and pick highest points, tie-break by most recent kickoff.
  type BestBetRow = {
    match_id: string;
    home_score: number;
    away_score: number;
    points: number;
    match: {
      id: string;
      kickoff_at: string;
      home_score: number;
      away_score: number;
      competition_id: string | null;
      home_team: { name: string | null; short_name: string | null } | null;
      away_team: { name: string | null; short_name: string | null } | null;
    } | null;
  };
  const bestBetRows = ((bestBet.data ?? []) as unknown as BestBetRow[]).filter(
    (row) => row.match?.competition_id === competition.id,
  );
  bestBetRows.sort((a, b) => {
    if (b.points !== a.points) return b.points - a.points;
    const ta = a.match ? new Date(a.match.kickoff_at).getTime() : 0;
    const tb = b.match ? new Date(b.match.kickoff_at).getTime() : 0;
    return tb - ta;
  });
  const bestRow = bestBetRows[0] ?? null;
  const bestMatch: BestMatch | null = bestRow?.match
    ? {
        matchId: bestRow.match.id,
        homeName:
          bestRow.match.home_team?.short_name || bestRow.match.home_team?.name || "Casa",
        awayName:
          bestRow.match.away_team?.short_name || bestRow.match.away_team?.name || "Fora",
        homeScore: bestRow.match.home_score ?? 0,
        awayScore: bestRow.match.away_score ?? 0,
        guessHome: bestRow.home_score ?? 0,
        guessAway: bestRow.away_score ?? 0,
        kickoffAt: bestRow.match.kickoff_at,
        points: bestRow.points ?? 0,
      }
    : null;

  // Ranking evolution
  type MovementRow = {
    current_rank_position: number;
    previous_rank_position: number;
    created_at: string;
  };
  const events = (movements.data ?? []) as MovementRow[];
  let initial: number | null = null;
  let best: number | null = null;
  let finalFromEvents: number | null = null;
  if (events.length > 0) {
    initial = events[0].previous_rank_position ?? events[0].current_rank_position;
    finalFromEvents = events[events.length - 1].current_rank_position;
    for (const ev of events) {
      const pos = ev.current_rank_position;
      if (pos != null && (best == null || pos < best)) best = pos;
    }
    if (initial != null && (best == null || initial < best)) best = initial;
  }
  const finalPosition = finalPositionFromRanking ?? finalFromEvents;
  if (finalPosition != null && (best == null || finalPosition < best)) best = finalPosition;

  return {
    competition,
    championName,
    totalPoints,
    finalPosition,
    betsCount: ranking.data?.bets_count ?? 0,
    exactScores: ranking.data?.exact_scores_count ?? 0,
    outcomeHits: ranking.data?.outcome_hits_count ?? 0,
    bestMatch,
    evolution: { initial, best, final: finalPosition },
    feedback: feedbackRow.data ?? null,
    alreadyViewed: Boolean(viewRow.data),
  };
}

/**
 * Registra a visualização — idempotente. Cria a linha na primeira vez
 * e sempre atualiza last_viewed_at.
 */
export async function markRetrospectiveViewed(
  userId: string,
  competitionId: string,
): Promise<void> {
  const now = new Date().toISOString();
  await supabase
    .from("user_retrospective_views")
    .upsert(
      {
        user_id: userId,
        competition_id: competitionId,
        first_viewed_at: now,
        last_viewed_at: now,
      },
      { onConflict: "user_id,competition_id", ignoreDuplicates: false },
    );
  // Se já existia (o upsert acima manteria first_viewed_at antigo apenas se
  // definirmos onConflict com ignoreDuplicates=false; forçamos update do last_viewed_at):
  await supabase
    .from("user_retrospective_views")
    .update({ last_viewed_at: now })
    .eq("user_id", userId)
    .eq("competition_id", competitionId);
}

export async function saveFeedback(
  userId: string,
  competitionId: string,
  payload: { tournament_suggestion: string; improvement_suggestion: string },
): Promise<void> {
  const { error } = await supabase.from("tournament_feedback").upsert(
    {
      user_id: userId,
      competition_id: competitionId,
      tournament_suggestion: payload.tournament_suggestion.trim() || null,
      improvement_suggestion: payload.improvement_suggestion.trim() || null,
    },
    { onConflict: "user_id,competition_id" },
  );
  if (error) throw new Error(error.message);
}
