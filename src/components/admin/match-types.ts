export interface AdminTeam {
  id: string;
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
  home_team_id: string | null;
  away_team_id: string | null;
  home_score: number;
  away_score: number;
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
