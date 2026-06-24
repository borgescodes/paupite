import * as React from "react";
import { BiSolidBrain, BiSolidLock, BiSolidTimeFive } from "react-icons/bi";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Flag } from "@/components/mobile/Flag";
import { ScoreStepper } from "@/components/mobile/ScoreStepper";
import { StatusBadge } from "@/components/mobile/StatusBadge";
import type { MatchCardData, MegaBrainForecast, ScoreValue } from "@/components/mobile/types";

export interface MatchCardProps {
  data: MatchCardData;
  onGuessChange?: (value: ScoreValue) => void;
  onSubmitGuess?: () => void;
  className?: string;
}

function MatchContextRow({ data }: { data: MatchCardData }) {
  const time = new Date(data.kickoffAt).toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <div className="flex items-start justify-between gap-2">
      <div>
        <p className="text-sm font-extrabold uppercase leading-tight">Paupite o placar</p>
        <p className="text-xs text-muted-foreground">
          {data.group} · {data.venue} · {time}
        </p>
      </div>
      {data.status === "scheduled" && data.paupiteOpen && data.paupiteClosesAtLabel && (
        <StatusBadge variant="brand" className="shrink-0">
          <BiSolidTimeFive className="size-3" />
          Fecha às {data.paupiteClosesAtLabel}
        </StatusBadge>
      )}
      {data.status === "scheduled" && !data.paupiteOpen && (
        <StatusBadge variant="neutral" className="shrink-0">
          <BiSolidLock className="size-3" />
          Encerrados
        </StatusBadge>
      )}
      {data.status === "live" && (
        <StatusBadge variant="live" pulse className="shrink-0">
          Em andamento
        </StatusBadge>
      )}
      {data.status === "finished" && (
        <StatusBadge variant="neutral" className="shrink-0">
          Encerrada
        </StatusBadge>
      )}
    </div>
  );
}

function TeamsRow({ data }: { data: MatchCardData }) {
  return (
    <div className="flex items-center justify-center gap-2.5 text-sm font-extrabold uppercase">
      <Flag code={data.home.flagCode} label={data.home.shortName} size="sm" />
      {data.home.shortName}
      <span className="text-xs font-semibold text-muted-foreground">v/s</span>
      {data.away.shortName}
      <Flag code={data.away.flagCode} label={data.away.shortName} size="sm" />
    </div>
  );
}

function FinalScoreRow({ data, score }: { data: MatchCardData; score: ScoreValue }) {
  return (
    <div className="flex items-center justify-center gap-4">
      <Flag code={data.home.flagCode} label={data.home.shortName} size="sm" />
      <p className="text-3xl font-extrabold tabular-nums text-foreground">
        {score.home} - {score.away}
      </p>
      <Flag code={data.away.flagCode} label={data.away.shortName} size="sm" />
    </div>
  );
}

function MegaBrainBlock({
  forecast,
  home,
  away,
}: {
  forecast?: MegaBrainForecast;
  home: MatchCardData["home"];
  away: MatchCardData["away"];
}) {
  return (
    <div className="space-y-2 rounded-md border border-border p-2.5">
      <p className="flex items-center gap-1.5 text-xs font-extrabold uppercase text-foreground">
        <BiSolidBrain className="size-3.5 text-brand" />
        MegaBrain diz
      </p>
      {forecast ? (
        <>
          <div className="flex h-1.5 overflow-hidden rounded-full">
            <div className="bg-success" style={{ width: `${forecast.home}%` }} />
            <div className="bg-muted-foreground/30" style={{ width: `${forecast.draw}%` }} />
            <div className="bg-danger" style={{ width: `${forecast.away}%` }} />
          </div>
          <div className="flex items-center justify-between text-[11px] font-medium text-muted-foreground">
            <span>
              {home.shortName} <strong className="text-foreground">{forecast.home}%</strong>
            </span>
            <span>
              Empate <strong className="text-foreground">{forecast.draw}%</strong>
            </span>
            <span>
              {away.shortName} <strong className="text-foreground">{forecast.away}%</strong>
            </span>
          </div>
        </>
      ) : (
        <p className="text-[11px] text-muted-foreground">MegaBrain aguardando paupites</p>
      )}
    </div>
  );
}

function LockedBar({ label }: { label: string }) {
  return (
    <div className="flex h-11 w-full items-center justify-center gap-1.5 rounded-md bg-muted text-sm font-extrabold text-muted-foreground">
      <BiSolidLock className="size-3.5" />
      {label}
    </div>
  );
}

function MatchCard({ data, onGuessChange, onSubmitGuess, className }: MatchCardProps) {
  return (
    <Card className={cn("rounded-lg border-border shadow-none", className)}>
      <CardContent className="space-y-2.5 p-3.5">
        <MatchContextRow data={data} />

        {data.status === "scheduled" && (
          <div className="space-y-2">
            <div className={cn(!data.paupiteOpen && "opacity-60")}>
              <ScoreStepper
                home={data.home}
                away={data.away}
                value={data.guess.value ?? { home: 0, away: 0 }}
                onChange={onGuessChange}
                disabled={!data.paupiteOpen}
              />
            </div>
            <MegaBrainBlock forecast={data.megaBrain} home={data.home} away={data.away} />
            {data.paupiteOpen ? (
              <Button
                variant={data.guess.value ? "secondary" : "default"}
                className={cn(
                  "h-11 w-full rounded-md shadow-none",
                  !data.guess.value && "bg-brand text-brand-foreground hover:bg-brand/90",
                )}
                onClick={onSubmitGuess}
              >
                {data.guess.value ? "Editar paupite" : "Enviar paupite"}
              </Button>
            ) : (
              <LockedBar label={data.paupiteClosedLabel} />
            )}
          </div>
        )}

        {data.status === "live" && data.liveScore && (
          <div className="space-y-2">
            <FinalScoreRow data={data} score={data.liveScore} />
            <LockedBar label={data.paupiteClosedLabel} />
          </div>
        )}

        {data.status === "finished" && data.finalScore && (
          <FinalScoreRow data={data} score={data.finalScore} />
        )}
      </CardContent>
    </Card>
  );
}

export { MatchCard };
