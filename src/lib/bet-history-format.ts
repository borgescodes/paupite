type BetHistoryMethod = string | null | undefined;

type BetHistoryScoreLineInput = {
  home: string;
  away: string;
  homeScore: number;
  awayScore: number;
  method?: BetHistoryMethod;
  qualifiedTeam?: string | null;
  variant: "result" | "prediction";
};

export const rankingHistoryCutoffUtcIso = "2026-06-28T03:00:00.000Z";

export function isRankingHistoryEligible(kickoffAt: string | null | undefined): boolean {
  if (!kickoffAt) return false;
  const kickoffTime = new Date(kickoffAt).getTime();
  const cutoffTime = new Date(rankingHistoryCutoffUtcIso).getTime();
  return Number.isFinite(kickoffTime) && kickoffTime >= cutoffTime;
}

export function formatBetHistoryScoreLine({
  home,
  away,
  homeScore,
  awayScore,
  method,
  qualifiedTeam,
  variant,
}: BetHistoryScoreLineInput): string {
  const score = `${home} ${homeScore}-${awayScore} ${away}`;

  if (method === "penalties") {
    const winner = qualifiedTeam?.trim();
    if (!winner) return `${score} (pênaltis)`;
    return variant === "result"
      ? `${score} → ${winner} venceu nos pênaltis`
      : `${score} → ${winner} nos pênaltis`;
  }

  if (method === "extra_time") {
    const winner = qualifiedTeam?.trim();
    if (variant === "result" && winner) return `${score} → ${winner} venceu na prorrogação`;
    return `${score} (prorrogação)`;
  }

  return `${score} (regulamentar)`;
}
