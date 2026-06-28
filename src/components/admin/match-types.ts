import type { QualificationMethod } from "@/lib/knockout";

export interface AdminTeam {
  id: string;
  external_key?: string | null;
  name: string;
  short_name: string | null;
  country_code: string | null;
}

export interface AdminCompetition {
  id: string;
  name: string;
}

export interface AdminMatch {
  id: string;
  kickoff_at: string;
  status: string;
  deleted_at: string | null;
  home_team_id: string | null;
  away_team_id: string | null;
  home_score: number;
  away_score: number;
  regulation_home_score: number | null;
  regulation_away_score: number | null;
  qualified_team_id: string | null;
  qualification_method: QualificationMethod | null;
  bracket_source_home: string | null;
  bracket_source_away: string | null;
  competition_id: string | null;
  stage: string | null;
  group_name: string | null;
  venue: string | null;
  city: string | null;
  home_team: Pick<AdminTeam, "name" | "short_name" | "country_code"> | null;
  away_team: Pick<AdminTeam, "name" | "short_name" | "country_code"> | null;
}

export interface AdminMatchFormValue {
  competition_id: string;
  home_team_id: string;
  away_team_id: string;
  kickoff_at: string;
  stage: string;
  group_name: string;
  venue: string;
  city: string;
}
