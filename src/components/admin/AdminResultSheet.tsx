import { useEffect, useMemo, useState } from "react";
import { BiCalculator, BiLockAlt, BiMinus, BiPlus, BiSave, BiTrophy } from "react-icons/bi";

import { resultStatusOptions } from "@/components/admin/match-labels.ts";
import type { AdminMatch } from "@/components/admin/match-types.ts";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog.tsx";
import { Button } from "@/components/ui/button.tsx";
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Label } from "@/components/ui/label.tsx";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group.tsx";
import {
  validateAdminMatchResult,
  type AdminResultQualificationMethod,
} from "@/lib/admin-result-validation.ts";
import { isKnockoutStage, qualificationMethodLabel } from "@/lib/knockout.ts";
import { deriveMatchTemporalStatus, isMatchFuture } from "@/lib/match-status.ts";

const decisionMethods: AdminResultQualificationMethod[] = [
  "regulation",
  "extra_time",
  "penalties",
];

export function AdminResultSheet({
  open,
  match,
  busy,
  onOpenChange,
  onSave,
  onCloseMatch,
}: {
  open: boolean;
  match: AdminMatch | null;
  busy: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (value: {
    home_score: number;
    away_score: number;
    regulation_home_score?: number | null;
    regulation_away_score?: number | null;
    status: string;
    qualified_team_id?: string | null;
    qualification_method?: AdminResultQualificationMethod | null;
  }) => void;
  onCloseMatch: () => void;
}) {
  const [homeScore, setHomeScore] = useState(0);
  const [awayScore, setAwayScore] = useState(0);
  const [regulationHomeScore, setRegulationHomeScore] = useState(0);
  const [regulationAwayScore, setRegulationAwayScore] = useState(0);
  const [status, setStatus] = useState("finished");
  const [qualifiedTeamId, setQualifiedTeamId] = useState<string | null>(null);
  const [qualificationMethod, setQualificationMethod] =
    useState<AdminResultQualificationMethod | null>(null);
  const [closeDialogOpen, setCloseDialogOpen] = useState(false);

  useEffect(() => {
    if (!match || !open) return;
    const savedMethod = match.qualification_method;
    setHomeScore(match.home_score);
    setAwayScore(match.away_score);
    setRegulationHomeScore(match.regulation_home_score ?? match.home_score);
    setRegulationAwayScore(match.regulation_away_score ?? match.away_score);
    setStatus(
      deriveMatchTemporalStatus(match.status, match.kickoff_at) === "live" ? "live" : "finished",
    );
    setQualifiedTeamId(savedMethod === "penalties" ? match.qualified_team_id : null);
    setQualificationMethod(savedMethod);
  }, [match, open]);

  useEffect(() => {
    if (!open) setCloseDialogOpen(false);
  }, [open]);

  const future = match ? isMatchFuture(match.kickoff_at) : true;
  const knockout = isKnockoutStage(match?.stage);
  const liveResult = status === "live";
  const knockoutTeamsDefined = Boolean(match?.home_team_id && match?.away_team_id);
  const automaticQualifiedTeamId =
    homeScore > awayScore
      ? match?.home_team_id
      : awayScore > homeScore
        ? match?.away_team_id
        : null;
  const effectiveQualifiedTeamId =
    qualificationMethod === "penalties" ? qualifiedTeamId : automaticQualifiedTeamId;

  const validation = useMemo(() => {
    if (!match || future) return null;
    return validateAdminMatchResult({
      knockout,
      status: liveResult ? "live" : "finished",
      homeTeamId: match.home_team_id,
      awayTeamId: match.away_team_id,
      homeScore,
      awayScore,
      regulationHomeScore:
        knockout && !liveResult && qualificationMethod !== "regulation"
          ? regulationHomeScore
          : null,
      regulationAwayScore:
        knockout && !liveResult && qualificationMethod !== "regulation"
          ? regulationAwayScore
          : null,
      qualifiedTeamId: knockout && !liveResult ? effectiveQualifiedTeamId : null,
      qualificationMethod: knockout && !liveResult ? qualificationMethod : null,
    });
  }, [
    awayScore,
    effectiveQualifiedTeamId,
    future,
    homeScore,
    knockout,
    liveResult,
    match,
    qualificationMethod,
    regulationAwayScore,
    regulationHomeScore,
  ]);

  const resultPayload = validation?.ok ? validation.value : null;
  const canSaveResult = !busy && Boolean(resultPayload) && (!knockout || knockoutTeamsDefined);
  const canCloseCurrentMatch = match?.status === "finished" && status === "finished";
  const showRegulationScore =
    knockout &&
    !liveResult &&
    (qualificationMethod === "extra_time" || qualificationMethod === "penalties");
  const showQualifiedSelector = knockout && !liveResult && qualificationMethod === "penalties";
  const showAutomaticQualified =
    knockout &&
    !liveResult &&
    (qualificationMethod === "regulation" || qualificationMethod === "extra_time");
  const scoreTitle =
    knockout && !liveResult && qualificationMethod !== "regulation"
      ? "Placar após 120 minutos"
      : "Placar final";
  const qualifiedTeamName = teamName(match, effectiveQualifiedTeamId);

  function handleMethodChange(method: AdminResultQualificationMethod) {
    setQualificationMethod(method);

    if (method === "regulation") {
      setRegulationHomeScore(homeScore);
      setRegulationAwayScore(awayScore);
      setQualifiedTeamId(null);
      return;
    }

    if (method === "extra_time") {
      setQualifiedTeamId(null);
      if (qualificationMethod !== "extra_time" && qualificationMethod !== "penalties") {
        setRegulationHomeScore(0);
        setRegulationAwayScore(0);
      }
      return;
    }

    if (qualificationMethod !== "extra_time" && qualificationMethod !== "penalties") {
      setRegulationHomeScore(0);
      setRegulationAwayScore(0);
    }
    if (
      qualifiedTeamId !== match?.home_team_id &&
      qualifiedTeamId !== match?.away_team_id
    ) {
      setQualifiedTeamId(null);
    }
  }

  function handleStatusChange(nextStatus: string) {
    setStatus(nextStatus);
    if (nextStatus === "live") {
      setQualifiedTeamId(null);
      setQualificationMethod(null);
    }
  }

  function handleSave() {
    if (!resultPayload) return;
    onSave({
      home_score: resultPayload.homeScore,
      away_score: resultPayload.awayScore,
      regulation_home_score: resultPayload.regulationHomeScore,
      regulation_away_score: resultPayload.regulationAwayScore,
      status: resultPayload.status,
      qualified_team_id: resultPayload.qualifiedTeamId,
      qualification_method: resultPayload.qualificationMethod,
    });
  }

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="mx-auto max-w-lg rounded-t-3xl">
        <DrawerHeader className="px-5 text-left">
          <DrawerTitle className="flex items-center gap-2">
            <BiTrophy className="size-5 text-warning" />
            Resultado oficial
          </DrawerTitle>
          <DrawerDescription>
            {match
              ? `${match.home_team?.name ?? "Seleção A"} × ${match.away_team?.name ?? "Seleção B"}`
              : "Selecione uma partida."}
          </DrawerDescription>
        </DrawerHeader>

        {future ? (
          <div className="mx-5 flex items-start gap-3 rounded-2xl bg-muted p-4 text-sm text-muted-foreground">
            <BiLockAlt className="mt-0.5 size-5 shrink-0" />O placar oficial fica bloqueado até o
            horário de início da partida.
          </div>
        ) : (
          <div className="space-y-5 px-5">
            {knockout && (
              <div className="rounded-2xl border border-warning/25 bg-warning/8 p-3 text-xs text-muted-foreground">
                {liveResult
                  ? "Placar em andamento salva parcial sem exigir classificado ou método."
                  : "Escolha explicitamente como a partida foi decidida antes de salvar."}
              </div>
            )}

            {knockout && knockoutTeamsDefined && !liveResult && (
              <div className="space-y-3 rounded-2xl bg-muted/45 p-3">
                <p className="text-xs font-extrabold uppercase text-muted-foreground">
                  Como a partida foi decidida?
                </p>
                <RadioGroup
                  value={qualificationMethod ?? ""}
                  onValueChange={(value) =>
                    handleMethodChange(value as AdminResultQualificationMethod)
                  }
                >
                  {decisionMethods.map((method) => (
                    <Label
                      key={method}
                      htmlFor={`decision-${method}`}
                      className="flex cursor-pointer items-center gap-3 rounded-2xl border border-border/70 bg-background/65 p-3 text-sm font-bold"
                    >
                      <RadioGroupItem id={`decision-${method}`} value={method} />
                      {qualificationMethodLabel(method)}
                    </Label>
                  ))}
                </RadioGroup>
              </div>
            )}

            <div className="space-y-2">
              <p className="text-xs font-extrabold uppercase text-muted-foreground">
                {scoreTitle}
              </p>
              {knockout && !liveResult && qualificationMethod === "penalties" && (
                <p className="text-xs text-muted-foreground">
                  Informe o placar oficial após 120 minutos. Não inclua cobranças de pênaltis.
                </p>
              )}
              <div className="grid grid-cols-[1fr_auto_1fr] items-end gap-3">
                <ScoreField
                  id="home-score"
                  label={match?.home_team?.short_name || match?.home_team?.name || "Seleção A"}
                  value={homeScore}
                  onChange={setHomeScore}
                />
                <span className="pb-3 text-xl font-extrabold">×</span>
                <ScoreField
                  id="away-score"
                  label={match?.away_team?.short_name || match?.away_team?.name || "Seleção B"}
                  value={awayScore}
                  onChange={setAwayScore}
                />
              </div>
            </div>

            {knockout && !knockoutTeamsDefined && (
              <p className="rounded-2xl bg-muted p-3 text-sm text-muted-foreground">
                Defina as duas seleções antes de lançar o resultado do mata-mata.
              </p>
            )}

            {showRegulationScore && (
              <div className="space-y-3 rounded-2xl border border-warning/25 bg-warning/8 p-3">
                <div>
                  <p className="text-xs font-extrabold uppercase text-muted-foreground">
                    Placar aos 90 minutos
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Prorrogação e pênaltis exigem empate no tempo regulamentar.
                  </p>
                </div>
                <div className="grid grid-cols-[1fr_auto_1fr] items-end gap-3">
                  <ScoreField
                    id="regulation-home-score"
                    label={match?.home_team?.short_name || match?.home_team?.name || "Seleção A"}
                    value={regulationHomeScore}
                    onChange={setRegulationHomeScore}
                  />
                  <span className="pb-3 text-xl font-extrabold">×</span>
                  <ScoreField
                    id="regulation-away-score"
                    label={match?.away_team?.short_name || match?.away_team?.name || "Seleção B"}
                    value={regulationAwayScore}
                    onChange={setRegulationAwayScore}
                  />
                </div>
              </div>
            )}

            {showAutomaticQualified && (
              <div className="rounded-2xl bg-muted/45 p-3">
                <p className="text-xs font-extrabold uppercase text-muted-foreground">
                  Classificado calculado
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {qualifiedTeamName} se classifica pelo placar informado.
                </p>
              </div>
            )}

            {showQualifiedSelector && (
              <div className="space-y-1.5 rounded-2xl bg-muted/45 p-3">
                <Label htmlFor="qualified-team">Seleção classificada</Label>
                <select
                  id="qualified-team"
                  className="h-11 w-full rounded-xl border border-input bg-background/65 px-3 text-sm font-bold"
                  value={qualifiedTeamId ?? ""}
                  onChange={(event) => setQualifiedTeamId(event.target.value || null)}
                >
                  <option value="">Selecione</option>
                  <option value={match?.home_team_id ?? ""}>
                    {match?.home_team?.name ?? "Seleção A"}
                  </option>
                  <option value={match?.away_team_id ?? ""}>
                    {match?.away_team?.name ?? "Seleção B"}
                  </option>
                </select>
                <p className="text-xs text-muted-foreground">
                  Use este campo apenas para indicar quem avançou na disputa de pênaltis.
                </p>
              </div>
            )}

            {validation && !validation.ok && (
              <p className="rounded-2xl bg-destructive/10 p-3 text-sm font-bold text-destructive">
                {validation.error}
              </p>
            )}

            <div className="space-y-1.5">
              <Label htmlFor="result-status">Situação da partida</Label>
              <select
                id="result-status"
                className="h-12 w-full rounded-2xl border border-input bg-background/65 px-3 text-sm font-bold"
                value={status}
                onChange={(event) => handleStatusChange(event.target.value)}
              >
                {resultStatusOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
              <p className="text-xs text-muted-foreground">
                {liveResult
                  ? "Salva placar parcial sem calcular pontos."
                  : "Após salvar como encerrado, use “Fechar partida e recalcular”."}
              </p>
            </div>

            <Button className="w-full" disabled={!canSaveResult} onClick={handleSave}>
              <BiSave className="size-5" />
              Salvar resultado
            </Button>

            {match?.status === "live" && status === "finished" && (
              <p className="rounded-2xl bg-muted p-3 text-xs text-muted-foreground">
                Salve o resultado como encerrado para liberar fechamento e recálculo.
              </p>
            )}

            {canCloseCurrentMatch && (
              <div className="rounded-2xl border border-warning/25 bg-warning/8 p-4">
                <p className="font-extrabold">Fechar e recalcular</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Esta ação fecha a partida e recalcula pontos. Use só após conferir placar final.
                </p>
                <Button
                  className="mt-3 w-full"
                  variant="outline"
                  disabled={busy}
                  onClick={() => setCloseDialogOpen(true)}
                >
                  <BiCalculator className="size-5" />
                  Fechar partida e recalcular
                </Button>
              </div>
            )}
          </div>
        )}

        <AlertDialog open={closeDialogOpen} onOpenChange={setCloseDialogOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Fechar partida e recalcular?</AlertDialogTitle>
              <AlertDialogDescription>
                Confirme só se o placar final já foi salvo. A partida vira “Pontuação calculada” e
                os pontos dos palpites serão recalculados.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={busy}>Cancelar</AlertDialogCancel>
              <AlertDialogAction
                disabled={busy}
                onClick={(event) => {
                  event.preventDefault();
                  setCloseDialogOpen(false);
                  onCloseMatch();
                }}
              >
                Confirmar fechamento
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        <DrawerFooter className="px-5">
          <DrawerClose asChild>
            <Button variant="outline" disabled={busy}>
              Voltar
            </Button>
          </DrawerClose>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
}

function ScoreField({
  id,
  label,
  value,
  onChange,
}: {
  id: string;
  label: string;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <div className="space-y-1.5 text-center">
      <Label htmlFor={id} className="block truncate">
        {label}
      </Label>
      <Input
        id={id}
        type="number"
        min={0}
        max={99}
        step={1}
        className="h-16 rounded-2xl text-center text-3xl font-extrabold"
        value={value}
        onChange={(event) => onChange(event.target.value === "" ? 0 : Number(event.target.value))}
      />
      <div className="grid grid-cols-2 gap-2">
        <Button
          type="button"
          variant="outline"
          className="h-10 rounded-2xl"
          onClick={() => onChange(Math.max(0, value - 1))}
        >
          <BiMinus className="size-5" />
        </Button>
        <Button
          type="button"
          variant="outline"
          className="h-10 rounded-2xl"
          onClick={() => onChange(Math.min(99, value + 1))}
        >
          <BiPlus className="size-5" />
        </Button>
      </div>
    </div>
  );
}

function teamName(match: AdminMatch | null, teamId: string | null | undefined) {
  if (teamId === match?.home_team_id) return match.home_team?.name ?? "Seleção A";
  if (teamId === match?.away_team_id) return match.away_team?.name ?? "Seleção B";
  return "A definir";
}
