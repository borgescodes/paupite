import * as React from "react";
import {
  BiCheckCircle,
  BiEditAlt,
  BiSolidBrain,
  BiSolidLock,
  BiSolidTimeFive,
} from "react-icons/bi";

import { cn } from "@/lib/utils";
import { getTeamLogoUrl } from "@/lib/team-logos";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Flag } from "@/components/mobile/Flag";
import { ScoreStepper } from "@/components/mobile/ScoreStepper";
import { StatusBadge } from "@/components/mobile/StatusBadge";
import type {
  MatchCardData,
  MegaBrainForecast,
  PredictionValue,
  ScoreValue,
  TeamInfo,
} from "@/components/mobile/types";
import {
  deriveKnockoutPredictionFields,
  qualificationMethodLabel,
  type QualificationMethod,
} from "@/lib/knockout";

export interface MatchCardProps {
  data: MatchCardData;
  onGuessChange?: (value: PredictionValue) => void;
  onSubmitGuess?: () => void;
  onEditGuess?: () => void;
  editing?: boolean;
  saving?: boolean;
  saveMessage?: string | null;
  className?: string;
}

function MatchContextRow({ data }: { data: MatchCardData }) {
  return (
    <div className="flex min-h-7 items-center justify-between gap-2">
      <p className="eyebrow text-brand leading-none">Paupite o placar</p>
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
        <StatusBadge variant="warning" className="shrink-0">
          Aguardando pontuação
        </StatusBadge>
      )}
      {data.status === "scored" && (
        <StatusBadge variant="success" className="shrink-0">
          Pontuada
        </StatusBadge>
      )}
      {data.status === "canceled" && (
        <StatusBadge variant="neutral" className="shrink-0">
          Cancelada
        </StatusBadge>
      )}
    </div>
  );
}

function MatchStatusHint({ data, hasSavedGuess }: { data: MatchCardData; hasSavedGuess: boolean }) {
  const hint = predictionStatusHint(data, hasSavedGuess);
  if (!hint) return null;

  return (
    <p className="rounded-2xl bg-muted/45 px-3 py-2 text-center text-xs font-semibold leading-relaxed text-muted-foreground">
      {hint}
    </p>
  );
}

function TeamLogo({ team }: { team: TeamInfo }) {
  if (team.flagCode === "un") {
    return (
      <div
        className="grid size-8 place-items-center rounded-full border border-dashed border-border bg-muted text-[10px] font-extrabold text-muted-foreground"
        aria-label={team.name ?? team.shortName}
      >
        ?
      </div>
    );
  }
  const url = getTeamLogoUrl(team.flagCode);
  if (url) {
    return (
      <img
        src={url}
        alt={team.name ?? team.shortName}
        className="size-8 object-contain"
        loading="lazy"
        decoding="async"
      />
    );
  }
  return <Flag code={team.flagCode} label={team.name ?? team.shortName} size="sm" />;
}

function TeamsRow({ data }: { data: MatchCardData }) {
  return (
    <div className="flex items-center justify-center gap-2 text-sm font-extrabold uppercase">
      <TeamName team={data.home} align="right" />
      <TeamLogo team={data.home} />
      <span className="px-1 text-xs font-semibold text-muted-foreground">×</span>
      <TeamLogo team={data.away} />
      <TeamName team={data.away} />
    </div>
  );
}

function FinalScoreRow({ data, score }: { data: MatchCardData; score: ScoreValue }) {
  return (
    <div className="flex items-center justify-center gap-4">
      <TeamLogo team={data.home} />
      <p className="text-3xl font-extrabold tabular-nums text-foreground">
        {score.home} - {score.away}
      </p>
      <TeamLogo team={data.away} />
    </div>
  );
}

function KnockoutOfficialDecision({ data }: { data: MatchCardData }) {
  if (!data.knockout?.qualifiedTeamId || !data.knockout.qualificationMethod) return null;

  return (
    <div className="mx-auto flex w-fit items-center gap-1.5 rounded-full bg-success/10 px-3 py-1.5 text-xs font-extrabold text-success">
      <span>{teamLabelById(data, data.knockout.qualifiedTeamId)}</span>
      <span className="text-success/60">·</span>
      <span>{shortQualificationMethodLabel(data.knockout.qualificationMethod)}</span>
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
  if (!forecast) return null;

  return (
    <div className="space-y-2 rounded-2xl border border-border/70 bg-muted/35 p-3">
      <p className="flex items-center gap-1.5 text-xs font-extrabold uppercase text-foreground">
        <BiSolidBrain className="size-3.5 text-brand" />
        MegaBrain
      </p>
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

function GuessSummary({
  data,
  tone = "neutral",
}: {
  data: MatchCardData;
  tone?: "success" | "neutral";
}) {
  if (!data.guess.value) return null;

  return (
    <div
      className={cn(
        "rounded-2xl px-3 py-2.5 text-xs leading-relaxed",
        tone === "success"
          ? "bg-success/10 text-muted-foreground"
          : "bg-muted/70 text-muted-foreground",
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <StatusBadge variant={tone === "success" ? "success" : "neutral"}>
          <BiCheckCircle className="size-3" />
          Palpite enviado
        </StatusBadge>
        <span>
          <ScoreText score={data.guess.value} />
          {data.knockout && data.guess.value.qualifiedTeamId && (
            <span>
              {" "}
              - {teamLabelById(data, data.guess.value.qualifiedTeamId)} -{" "}
              {qualificationMethodLabel(data.guess.value.qualificationMethod)}
            </span>
          )}
        </span>
      </div>
    </div>
  );
}

function ScoreText({ score }: { score: ScoreValue }) {
  return (
    <strong className="text-foreground">
      {score.home} - {score.away}
    </strong>
  );
}

function TeamName({ team, align = "left" }: { team: TeamInfo; align?: "left" | "right" }) {
  const label = team.placeholder ? (team.sourceLabel ?? "A definir") : team.shortName;
  return (
    <span
      className={cn(
        "w-20 truncate text-xs sm:w-24",
        team.placeholder && "normal-case text-muted-foreground",
        align === "right" ? "text-right" : "text-left",
      )}
      title={team.name ?? label}
    >
      {label}
    </span>
  );
}

function KnockoutPredictionFields({
  data,
  value,
  disabled,
  onChange,
}: {
  data: MatchCardData;
  value: PredictionValue;
  disabled?: boolean;
  onChange?: (value: PredictionValue) => void;
}) {
  if (!data.knockout) return null;

  const derived = deriveKnockoutPredictionFields({
    homeScore: value.home,
    awayScore: value.away,
    homeTeamId: data.home.id,
    awayTeamId: data.away.id,
    qualifiedTeamId: value.qualifiedTeamId,
    qualificationMethod: value.qualificationMethod,
  });
  const tied = value.home === value.away;
  const qualifiedTeamName =
    derived.qualifiedTeamId === data.home.id
      ? (data.home.name ?? data.home.shortName)
      : derived.qualifiedTeamId === data.away.id
        ? (data.away.name ?? data.away.shortName)
        : "A definir";

  if (!tied) {
    return (
      <div className="space-y-3 rounded-2xl bg-brand/8 p-3 text-xs text-muted-foreground">
        <div>
          <p className="font-bold text-foreground">Classificado definido pelo placar</p>
          <p className="mt-1">
            {qualifiedTeamName} se classifica. Falta apenas escolher se a vitória veio no tempo
            normal ou na prorrogação.
          </p>
        </div>

        <div className="space-y-2">
          <p className="text-xs font-extrabold uppercase text-muted-foreground">Como venceu?</p>
          <div className="grid grid-cols-2 gap-2">
            {(["regulation", "extra_time"] as QualificationMethod[]).map((method) => (
              <ChoiceButton
                key={method}
                active={value.qualificationMethod === method}
                disabled={disabled}
                onClick={() =>
                  onChange?.({
                    ...value,
                    qualifiedTeamId: null,
                    qualificationMethod: method,
                  })
                }
              >
                {qualificationMethodLabel(method)}
              </ChoiceButton>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3 rounded-2xl bg-background/45 p-3">
      <div>
        <p className="text-xs font-extrabold uppercase text-muted-foreground">
          Quem se classifica nos pênaltis?
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          Como o placar ficou empatado, escolha quem avança nos pênaltis.
        </p>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <ChoiceButton
          active={value.qualifiedTeamId === data.home.id}
          disabled={disabled}
          onClick={() =>
            onChange?.({
              ...value,
              qualifiedTeamId: data.home.id,
              qualificationMethod: "penalties",
            })
          }
        >
          {data.home.name ?? data.home.shortName}
        </ChoiceButton>
        <ChoiceButton
          active={value.qualifiedTeamId === data.away.id}
          disabled={disabled}
          onClick={() =>
            onChange?.({
              ...value,
              qualifiedTeamId: data.away.id,
              qualificationMethod: "penalties",
            })
          }
        >
          {data.away.name ?? data.away.shortName}
        </ChoiceButton>
      </div>
    </div>
  );
}

function ChoiceButton({
  active,
  disabled,
  onClick,
  children,
}: {
  active: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <Button
      type="button"
      variant={active ? "default" : "outline"}
      size="sm"
      disabled={disabled}
      className={cn("h-auto min-h-10 whitespace-normal rounded-2xl text-xs", active && "bg-brand")}
      onClick={onClick}
    >
      {children}
    </Button>
  );
}

function normalizeKnockoutDraft(value: PredictionValue, data: MatchCardData) {
  if (!data.knockout) return value;

  if (value.home === value.away) {
    const validQualifiedTeamId = [data.home.id, data.away.id].includes(value.qualifiedTeamId)
      ? value.qualifiedTeamId
      : null;

    return {
      ...value,
      qualifiedTeamId: validQualifiedTeamId,
      qualificationMethod: validQualifiedTeamId ? ("penalties" as const) : null,
    };
  }

  return {
    ...value,
    qualifiedTeamId: null,
    qualificationMethod:
      value.qualificationMethod === "regulation" || value.qualificationMethod === "extra_time"
        ? value.qualificationMethod
        : null,
  };
}

function MatchCard({
  data,
  onGuessChange,
  onSubmitGuess,
  onEditGuess,
  editing,
  saving,
  saveMessage,
  className,
}: MatchCardProps) {
  const hasSavedGuess = Boolean(data.guess.saved && data.guess.value);
  const showEditor = data.paupiteOpen && (!hasSavedGuess || editing);
  const currentGuess = data.guess.value ?? { home: 0, away: 0 };
  const hasTeamMultiplier = Boolean(data.knockout && data.knockout.teamMultiplier > 1);
  const lockedLabel = predictionLockedLabel(data, hasSavedGuess);

  return (
    <Card
      className={cn(
        "glass-card interactive-card overflow-hidden rounded-3xl border-border/80 shadow-xl shadow-foreground/5",
        data.status === "live" && "border-live/35",
        data.status === "canceled" && "opacity-85",
        hasTeamMultiplier &&
          "border-warning/55 bg-gradient-to-br from-warning/10 via-surface to-brand/8 shadow-warning/15 ring-1 ring-warning/20",
        className,
      )}
    >
      {data.status === "live" && <div className="h-1 bg-live" />}
      {(data.status === "finished" || data.status === "scored") && (
        <div className="h-1 bg-success" />
      )}
      <CardContent className="space-y-3.5 p-4 sm:p-5">
        <MatchContextRow data={data} />

        {data.status === "scheduled" && (
          <div className="space-y-2">
            {data.knockout && (
              <div
                className={cn(
                  "flex flex-wrap items-center justify-center gap-2 rounded-2xl bg-muted/45 px-3 py-2 text-[11px] font-bold text-muted-foreground",
                  hasTeamMultiplier && "border border-warning/30 bg-warning/12 text-foreground",
                )}
              >
                <span>Peso x{data.knockout.phaseWeight}</span>
                {data.knockout.teamMultiplier > 1 && (
                  <>
                    <span>·</span>
                    <span>Multiplicador x{data.knockout.teamMultiplier}</span>
                  </>
                )}
                <span>·</span>
                <span>Até {data.knockout.maxPoints} pts</span>
              </div>
            )}
            {(!showEditor || !data.paupiteOpen) && <TeamsRow data={data} />}
            {hasSavedGuess && !showEditor && data.guess.value && (
              <div className="flex items-center justify-between gap-2 rounded-2xl bg-success/10 px-3 py-2 text-xs">
                <StatusBadge variant="success">
                  <BiCheckCircle className="size-3" />
                  Palpite enviado
                </StatusBadge>
                <span className="text-muted-foreground">
                  Seu palpite: <ScoreText score={data.guess.value} />
                  {data.knockout && data.guess.value.qualifiedTeamId && (
                    <span>
                      {" "}
                      · {teamLabelById(data, data.guess.value.qualifiedTeamId)} ·{" "}
                      {qualificationMethodLabel(data.guess.value.qualificationMethod)}
                    </span>
                  )}
                </span>
              </div>
            )}
            <MatchStatusHint data={data} hasSavedGuess={hasSavedGuess} />
            {showEditor && (
              <div className={cn(!data.paupiteOpen && "opacity-60")}>
                {data.knockout && (
                  <p className="mb-2 text-center text-xs font-bold text-muted-foreground">
                    Placar final antes dos pênaltis
                  </p>
                )}
                <ScoreStepper
                  home={data.home}
                  away={data.away}
                  value={currentGuess}
                  onChange={(next) =>
                    onGuessChange?.(normalizeKnockoutDraft({ ...currentGuess, ...next }, data))
                  }
                  disabled={!data.paupiteOpen}
                />
                {data.knockout && (
                  <div className="mt-2">
                    <KnockoutPredictionFields
                      data={data}
                      value={currentGuess}
                      disabled={!data.paupiteOpen}
                      onChange={onGuessChange}
                    />
                  </div>
                )}
              </div>
            )}
            {data.paupiteOpen && (
              <MegaBrainBlock forecast={data.megaBrain} home={data.home} away={data.away} />
            )}
            {data.paupiteOpen ? (
              showEditor ? (
                <Button
                  className="h-11 w-full rounded-2xl bg-brand text-brand-foreground hover:bg-brand/90"
                  onClick={onSubmitGuess}
                  disabled={saving}
                  aria-busy={saving}
                >
                  {saving
                    ? "Salvando palpite..."
                    : hasSavedGuess
                      ? "Salvar palpite"
                      : "Fazer palpite"}
                </Button>
              ) : (
                <Button
                  variant="outline"
                  className="h-11 w-full rounded-2xl border-brand/35 bg-brand/10 text-brand hover:bg-brand/15 hover:text-brand"
                  onClick={onEditGuess}
                  disabled={saving}
                >
                  <BiEditAlt className="size-4" />
                  Editar palpite
                </Button>
              )
            ) : (
              <LockedBar label={lockedLabel} />
            )}
          </div>
        )}

        {data.status === "live" && data.liveScore && (
          <div className="space-y-2">
            <FinalScoreRow data={data} score={data.liveScore} />
            {data.guess.value && (
              <p className="text-center text-xs text-muted-foreground">
                Seu palpite: <ScoreText score={data.guess.value} />
                {data.knockout && data.guess.value.qualifiedTeamId && (
                  <span>
                    {" "}
                    · {teamLabelById(data, data.guess.value.qualifiedTeamId)} ·{" "}
                    {qualificationMethodLabel(data.guess.value.qualificationMethod)}
                  </span>
                )}
              </p>
            )}
            <MatchStatusHint data={data} hasSavedGuess={hasSavedGuess} />
            <LockedBar label={lockedLabel} />
          </div>
        )}

        {data.status === "canceled" && (
          <div className="space-y-2">
            <TeamsRow data={data} />
            <GuessSummary data={data} />
            <MatchStatusHint data={data} hasSavedGuess={hasSavedGuess} />
            <LockedBar label={lockedLabel} />
          </div>
        )}

        {(data.status === "finished" || data.status === "scored") && data.finalScore && (
          <div className="space-y-3">
            <p className="eyebrow text-center text-muted-foreground">Resultado oficial</p>
            <FinalScoreRow data={data} score={data.finalScore} />
            <KnockoutOfficialDecision data={data} />
            {data.guess.value ? (
              <div className="rounded-2xl bg-muted/70 px-3 py-2.5 text-center text-xs text-muted-foreground">
                Seu palpite: <ScoreText score={data.guess.value} />
                {data.knockout && data.guess.value.qualifiedTeamId && (
                  <span>
                    {" "}
                    · {teamLabelById(data, data.guess.value.qualifiedTeamId)} ·{" "}
                    {qualificationMethodLabel(data.guess.value.qualificationMethod)}
                  </span>
                )}
                {data.status === "scored" && typeof data.guess.points === "number" && (
                  <span> · {data.guess.points} pts nesta partida</span>
                )}
                {data.status === "finished" && <span> · Aguardando pontuação</span>}
              </div>
            ) : (
              <div className="rounded-2xl bg-muted/70 px-3 py-2.5 text-center text-xs font-bold text-muted-foreground">
                Você não palpitou
              </div>
            )}
            <MatchStatusHint data={data} hasSavedGuess={hasSavedGuess} />
            <MegaBrainBlock forecast={data.megaBrain} home={data.home} away={data.away} />
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

function shortQualificationMethodLabel(method: QualificationMethod) {
  const labels: Record<QualificationMethod, string> = {
    regulation: "Regulamentar",
    extra_time: "Prorrogação",
    penalties: "Pênaltis",
  };
  return labels[method];
}

function teamLabelById(data: MatchCardData, teamId: string) {
  if (teamId === data.home.id) return data.home.name ?? data.home.shortName;
  if (teamId === data.away.id) return data.away.name ?? data.away.shortName;
  return "A definir";
}

function predictionStatusHint(data: MatchCardData, hasSavedGuess: boolean) {
  if (data.status === "scheduled" && data.paupiteOpen) {
    return hasSavedGuess
      ? "Seu palpite está salvo. Você ainda pode editar antes do início."
      : "Escolha o placar antes do início da partida.";
  }
  if (data.status === "live") {
    return hasSavedGuess
      ? "Jogo em andamento. Seu palpite está bloqueado para edição."
      : "Jogo em andamento. O prazo para palpitar já terminou.";
  }
  if (data.status === "finished") {
    return "Resultado lançado. A pontuação ainda será calculada.";
  }
  if (data.status === "scored") {
    return "Pontuação calculada para esta partida.";
  }
  if (data.status === "canceled") {
    return "Partida cancelada. Palpites não ficam disponíveis.";
  }
  return null;
}

function predictionLockedLabel(data: MatchCardData, hasSavedGuess: boolean) {
  if (data.teamsDefined === false) return "Palpites abrem quando o confronto for definido.";
  if (data.status === "live") {
    return hasSavedGuess ? "Edição encerrada: jogo em andamento" : "Prazo encerrado";
  }
  if (data.status === "finished") return "Aguardando pontuação";
  if (data.status === "scored") return "Partida pontuada";
  if (data.status === "canceled") return "Partida cancelada";
  return "Palpite bloqueado";
}

export { MatchCard };
