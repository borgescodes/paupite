import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

import type {
  DayOption,
  MatchCardData,
  MegaBrainForecast,
  ScoreValue,
} from "@/components/mobile/types";

export interface BetTrend {
  match_id: string;
  total_bets: number | null;
  home_pct: number | null;
  draw_pct: number | null;
  away_pct: number | null;
}

export interface MatchTeamRow {
  id: string;
  name: string;
  short_name: string | null;
  country_code: string | null;
  flag_url: string | null;
}

export interface MatchRow {
  id: string;
  kickoff_at: string;
  status: string;
  stage: string | null;
  group_name: string | null;
  venue?: string | null;
  city?: string | null;
  country?: string | null;
  home_score: number;
  away_score: number;
  home_team: MatchTeamRow | null;
  away_team: MatchTeamRow | null;
}

export interface BetRow {
  match_id: string;
  home_score: number;
  away_score: number;
  points: number;
}

export function buildMatchDays(matches: MatchRow[]): DayOption[] {
  const unique = new Map<string, DayOption>();
  for (const match of matches) {
    const date = matchDateKey(match.kickoff_at);
    if (unique.has(date)) continue;
    const kickoff = new Date(match.kickoff_at);
    unique.set(date, {
      date,
      label: format(kickoff, "dd MMM", { locale: ptBR }).replace(".", "").toUpperCase(),
      phaseLabel: formatStage(match.stage),
    });
  }
  return [...unique.values()].sort((left, right) => left.date.localeCompare(right.date));
}

export function matchDateKey(kickoffAt: string) {
  return format(new Date(kickoffAt), "yyyy-MM-dd");
}

const MIN_BETS_FOR_MEGABRAIN = 3;

export function trendsToForecast(trend: BetTrend | undefined): MegaBrainForecast | undefined {
  if (!trend || !trend.total_bets || trend.total_bets < MIN_BETS_FOR_MEGABRAIN) return undefined;
  return {
    home: Math.round(trend.home_pct ?? 0),
    draw: Math.round(trend.draw_pct ?? 0),
    away: Math.round(trend.away_pct ?? 0),
    totalBets: trend.total_bets,
  };
}

export function toMatchCard(
  match: MatchRow,
  savedBet: BetRow | undefined,
  draft: ScoreValue | undefined,
  trend?: BetTrend,
): MatchCardData {
  const kickoff = new Date(match.kickoff_at);
  const locked = kickoff.getTime() <= Date.now();
  const status = normalizeStatus(match.status);
  const score = { home: match.home_score, away: match.away_score };

  return {
    id: match.id,
    group: match.group_name || formatStage(match.stage),
    venue: [match.venue, match.city].filter(Boolean).join(", ") || "Local a confirmar",
    kickoffAt: match.kickoff_at,
    status,
    home: toTeam(match.home_team),
    away: toTeam(match.away_team),
    liveScore: status === "live" ? score : undefined,
    finalScore: status === "finished" ? score : undefined,
    paupiteOpen: status === "scheduled" && !locked,
    paupiteClosedLabel: "Paupites encerrados",
    paupiteClosesAtLabel:
      status === "scheduled" && !locked
        ? kickoff.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })
        : undefined,
    guess: {
      value: draft ?? (savedBet ? { home: savedBet.home_score, away: savedBet.away_score } : null),
      saved: Boolean(savedBet),
      points: savedBet?.points ?? 0,
    },
    megaBrain: status === "finished" ? trendsToForecast(trend) : undefined,
  };
}

function normalizeStatus(status: string): MatchCardData["status"] {
  if (status === "live") return "live";
  if (status === "finished" || status === "closed") return "finished";
  return "scheduled";
}

function toTeam(team: MatchTeamRow | null) {
  const fallback = "??";
  const flagFromUrl = team?.flag_url?.match(/\/flags\/([^/.]+)\./)?.[1];
  return {
    shortName: team?.short_name || team?.name?.slice(0, 3).toUpperCase() || fallback,
    flagCode: (flagFromUrl || team?.country_code || "un").toLowerCase(),
  };
}

function formatStage(stage: string | null) {
  if (!stage) return "Copa 2026";
  const labels: Record<string, string> = {
    group_stage: "Fase de grupos",
    groups: "Fase de grupos",
    round_of_32: "16-avos",
    round_of_16: "Oitavas",
    quarterfinal: "Quartas",
    semifinal: "Semifinal",
    final: "Final",
  };
  return labels[stage] ?? stage.replaceAll("_", " ");
}
