import type { MatchTemporalStatus } from "@/components/mobile/types";

export function deriveMatchTemporalStatus(
  status: string | null | undefined,
  kickoffAt: string | Date,
): MatchTemporalStatus {
  if (status === "finished" || status === "closed" || status === "scored") return "finished";

  const kickoffTime = new Date(kickoffAt).getTime();
  if (Number.isFinite(kickoffTime)) {
    if (kickoffTime > Date.now()) return "scheduled";
    if (status === "live" || kickoffTime <= Date.now()) return "live";
  }

  if (status === "live") return "live";

  return "scheduled";
}

export function isMatchFuture(kickoffAt: string | Date) {
  const kickoffTime = new Date(kickoffAt).getTime();
  return Number.isFinite(kickoffTime) ? kickoffTime > Date.now() : true;
}
