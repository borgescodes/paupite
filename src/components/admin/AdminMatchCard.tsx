import { BiCalendar, BiEditAlt, BiMap, BiPlayCircle, BiSolidLock, BiTrophy } from "react-icons/bi";

import { matchStageLabel, matchStatusLabel } from "@/components/admin/match-labels";
import type { AdminMatch } from "@/components/admin/match-types";
import { Flag } from "@/components/mobile/Flag";
import { StatusBadge } from "@/components/mobile/StatusBadge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { parseBracketSource } from "@/lib/knockout";
import { deriveMatchTemporalStatus, isMatchFuture } from "@/lib/match-status";

export function AdminMatchCard({
  match,
  onEdit,
  onResult,
}: {
  match: AdminMatch;
  onEdit: () => void;
  onResult: () => void;
}) {
  const future = isMatchFuture(match.kickoff_at);
  const temporalStatus = deriveMatchTemporalStatus(match.status, match.kickoff_at);
  const canSetResult = !future && match.status !== "closed";
  const home =
    match.home_team?.name ?? parseBracketSource(match.bracket_source_home)?.label ?? "A definir";
  const away =
    match.away_team?.name ?? parseBracketSource(match.bracket_source_away)?.label ?? "A definir";

  return (
    <Card className="glass-card interactive-card overflow-hidden">
      <div
        className={
          temporalStatus === "finished"
            ? "h-1 bg-success"
            : temporalStatus === "live"
              ? "h-1 bg-live"
              : "h-1 bg-brand"
        }
      />
      <CardContent className="space-y-4 p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="eyebrow text-brand">{match.group_name || matchStageLabel(match.stage)}</p>
            <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
              <BiCalendar className="size-4" />
              {new Date(match.kickoff_at).toLocaleString("pt-BR", {
                dateStyle: "short",
                timeStyle: "short",
              })}
            </p>
          </div>
          <StatusBadge
            variant={
              temporalStatus === "finished"
                ? "success"
                : temporalStatus === "live"
                  ? "live"
                  : future
                    ? "brand"
                    : "warning"
            }
            pulse={temporalStatus === "live"}
          >
            {matchStatusLabel(match.status, future, temporalStatus)}
          </StatusBadge>
        </div>

        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 rounded-2xl bg-muted/55 p-3">
          <Team
            name={home}
            shortName={match.home_team?.short_name}
            countryCode={match.home_team?.country_code}
          />
          <div className="text-center">
            {temporalStatus === "scheduled" ? (
              <span className="text-sm font-extrabold text-muted-foreground">VS</span>
            ) : (
              <span className="text-2xl font-extrabold tabular-nums">
                {match.home_score} × {match.away_score}
              </span>
            )}
          </div>
          <Team
            align="right"
            name={away}
            shortName={match.away_team?.short_name}
            countryCode={match.away_team?.country_code}
          />
        </div>

        {(match.venue || match.city) && (
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <BiMap className="size-4" />
            {[match.venue, match.city].filter(Boolean).join(" · ")}
          </p>
        )}

        <div className="grid grid-cols-2 gap-2">
          <Button variant="outline" onClick={onEdit}>
            <BiEditAlt className="size-5" />
            Editar jogo
          </Button>
          <Button
            variant={canSetResult ? "default" : "secondary"}
            disabled={!canSetResult}
            onClick={onResult}
          >
            {future ? (
              <BiSolidLock className="size-4" />
            ) : temporalStatus === "live" ? (
              <BiPlayCircle className="size-5" />
            ) : (
              <BiTrophy className="size-5" />
            )}
            {future ? "Aguarda início" : "Resultado"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function Team({
  name,
  shortName,
  countryCode,
  align = "left",
}: {
  name: string;
  shortName?: string | null;
  countryCode?: string | null;
  align?: "left" | "right";
}) {
  return (
    <div className={align === "right" ? "min-w-0 text-right" : "min-w-0"}>
      {countryCode ? (
        <Flag
          code={countryCode.toLowerCase()}
          label={name}
          size="sm"
          className={align === "right" ? "ml-auto mb-1" : "mb-1"}
        />
      ) : (
        <div
          className={
            align === "right"
              ? "ml-auto mb-1 grid h-5 w-7 place-items-center rounded-md border border-dashed border-border bg-muted text-[10px] text-muted-foreground"
              : "mb-1 grid h-5 w-7 place-items-center rounded-md border border-dashed border-border bg-muted text-[10px] text-muted-foreground"
          }
        >
          ?
        </div>
      )}
      <p className="truncate text-sm font-extrabold">{shortName || name}</p>
      <p className="truncate text-[10px] text-muted-foreground">{name}</p>
    </div>
  );
}
