import { useEffect, useState } from "react";
import { BiCalculator, BiLockAlt, BiMinus, BiPlus, BiSave, BiTrophy } from "react-icons/bi";

import { resultStatusOptions } from "@/components/admin/match-labels";
import type { AdminMatch } from "@/components/admin/match-types";
import { Button } from "@/components/ui/button";
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

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
  onSave: (value: { home_score: number; away_score: number; status: string }) => void;
  onCloseMatch: () => void;
}) {
  const [homeScore, setHomeScore] = useState(0);
  const [awayScore, setAwayScore] = useState(0);
  const [status, setStatus] = useState("finished");

  useEffect(() => {
    if (!match || !open) return;
    setHomeScore(match.home_score);
    setAwayScore(match.away_score);
    setStatus(match.status === "live" ? "live" : "finished");
  }, [match, open]);

  const future = match ? new Date(match.kickoff_at) > new Date() : true;

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
                Use “Pontuação calculada” após salvar o resultado e fechar a partida.
              </p>
            </div>
            <Button
              className="w-full"
              disabled={busy}
              onClick={() => onSave({ home_score: homeScore, away_score: awayScore, status })}
            >
              <BiSave className="size-5" />
              Salvar resultado
            </Button>
            {match?.status !== "scheduled" && match?.status !== "closed" && (
              <div className="rounded-2xl border border-warning/25 bg-warning/8 p-4">
                <p className="font-extrabold">Fechar e recalcular</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Esta ação encerra a partida e atualiza os pontos de todos os palpites.
                </p>
                <Button
                  className="mt-3 w-full"
                  variant="outline"
                  disabled={busy}
                  onClick={() => {
                    const confirmed = window.confirm(
                      "Fechar esta partida e recalcular a pontuação do bolão?",
                    );
                    if (confirmed) onCloseMatch();
                  }}
                >
                  <BiCalculator className="size-5" />
                  Fechar partida e recalcular
                </Button>
              </div>
            )}
          </div>
        )}

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
