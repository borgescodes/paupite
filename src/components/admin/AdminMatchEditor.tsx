import { useEffect, useState } from "react";
import { BiCalendarEdit, BiSave } from "react-icons/bi";

import type {
  AdminCompetition,
  AdminMatch,
  AdminMatchFormValue,
  AdminTeam,
} from "@/components/admin/match-types";
import { matchStageOptions } from "@/components/admin/match-labels";
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

export function AdminMatchEditor({
  open,
  match,
  teams,
  competitions,
  busy,
  onOpenChange,
  onSave,
}: {
  open: boolean;
  match: AdminMatch | null;
  teams: AdminTeam[];
  competitions: AdminCompetition[];
  busy: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (value: AdminMatchFormValue) => void;
}) {
  const [form, setForm] = useState<AdminMatchFormValue>(() => initialForm(match));

  useEffect(() => {
    if (open) setForm(initialForm(match));
  }, [match, open]);

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="mx-auto max-h-[92vh] max-w-2xl rounded-t-3xl">
        <DrawerHeader className="px-5 text-left">
          <DrawerTitle className="flex items-center gap-2">
            <BiCalendarEdit className="size-5 text-brand" />
            {match ? "Editar partida" : "Nova partida"}
          </DrawerTitle>
          <DrawerDescription>
            Ajuste os dados que aparecem nos cards de partidas. O resultado é tratado separadamente.
          </DrawerDescription>
        </DrawerHeader>
        <form
          className="no-scrollbar grid gap-4 overflow-y-auto px-5 pb-3 sm:grid-cols-2"
          onSubmit={(event) => {
            event.preventDefault();
            onSave(form);
          }}
        >
          <Field id="match-competition" label="Competição">
            <NativeSelect
              id="match-competition"
              value={form.competition_id}
              onChange={(value) => setForm((current) => ({ ...current, competition_id: value }))}
            >
              <option value="">Sem competição</option>
              {competitions.map((competition) => (
                <option key={competition.id} value={competition.id}>
                  {competition.name}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <Field id="match-kickoff" label="Data e horário">
            <Input
              id="match-kickoff"
              required
              type="datetime-local"
              value={form.kickoff_at}
              onChange={(event) =>
                setForm((current) => ({ ...current, kickoff_at: event.target.value }))
              }
            />
          </Field>
          <Field id="match-home" label="Seleção A">
            <TeamSelect
              id="match-home"
              teams={teams}
              value={form.home_team_id}
              onChange={(value) => setForm((current) => ({ ...current, home_team_id: value }))}
            />
          </Field>
          <Field id="match-away" label="Seleção B">
            <TeamSelect
              id="match-away"
              teams={teams}
              value={form.away_team_id}
              onChange={(value) => setForm((current) => ({ ...current, away_team_id: value }))}
            />
          </Field>
          <Field id="match-stage" label="Fase">
            <NativeSelect
              id="match-stage"
              value={form.stage}
              onChange={(value) => setForm((current) => ({ ...current, stage: value }))}
            >
              {matchStageOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <Field id="match-group" label="Grupo ou rodada">
            <Input
              id="match-group"
              value={form.group_name}
              placeholder="Ex.: Grupo A"
              onChange={(event) =>
                setForm((current) => ({ ...current, group_name: event.target.value }))
              }
            />
          </Field>
          <Field id="match-venue" label="Estádio">
            <Input
              id="match-venue"
              value={form.venue}
              onChange={(event) =>
                setForm((current) => ({ ...current, venue: event.target.value }))
              }
            />
          </Field>
          <Field id="match-city" label="Cidade">
            <Input
              id="match-city"
              value={form.city}
              onChange={(event) => setForm((current) => ({ ...current, city: event.target.value }))}
            />
          </Field>
          <div className="h-1 sm:col-span-2" />
          <Button className="hidden" type="submit">
            Salvar
          </Button>
        </form>
        <DrawerFooter className="grid grid-cols-2 px-5">
          <DrawerClose asChild>
            <Button type="button" variant="outline" disabled={busy}>
              Cancelar
            </Button>
          </DrawerClose>
          <Button type="button" disabled={busy} onClick={() => onSave(form)}>
            <BiSave className="size-5" />
            {busy ? "Salvando..." : "Salvar"}
          </Button>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
}

function initialForm(match: AdminMatch | null): AdminMatchFormValue {
  return {
    competition_id: match?.competition_id ?? "",
    home_team_id: match?.home_team_id ?? "",
    away_team_id: match?.away_team_id ?? "",
    kickoff_at: match ? toLocalInput(match.kickoff_at) : "",
    stage: match?.stage ?? "group_stage",
    group_name: match?.group_name ?? "",
    venue: match?.venue ?? "",
    city: match?.city ?? "",
  };
}

function TeamSelect({
  id,
  teams,
  value,
  onChange,
}: {
  id: string;
  teams: AdminTeam[];
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <NativeSelect id={id} value={value} onChange={onChange} required>
      <option value="">Selecione</option>
      {teams.map((team) => (
        <option key={team.id} value={team.id}>
          {team.name}
        </option>
      ))}
    </NativeSelect>
  );
}

export function NativeSelect({
  id,
  children,
  value,
  onChange,
  required,
}: {
  id: string;
  children: React.ReactNode;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
}) {
  return (
    <select
      id={id}
      required={required}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      className="h-11 w-full rounded-xl border border-input bg-background/65 px-3 text-sm shadow-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/25"
    >
      {children}
    </select>
  );
}

function Field({ id, label, children }: { id: string; label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      {children}
    </div>
  );
}

function toLocalInput(value: string) {
  const date = new Date(value);
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}
