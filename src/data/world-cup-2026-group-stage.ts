import seedJson from "./world-cup-2026-group-stage-seed.json";
import type { DayOption, MatchCardData } from "@/components/mobile/types";

export type SeedMatchStatus = "scheduled" | "live" | "finished";
export type SeedMatchOutcome = "home" | "away" | "draw";

export interface SeedTeam {
  id: string;
  name: string;
  short_name: string;
  flag_code: string;
  flag_path: string;
}

export interface SeedScore {
  home: number | null;
  away: number | null;
}

export interface SeedWinner {
  team_id: string | null;
  outcome: SeedMatchOutcome | null;
}

export interface SeedPaupiteWindow {
  opens_at: string;
  closes_at: string;
  is_open: boolean;
  closed_label: string;
}

export interface SeedMatch {
  id: string;
  match_number: number;
  date: string;
  date_label: string;
  kickoff_time: string;
  kickoff_datetime: string;
  stage: string;
  stage_label: string;
  group: string;
  stadium: string;
  city: string;
  country: string;
  home_team: SeedTeam;
  away_team: SeedTeam;
  status: SeedMatchStatus;
  score: SeedScore;
  winner: SeedWinner;
  paupite: SeedPaupiteWindow;
}

export interface SeedCompetition {
  id: string;
  name: string;
  stage: string;
  stage_label: string;
  timezone: string;
  data_version: string;
}

export interface SeedData {
  competition: SeedCompetition;
  matches: SeedMatch[];
}

export const worldCup2026GroupStageSeed = seedJson as SeedData;

export const groupStageMatches: SeedMatch[] = [...worldCup2026GroupStageSeed.matches].sort((a, b) =>
  a.kickoff_datetime.localeCompare(b.kickoff_datetime),
);

export function getMatchDays(matches: SeedMatch[] = groupStageMatches): DayOption[] {
  const byDate = new Map<string, DayOption>();
  for (const match of matches) {
    if (!byDate.has(match.date)) {
      byDate.set(match.date, {
        date: match.date,
        label: match.date_label,
        phaseLabel: match.stage_label,
      });
    }
  }
  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
}

export function getMatchesForDate(
  date: string,
  matches: SeedMatch[] = groupStageMatches,
): SeedMatch[] {
  return matches
    .filter((match) => match.date === date)
    .sort((a, b) => a.kickoff_datetime.localeCompare(b.kickoff_datetime));
}

function toScoreValue(score: SeedScore) {
  if (score.home == null || score.away == null) return undefined;
  return { home: score.home, away: score.away };
}

export function toMatchCardData(match: SeedMatch): MatchCardData {
  return {
    id: match.id,
    group: match.group,
    venue: `${match.stadium}, ${match.city}`,
    kickoffAt: match.kickoff_datetime,
    status: match.status,
    home: { shortName: match.home_team.short_name, flagCode: match.home_team.flag_code },
    away: { shortName: match.away_team.short_name, flagCode: match.away_team.flag_code },
    finalScore: match.status === "finished" ? toScoreValue(match.score) : undefined,
    paupiteOpen: match.paupite.is_open,
    paupiteClosedLabel: match.paupite.closed_label,
    paupiteClosesAtLabel: match.paupite.is_open ? match.paupite.closes_at.slice(11, 16) : undefined,
    guess: { value: null },
  };
}
