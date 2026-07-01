import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

import type {
  DayOption,
  MatchCardData,
  MegaBrainForecast,
  PredictionValue,
  ScoreValue,
} from "@/components/mobile/types";
import {
  defaultKnockoutBasePoints,
  defaultKnockoutStageWeights,
  isKnockoutStage,
  knockoutStageLabel,
  normalizeKnockoutStage,
  parseBracketSource,
  type KnockoutScoringRules,
  type QualificationMethod,
} from "@/lib/knockout";
import { deriveMatchTemporalStatus } from "@/lib/match-status";

export interface BetTrend {
  match_id: string;
  total_bets: number | null;
  home_pct: number | null;
  draw_pct: number | null;
  away_pct: number | null;
}

export interface MatchTeamRow {
  id: string;
  external_key?: string | null;
  name: string;
  short_name: string | null;
  country_code: string | null;
  flag_url: string | null;
}

export interface MatchRow {
  id: string;
  match_number?: number | null;
  kickoff_at: string;
  status: string;
  stage: string | null;
  group_name: string | null;
  venue?: string | null;
  city?: string | null;
  country?: string | null;
  home_score: number;
  away_score: number;
  bracket_source_home?: string | null;
  bracket_source_away?: string | null;
  qualification_method?: QualificationMethod | null;
  qualified_team_id?: string | null;
  regulation_home_score?: number | null;
  regulation_away_score?: number | null;
  home_team: MatchTeamRow | null;
  away_team: MatchTeamRow | null;
}

export interface BetRow {
  match_id: string;
  home_score: number;
  away_score: number;
  regulation_home_score?: number | null;
  regulation_away_score?: number | null;
  predicted_qualified_team_id?: string | null;
  predicted_qualification_method?: QualificationMethod | null;
  knockout_points_breakdown?: Record<string, unknown> | null;
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

const MIN_BETS_FOR_MEGABRAIN = 1;

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
  draft: PredictionValue | undefined,
  trend?: BetTrend,
  scoringRules?: KnockoutScoringRules | null,
): MatchCardData {
  const kickoff = new Date(match.kickoff_at);
  const locked = kickoff.getTime() <= Date.now();
  const status = deriveMatchTemporalStatus(match.status, kickoff);
  const knockout = isKnockoutStage(match.stage);
  const score = {
    home: match.home_score,
    away: match.away_score,
  };
  const homeSource = parseBracketSource(match.bracket_source_home);
  const awaySource = parseBracketSource(match.bracket_source_away);
  const teamsDefined = Boolean(match.home_team?.id && match.away_team?.id);
  const stage = normalizeKnockoutStage(match.stage);
  const phaseWeight = stage
    ? (scoringRules?.stage_weights?.[stage] ?? defaultKnockoutStageWeights[stage])
    : 1;
  const teamMultiplier = knockout
    ? Math.max(
        multiplierFor(scoringRules, match.home_team),
        multiplierFor(scoringRules, match.away_team),
        1,
      )
    : 1;
  const maxBasePoints = maxKnockoutBasePoints(scoringRules);
  const savedValue = savedBet
    ? {
        home: savedBet.home_score,
        away: savedBet.away_score,
        qualifiedTeamId: savedBet.predicted_qualified_team_id ?? null,
        qualificationMethod: savedBet.predicted_qualification_method ?? null,
      }
    : null;

  return {
    id: match.id,
    group: match.group_name || formatStage(match.stage),
    venue: [match.venue, match.city].filter(Boolean).join(", ") || "Local a confirmar",
    kickoffAt: match.kickoff_at,
    status,
    home: toTeam(match.home_team, homeSource?.label),
    away: toTeam(match.away_team, awaySource?.label),
    teamsDefined,
    liveScore: status === "live" ? score : undefined,
    finalScore: status === "finished" ? score : undefined,
    knockout: knockout
      ? {
          stage: stage ?? "round_of_32",
          stageLabel: knockoutStageLabel(match.stage) ?? formatStage(match.stage),
          phaseWeight,
          teamMultiplier,
          maxBasePoints,
          maxPoints: Math.round(maxBasePoints * phaseWeight * teamMultiplier),
          qualifiedTeamId: match.qualified_team_id ?? null,
          qualificationMethod: match.qualification_method ?? null,
        }
      : undefined,
    paupiteOpen: status === "scheduled" && !locked && teamsDefined,
    paupiteClosedLabel: "Paupites encerrados",
    paupiteClosesAtLabel:
      status === "scheduled" && !locked
        ? kickoff.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })
        : undefined,
    guess: {
      value: draft ?? savedValue,
      saved: Boolean(savedBet),
      points: savedBet?.points ?? 0,
      pointsBreakdown: savedBet?.knockout_points_breakdown ?? undefined,
    },
    megaBrain: trendsToForecast(trend),
  };
}

function toTeam(team: MatchTeamRow | null, sourceLabel?: string | null) {
  const flagFromUrl = team?.flag_url?.match(/\/flags\/([^/.]+)\./)?.[1];
  return {
    id: team?.id ?? null,
    name: team?.name ?? sourceLabel ?? "A definir",
    shortName: team?.short_name || team?.name?.slice(0, 3).toUpperCase() || "A definir",
    flagCode: (flagFromUrl || team?.country_code || "un").toLowerCase(),
    placeholder: !team?.id,
    sourceLabel,
  };
}

export function formatStage(stage: string | null) {
  if (!stage) return "Copa 2026";
  const labels: Record<string, string> = {
    group_stage: "Fase de grupos",
    groups: "Fase de grupos",
    round_of_32: "16-avos de final",
    round_of_16: "Oitavas",
    quarterfinal: "Quartas",
    quarter_finals: "Quartas",
    semifinal: "Semifinal",
    semi_finals: "Semifinal",
    third_place: "3º lugar",
    final: "Final",
  };
  return labels[stage] ?? stage.replaceAll("_", " ");
}

function multiplierFor(rules: KnockoutScoringRules | null | undefined, team: MatchTeamRow | null) {
  const multipliers = rules?.team_multipliers ?? {};
  return Math.max(
    Number(multipliers[team?.id ?? ""] ?? 1),
    Number(multipliers[team?.external_key ?? ""] ?? 1),
  );
}

function maxKnockoutBasePoints(rules: KnockoutScoringRules | null | undefined) {
  const basePoints = { ...defaultKnockoutBasePoints, ...rules?.base_points };

  return (
    pointValue(basePoints.exact_score) +
    pointValue(basePoints.regulation_result) +
    pointValue(basePoints.goal_difference) +
    pointValue(basePoints.qualified_team) +
    pointValue(basePoints.qualification_method) +
    pointValue(basePoints.perfect_combo)
  );
}

function pointValue(value: unknown) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
}
