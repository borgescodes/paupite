export type MatchTemporalStatus = "scheduled" | "live" | "finished";

export interface TeamInfo {
  shortName: string;
  /** ISO 3166-1 alpha-2 (or flag-icons subdivision) code, lowercase — resolves to /flags/{flagCode}.svg */
  flagCode: string;
}

export interface ScoreValue {
  home: number;
  away: number;
}

/** Reserved for a future real probability feed — see docs/wireframes-mobile.md "MegaBrain". Currently always absent (no mocked percentages). */
export interface MegaBrainForecast {
  home: number;
  draw: number;
  away: number;
}

export interface MatchCardData {
  id: string;
  group: string;
  venue: string;
  kickoffAt: string;
  status: MatchTemporalStatus;
  home: TeamInfo;
  away: TeamInfo;
  liveScore?: ScoreValue;
  finalScore?: ScoreValue;
  /** Whether the paupite window is currently open for this match. */
  paupiteOpen: boolean;
  /** Copy to show on the locked CTA when paupiteOpen is false (sourced from the seed). */
  paupiteClosedLabel: string;
  /** "HH:mm" closing time, shown next to the open countdown badge. */
  paupiteClosesAtLabel?: string;
  guess: { value: ScoreValue | null };
  /** Only populated once a real probability feed exists; absent renders the neutral MegaBrain state. */
  megaBrain?: MegaBrainForecast;
}

export interface DayOption {
  date: string;
  label: string;
  phaseLabel: string;
}
