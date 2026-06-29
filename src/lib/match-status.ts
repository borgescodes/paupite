import type { MatchTemporalStatus } from "@/components/mobile/types";

export function deriveMatchTemporalStatus(
  status: string | null | undefined,
  kickoffAt: string | Date,
): MatchTemporalStatus {
  if (status === "finished" || status === "closed" || status === "scored") return "finished";
  if (status === "live") return "live";

  const kickoffTime = new Date(kickoffAt).getTime();
  if (Number.isFinite(kickoffTime) && kickoffTime <= Date.now()) return "live";

  return "scheduled";
}

export function isMatchFuture(kickoffAt: string | Date) {
  const kickoffTime = new Date(kickoffAt).getTime();
  return Number.isFinite(kickoffTime) ? kickoffTime > Date.now() : true;
}
