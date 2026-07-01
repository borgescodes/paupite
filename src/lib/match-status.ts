import type { MatchTemporalStatus, PlayerMatchStatus } from "@/components/mobile/types";

const OPEN_FOR_PREDICTION_STATUSES = new Set(["scheduled", "open"]);
const LOCKED_OR_RUNNING_STATUSES = new Set(["locked", "live"]);
const FINISHED_STATUSES = new Set(["finished", "closed", "scored"]);

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

export function derivePlayerMatchStatus(
  status: string | null | undefined,
  kickoffAt: string | Date,
): PlayerMatchStatus {
  if (status === "canceled") return "canceled";
  if (status === "closed" || status === "scored") return "scored";
  if (status === "finished") return "finished";
  if (status === "live") return "live";

  const kickoffTime = new Date(kickoffAt).getTime();
  if (!Number.isFinite(kickoffTime)) return "scheduled";
  if (kickoffTime > Date.now()) return "scheduled";

  if (
    OPEN_FOR_PREDICTION_STATUSES.has(status ?? "") ||
    LOCKED_OR_RUNNING_STATUSES.has(status ?? "") ||
    !FINISHED_STATUSES.has(status ?? "")
  ) {
    return "live";
  }

  return "scheduled";
}

export function isMatchOpenForPrediction(
  status: string | null | undefined,
  kickoffAt: string | Date,
) {
  if (!OPEN_FOR_PREDICTION_STATUSES.has(status ?? "")) return false;
  return isMatchFuture(kickoffAt);
}

export function isMatchFuture(kickoffAt: string | Date) {
  const kickoffTime = new Date(kickoffAt).getTime();
  return Number.isFinite(kickoffTime) ? kickoffTime > Date.now() : true;
}
