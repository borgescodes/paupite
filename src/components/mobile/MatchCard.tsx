import * as React from "react";
import { BiCheckCircle, BiSolidBrain, BiSolidLock, BiSolidTimeFive } from "react-icons/bi";

import { cn } from "@/lib/utils";
import { getTeamLogoUrl } from "@/lib/team-logos";
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
  saving?: boolean;
  saveMessage?: string | null;
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
        <p className="eyebrow text-brand">Paupite o placar</p>
        <p className="mt-1 text-xs text-muted-foreground">
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

function TeamLogo({ flagCode, shortName }: { flagCode: string; shortName: string }) {
  const url = getTeamLogoUrl(flagCode);
  if (url) {
    return (
      <img
        src={url}
        alt={shortName}
        className="size-8 object-contain"
        loading="lazy"
        decoding="async"
      />
    );
  }
  return <Flag code={flagCode} label={shortName} size="sm" />;
}

function TeamsRow({ data }: { data: MatchCardData }) {
  return (
    <div className="flex items-center justify-center gap-2 text-sm font-extrabold uppercase">
      <span className="w-10 text-right">{data.home.shortName}</span>
      <TeamLogo flagCode={data.home.flagCode} shortName={data.home.shortName} />
      <span className="px-1 text-xs font-semibold text-muted-foreground">×</span>
      <TeamLogo flagCode={data.away.flagCode} shortName={data.away.shortName} />
      <span className="w-10 text-left">{data.away.shortName}</span>
    </div>
  );
}

function FinalScoreRow({ data, score }: { data: MatchCardData; score: ScoreValue }) {
  return (
    <div className="flex items-center justify-center gap-4">
      <TeamLogo flagCode={data.home.flagCode} shortName={data.home.shortName} />
      <p className="text-3xl font-extrabold tabular-nums text-foreground">
        {score.home} - {score.away}
      </p>
      <TeamLogo flagCode={data.away.flagCode} shortName={data.away.shortName} />
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
    <div className="space-y-2 rounded-2xl border border-border/70 bg-muted/35 p-3">
      <p className="flex items-center gap-1.5 text-xs font-extrabold uppercase text-foreground">
        <BiSolidBrain className="size-3.5 text-brand" />
        MegaBrain
      </p>
      {forecast ? (
        <>
          <div className="flex h-2 gap-px overflow-hidden rounded-full">
            <div
              className="bg-success transition-all duration-500"
              style={{ width: `${forecast.home}%` }}
            />
            <div
              className="bg-muted-foreground/25 transition-all duration-500"
              style={{ width: `${forecast.draw}%` }}
            />
            <div
              className="bg-danger transition-all duration-500"
              style={{ width: `${forecast.away}%` }}
            />
          </div>
          <div className="flex items-center justify-between text-[11px] font-semibold text-muted-foreground">
            <span className="flex items-center gap-1">
              <span className="size-2 rounded-full bg-success" />
              {home.shortName} <strong className="ml-0.5 text-foreground">{forecast.home}%</strong>
            </span>
            <span className="flex items-center gap-1">
              <span className="size-2 rounded-full bg-muted-foreground/25" />
              <strong className="text-foreground">{forecast.draw}%</strong>
            </span>
            <span className="flex items-center gap-1">
              <span className="size-2 rounded-full bg-danger" />
              {away.shortName} <strong className="ml-0.5 text-foreground">{forecast.away}%</strong>
            </span>
          </div>
        </>
      ) : (
        <p className="text-[11px] text-muted-foreground">Ainda sem palpites suficientes</p>
      )}
    </div>
  );
}

function LockedBar({ label }: { label: string }) {
  return (
    <div className="flex min-h-11 w-full items-center justify-center gap-2 rounded-2xl bg-muted/80 px-3 text-center text-sm font-bold text-muted-foreground">
      <BiSolidLock className="size-3.5" />
      {label}
    </div>
  );
}

function MatchCard({
  data,
  onGuessChange,
  onSubmitGuess,
  saving,
  saveMessage,
  className,
}: MatchCardProps) {
  return (
    <Card
      className={cn(
        "glass-card interactive-card overflow-hidden rounded-3xl border-border/80 shadow-xl shadow-foreground/5",
        data.status === "live" && "border-live/35",
        className,
      )}
    >
      {data.status === "live" && <div className="h-1 bg-live" />}
      {data.status === "finished" && <div className="h-1 bg-success" />}
      <CardContent className="space-y-3.5 p-4 sm:p-5">
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
                  "h-11 w-full rounded-2xl",
                  !data.guess.value && "bg-brand text-brand-foreground hover:bg-brand/90",
                )}
                onClick={onSubmitGuess}
                disabled={saving}
              >
                {saving ? "Salvando..." : data.guess.saved ? "Salvar alteração" : "Enviar paupite"}
              </Button>
            ) : (
              <LockedBar label={data.paupiteClosedLabel} />
            )}
          </div>
        )}

        {data.status === "live" && data.liveScore && (
          <div className="space-y-2">
            <FinalScoreRow data={data} score={data.liveScore} />
            {data.guess.value && (
              <p className="text-center text-xs text-muted-foreground">
                Seu paupite: {data.guess.value.home} - {data.guess.value.away}
              </p>
            )}
            <LockedBar label={data.paupiteClosedLabel} />
          </div>
        )}

        {data.status === "finished" && data.finalScore && (
          <div className="space-y-2">
            <FinalScoreRow data={data} score={data.finalScore} />
            {data.guess.value && (
              <div className="rounded-2xl bg-muted/70 px-3 py-2.5 text-center text-xs text-muted-foreground">
                Você palpitou{" "}
                <strong className="text-foreground">
                  {data.guess.value.home} - {data.guess.value.away}
                </strong>
                {typeof data.guess.points === "number" && (
                  <span> · {data.guess.points} ponto(s)</span>
                )}
              </div>
            )}
          </div>
        )}
        {saveMessage && (
          <p className="flex items-center justify-center gap-1.5 text-center text-xs font-bold text-success">
            <BiCheckCircle className="size-4" />
            {saveMessage}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

export { MatchCard };
