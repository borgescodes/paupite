import { useEffect, useState } from "react";
import { BiCalculator, BiEditAlt, BiMinus, BiPlus, BiTrash } from "react-icons/bi";

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

const statusOptions = [
  { value: "scheduled", label: "Agendada" },
  { value: "open", label: "Aberta" },
  { value: "locked", label: "Bloqueada" },
  { value: "live", label: "Em andamento" },
  { value: "closed", label: "Pontuação calculada" },
  { value: "scored", label: "Pontuada" },
  { value: "canceled", label: "Cancelada" },
] as const;

export function AdminMatchActionsSheet({
  open,
  match,
  busy,
  onOpenChange,
  onCorrectScore,
  onRecalculate,
  onSetStatus,
  onSoftDelete,
}: {
  open: boolean;
  match: AdminMatch | null;
  busy: boolean;
  onOpenChange: (open: boolean) => void;
  onCorrectScore: (value: { home_score: number; away_score: number }) => void;
  onRecalculate: () => void;
  onSetStatus: (status: string) => void;
  onSoftDelete: () => void;
}) {
  const [homeScore, setHomeScore] = useState(0);
  const [awayScore, setAwayScore] = useState(0);
  const [status, setStatus] = useState("scheduled");
  const future = match ? new Date(match.kickoff_at) > new Date() : true;

  useEffect(() => {
    if (!match || !open) return;
    setHomeScore(match.regulation_home_score ?? match.home_score);
    setAwayScore(match.regulation_away_score ?? match.away_score);
    setStatus(match.status === "finished" ? "closed" : match.status);
  }, [match, open]);

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="mx-auto max-w-lg rounded-t-3xl">
        <DrawerHeader className="px-5 text-left">
          <DrawerTitle>Ações da partida</DrawerTitle>
          <DrawerDescription>
            {match
              ? `${match.home_team?.name ?? "A definir"} × ${match.away_team?.name ?? "A definir"}`
              : "Selecione uma partida."}
          </DrawerDescription>
        </DrawerHeader>

        <div className="space-y-4 px-5">
          <section className="space-y-3 rounded-2xl border border-border/70 bg-muted/35 p-3">
            <p className="font-extrabold">Corrigir placar oficial</p>
            <div className="grid grid-cols-[1fr_auto_1fr] items-end gap-3">
              <ScoreField
                id="action-home-score"
                label={match?.home_team?.short_name || "Casa"}
                value={homeScore}
                onChange={setHomeScore}
              />
              <span className="pb-3 text-xl font-extrabold">×</span>
              <ScoreField
                id="action-away-score"
                label={match?.away_team?.short_name || "Fora"}
                value={awayScore}
                onChange={setAwayScore}
              />
            </div>
            <Button
              className="w-full"
              variant="secondary"
              disabled={busy || future || Boolean(match?.deleted_at)}
              onClick={() => {
                const confirmed = window.confirm(
                  "Corrigir este placar oficial? Se a partida estiver pontuada, os pontos serão recalculados.",
                );
                if (confirmed) onCorrectScore({ home_score: homeScore, away_score: awayScore });
              }}
            >
              <BiEditAlt className="size-5" />
              Corrigir placar oficial
            </Button>
          </section>

          <section className="space-y-3 rounded-2xl border border-border/70 bg-muted/35 p-3">
            <p className="font-extrabold">Status e pontuação</p>
            <div className="space-y-1.5">
              <Label htmlFor="admin-match-status">Alterar status</Label>
              <select
                id="admin-match-status"
                className="h-11 w-full rounded-xl border border-input bg-background/65 px-3 text-sm font-bold"
                value={status}
                disabled={busy || Boolean(match?.deleted_at)}
                onChange={(event) => setStatus(event.target.value)}
              >
                {statusOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Button
                variant="outline"
                disabled={busy || Boolean(match?.deleted_at)}
                onClick={() => {
                  if (
                    ["closed", "scored"].includes(match?.status ?? "") &&
                    !["closed", "scored"].includes(status)
                  ) {
                    const confirmed = window.confirm(
                      "Alterar uma partida pontuada para este status zera os pontos dessa partida. Continuar?",
                    );
                    if (!confirmed) return;
                  }
                  onSetStatus(status);
                }}
              >
                Alterar status
              </Button>
              <Button
                variant="outline"
                disabled={busy || Boolean(match?.deleted_at)}
                onClick={() => {
                  const confirmed = window.confirm(
                    "Recalcular pontuação desta partida sem editar palpites?",
                  );
                  if (confirmed) onRecalculate();
                }}
              >
                <BiCalculator className="size-5" />
                Recalcular
              </Button>
            </div>
          </section>

          <section className="rounded-2xl border border-destructive/30 bg-destructive/8 p-3">
            <p className="font-extrabold text-destructive">Remover partida incorreta</p>
            <p className="mt-1 text-xs text-muted-foreground">
              A remoção é lógica: a partida deixa de aparecer para jogadores e os pontos dessa
              partida são zerados.
            </p>
            <Button
              className="mt-3 w-full"
              variant="destructive"
              disabled={busy || Boolean(match?.deleted_at)}
              onClick={() => {
                const confirmation = window.prompt(
                  "Digite REMOVER PARTIDA para confirmar a remoção lógica.",
                );
                if (confirmation === "REMOVER PARTIDA") onSoftDelete();
              }}
            >
              <BiTrash className="size-5" />
              Remover partida
            </Button>
          </section>
        </div>

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
        className="h-14 rounded-2xl text-center text-2xl font-extrabold"
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
      />
      <div className="grid grid-cols-2 gap-2">
        <Button
          type="button"
          variant="outline"
          className="h-9 rounded-2xl"
          onClick={() => onChange(Math.max(0, value - 1))}
        >
          <BiMinus className="size-4" />
        </Button>
        <Button
          type="button"
          variant="outline"
          className="h-9 rounded-2xl"
          onClick={() => onChange(Math.min(99, value + 1))}
        >
          <BiPlus className="size-4" />
        </Button>
      </div>
    </div>
  );
}
