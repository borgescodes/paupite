import { useEffect, useState } from "react";
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
import {
  isKnockoutStage,
  qualificationMethodLabel,
  type QualificationMethod,
} from "@/lib/knockout.ts";
import { deriveMatchTemporalStatus, isMatchFuture } from "@/lib/match-status.ts";

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
    status: string;
    qualified_team_id?: string | null;
    qualification_method?: QualificationMethod | null;
  }) => void;
  onCloseMatch: () => void;
}) {
  const [homeScore, setHomeScore] = useState(0);
  const [awayScore, setAwayScore] = useState(0);
  const [status, setStatus] = useState("finished");
  const [qualifiedTeamId, setQualifiedTeamId] = useState<string | null>(null);
  const [qualificationMethod, setQualificationMethod] = useState<QualificationMethod | null>(null);
  const [closeDialogOpen, setCloseDialogOpen] = useState(false);

  useEffect(() => {
    if (!match || !open) return;
    setHomeScore(match.regulation_home_score ?? match.home_score);
    setAwayScore(match.regulation_away_score ?? match.away_score);
    setStatus(
      deriveMatchTemporalStatus(match.status, match.kickoff_at) === "live" ? "live" : "finished",
    );
    setQualifiedTeamId(match.qualified_team_id);
    setQualificationMethod(match.qualification_method);
  }, [match, open]);

  useEffect(() => {
    if (!open) setCloseDialogOpen(false);
  }, [open]);

  const future = match ? isMatchFuture(match.kickoff_at) : true;
  const knockout = isKnockoutStage(match?.stage);
  const liveResult = status === "live";
  const tied = homeScore === awayScore;
  const automaticQualifiedTeamId =
    homeScore > awayScore
      ? match?.home_team_id
      : awayScore > homeScore
        ? match?.away_team_id
        : null;
  const winnerQualificationMethodValid =
    qualificationMethod === "regulation" || qualificationMethod === "extra_time";
  const tiedQualificationMethodValid =
    qualificationMethod === "extra_time" || qualificationMethod === "penalties";
  const officialQualifiedTeamId = knockout
    ? liveResult
      ? null
      : tied
        ? qualifiedTeamId
        : automaticQualifiedTeamId
    : undefined;
  const officialQualificationMethod = knockout
    ? liveResult
      ? null
      : tied
        ? tiedQualificationMethodValid
          ? qualificationMethod
          : null
        : winnerQualificationMethodValid
          ? qualificationMethod
          : ("regulation" as QualificationMethod)
    : undefined;
  const qualifiedTeamName =
    officialQualifiedTeamId === match?.home_team_id
      ? (match?.home_team?.name ?? "Seleção A")
      : officialQualifiedTeamId === match?.away_team_id
        ? (match?.away_team?.name ?? "Seleção B")
        : "A definir";
  const knockoutTeamsDefined = Boolean(match?.home_team_id && match?.away_team_id);
  const requiresKnockoutDecision = knockout && !liveResult && tied;
  const winnerKnockoutComplete = !knockout || liveResult || tied || winnerQualificationMethodValid;
  const tiedKnockoutComplete = Boolean(
    !requiresKnockoutDecision || (qualifiedTeamId && tiedQualificationMethodValid),
  );
  const canSaveResult =
    !busy &&
    (!knockout || (knockoutTeamsDefined && winnerKnockoutComplete && tiedKnockoutComplete));
  const canCloseCurrentMatch = match?.status === "finished" && status === "finished";

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
                  : "Resultado encerrado pode liberar fechamento e atualizar confrontos futuros."}
              </div>
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
            {knockout && !knockoutTeamsDefined && (
              <p className="rounded-2xl bg-muted p-3 text-sm text-muted-foreground">
                Defina as duas seleções antes de lançar o resultado do mata-mata.
              </p>
            )}
            {knockout && knockoutTeamsDefined && !liveResult && (
              <div className="space-y-3 rounded-2xl bg-muted/45 p-3">
                <p className="text-xs font-extrabold uppercase text-muted-foreground">
                  Classificação oficial
                </p>
                {!tied ? (
                  <div className="space-y-3">
                    <p className="text-sm text-muted-foreground">
                      {qualifiedTeamName} se classifica pelo placar informado.
                    </p>
                    <div className="space-y-1.5">
                      <Label htmlFor="winner-qualification-method">Como venceu?</Label>
                      <select
                        id="winner-qualification-method"
                        className="h-11 w-full rounded-xl border border-input bg-background/65 px-3 text-sm font-bold"
                        value={winnerQualificationMethodValid ? qualificationMethod : "regulation"}
                        onChange={(event) =>
                          setQualificationMethod(event.target.value as QualificationMethod)
                        }
                      >
                        <option value="regulation">{qualificationMethodLabel("regulation")}</option>
                        <option value="extra_time">{qualificationMethodLabel("extra_time")}</option>
                      </select>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="space-y-1.5">
                      <Label htmlFor="qualified-team">Quem se classifica?</Label>
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
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="qualification-method">Como se classifica?</Label>
                      <select
                        id="qualification-method"
                        className="h-11 w-full rounded-xl border border-input bg-background/65 px-3 text-sm font-bold"
                        value={qualificationMethod ?? ""}
                        onChange={(event) =>
                          setQualificationMethod(
                            (event.target.value || null) as QualificationMethod | null,
                          )
                        }
                      >
                        <option value="">Selecione</option>
                        <option value="extra_time">{qualificationMethodLabel("extra_time")}</option>
                        <option value="penalties">{qualificationMethodLabel("penalties")}</option>
                      </select>
                    </div>
                  </>
                )}
              </div>
            )}
            <div className="space-y-1.5">
              <Label htmlFor="result-status">Situação da partida</Label>
              <select
                id="result-status"
                className="h-12 w-full rounded-2xl border border-input bg-background/65 px-3 text-sm font-bold"
                value={status}
                onChange={(event) => setStatus(event.target.value)}
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
            <Button
              className="w-full"
              disabled={!canSaveResult}
              onClick={() =>
                onSave({
                  home_score: homeScore,
                  away_score: awayScore,
                  status,
                  qualified_team_id: officialQualifiedTeamId,
                  qualification_method: officialQualificationMethod,
                })
              }
            >
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
        className="h-16 rounded-2xl text-center text-3xl font-extrabold"
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
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
