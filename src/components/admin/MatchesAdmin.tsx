import { useCallback, useEffect, useState } from "react";
import { CalendarClock, ChevronDown, Plus, Save, Trophy } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { callEdgeFunction } from "@/lib/edge";
import { supabase } from "@/integrations/supabase/client";

interface Team {
  id: string;
  name: string;
  short_name: string | null;
  country_code: string | null;
}

interface Competition {
  id: string;
  name: string;
}

interface Match {
  id: string;
  kickoff_at: string;
  status: string;
  home_team_id: string | null;
  away_team_id: string | null;
  home_score: number;
  away_score: number;
  competition_id: string | null;
  stage: string | null;
  group_name: string | null;
  venue: string | null;
  city: string | null;
  home_team: { name: string } | null;
  away_team: { name: string } | null;
}

export function MatchesAdmin() {
  const [teams, setTeams] = useState<Team[]>([]);
  const [competitions, setCompetitions] = useState<Competition[]>([]);
  const [matches, setMatches] = useState<Match[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [newMatch, setNewMatch] = useState({
    competition_id: "",
    home_team_id: "",
    away_team_id: "",
    kickoff_at: "",
    stage: "group_stage",
    group_name: "",
    venue: "",
    city: "",
  });
  const [newTeam, setNewTeam] = useState({
    id: "",
    name: "",
    short_name: "",
    country_code: "",
  });

  const load = useCallback(async () => {
    const [teamResult, competitionResult, matchResult] = await Promise.all([
      supabase.from("teams").select("id,name,short_name,country_code").order("name"),
      supabase.from("competitions").select("id,name").order("created_at"),
      supabase
        .from("matches")
        .select(
          "id,kickoff_at,status,home_team_id,away_team_id,home_score,away_score,competition_id,stage,group_name,venue,city,home_team:teams!matches_home_team_id_fkey(name),away_team:teams!matches_away_team_id_fkey(name)",
        )
        .order("kickoff_at"),
    ]);
    setTeams((teamResult.data ?? []) as Team[]);
    setCompetitions((competitionResult.data ?? []) as Competition[]);
    setMatches((matchResult.data ?? []) as unknown as Match[]);
    setError(
      teamResult.error?.message ??
        competitionResult.error?.message ??
        matchResult.error?.message ??
        null,
    );
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function run<T>(operation: () => Promise<T>, success: string) {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      await operation();
      setMessage(success);
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Falha na operação.");
    } finally {
      setBusy(false);
    }
  }

  async function createMatch(event: React.FormEvent) {
    event.preventDefault();
    await run(
      () =>
        callEdgeFunction("admin-save-match", {
          action: "create",
          ...newMatch,
          competition_id: newMatch.competition_id || null,
          kickoff_at: new Date(newMatch.kickoff_at).toISOString(),
        }),
      "Partida criada.",
    );
    setNewMatch((current) => ({
      ...current,
      home_team_id: "",
      away_team_id: "",
      kickoff_at: "",
      group_name: "",
      venue: "",
      city: "",
    }));
  }

  async function createTeam(event: React.FormEvent) {
    event.preventDefault();
    await run(
      async () => {
        const row = {
          name: newTeam.name.trim(),
          short_name: newTeam.short_name.trim() || null,
          country_code: newTeam.country_code.trim().toUpperCase() || null,
          flag_url: newTeam.country_code
            ? `/flags/${newTeam.country_code.trim().toLowerCase()}.svg`
            : null,
        };
        const query = newTeam.id
          ? supabase.from("teams").update(row).eq("id", newTeam.id)
          : supabase.from("teams").insert(row);
        const { error: createError } = await query;
        if (createError) throw createError;
      },
      newTeam.id ? "Seleção atualizada." : "Seleção adicionada.",
    );
    setNewTeam({ id: "", name: "", short_name: "", country_code: "" });
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Plus className="size-4" />
            Nova partida futura
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={createMatch} className="grid gap-3 sm:grid-cols-2">
            <Field label="Competição">
              <NativeSelect
                value={newMatch.competition_id}
                onChange={(value) =>
                  setNewMatch((current) => ({ ...current, competition_id: value }))
                }
              >
                <option value="">Sem competição</option>
                {competitions.map((competition) => (
                  <option key={competition.id} value={competition.id}>
                    {competition.name}
                  </option>
                ))}
              </NativeSelect>
            </Field>
            <Field label="Data e horário">
              <Input
                required
                type="datetime-local"
                value={newMatch.kickoff_at}
                onChange={(event) =>
                  setNewMatch((current) => ({ ...current, kickoff_at: event.target.value }))
                }
              />
            </Field>
            <Field label="Seleção A">
              <TeamSelect
                teams={teams}
                value={newMatch.home_team_id}
                onChange={(value) =>
                  setNewMatch((current) => ({ ...current, home_team_id: value }))
                }
              />
            </Field>
            <Field label="Seleção B">
              <TeamSelect
                teams={teams}
                value={newMatch.away_team_id}
                onChange={(value) =>
                  setNewMatch((current) => ({ ...current, away_team_id: value }))
                }
              />
            </Field>
            <Field label="Fase">
              <Input
                value={newMatch.stage}
                onChange={(event) =>
                  setNewMatch((current) => ({ ...current, stage: event.target.value }))
                }
              />
            </Field>
            <Field label="Grupo">
              <Input
                value={newMatch.group_name}
                onChange={(event) =>
                  setNewMatch((current) => ({ ...current, group_name: event.target.value }))
                }
              />
            </Field>
            <Field label="Estádio">
              <Input
                value={newMatch.venue}
                onChange={(event) =>
                  setNewMatch((current) => ({ ...current, venue: event.target.value }))
                }
              />
            </Field>
            <Field label="Cidade">
              <Input
                value={newMatch.city}
                onChange={(event) =>
                  setNewMatch((current) => ({ ...current, city: event.target.value }))
                }
              />
            </Field>
            <Button disabled={busy} className="sm:col-span-2">
              Criar partida
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Criar ou editar seleção</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={createTeam} className="grid gap-3 sm:grid-cols-4">
            <select
              className="h-9 rounded-md border bg-background px-3 text-sm sm:col-span-4"
              value={newTeam.id}
              onChange={(event) => {
                const selected = teams.find((team) => team.id === event.target.value);
                setNewTeam(
                  selected
                    ? {
                        id: selected.id,
                        name: selected.name,
                        short_name: selected.short_name ?? "",
                        country_code: selected.country_code ?? "",
                      }
                    : { id: "", name: "", short_name: "", country_code: "" },
                );
              }}
            >
              <option value="">Nova seleção</option>
              {teams.map((team) => (
                <option key={team.id} value={team.id}>
                  Editar {team.name}
                </option>
              ))}
            </select>
            <Input
              required
              placeholder="Nome"
              value={newTeam.name}
              onChange={(event) =>
                setNewTeam((current) => ({ ...current, name: event.target.value }))
              }
            />
            <Input
              placeholder="Sigla"
              maxLength={5}
              value={newTeam.short_name}
              onChange={(event) =>
                setNewTeam((current) => ({ ...current, short_name: event.target.value }))
              }
            />
            <Input
              placeholder="Código da flag"
              maxLength={6}
              value={newTeam.country_code}
              onChange={(event) =>
                setNewTeam((current) => ({ ...current, country_code: event.target.value }))
              }
            />
            <Button disabled={busy} variant="secondary">
              {newTeam.id ? "Salvar" : "Adicionar"}
            </Button>
          </form>
        </CardContent>
      </Card>

      {(message || error) && (
        <p className={error ? "text-sm text-destructive" : "text-sm text-success"}>
          {error ?? message}
        </p>
      )}

      <div className="space-y-3">
        {matches.map((match) => (
          <MatchEditor
            key={match.id}
            match={match}
            teams={teams}
            competitions={competitions}
            busy={busy}
            onRun={run}
          />
        ))}
      </div>
    </div>
  );
}

function MatchEditor({
  match,
  teams,
  competitions,
  busy,
  onRun,
}: {
  match: Match;
  teams: Team[];
  competitions: Competition[];
  busy: boolean;
  onRun: <T>(operation: () => Promise<T>, success: string) => Promise<void>;
}) {
  const [form, setForm] = useState({
    competition_id: match.competition_id ?? "",
    home_team_id: match.home_team_id ?? "",
    away_team_id: match.away_team_id ?? "",
    kickoff_at: toLocalInput(match.kickoff_at),
    stage: match.stage ?? "",
    group_name: match.group_name ?? "",
    venue: match.venue ?? "",
    city: match.city ?? "",
  });
  const [score, setScore] = useState({
    home: match.home_score,
    away: match.away_score,
    status: match.status === "live" ? "live" : "finished",
  });
  const future = new Date(match.kickoff_at) > new Date();

  return (
    <details className="group rounded-xl border bg-card">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 p-4">
        <div className="min-w-0">
          <p className="truncate font-bold">
            {match.home_team?.name ?? "A definir"} × {match.away_team?.name ?? "A definir"}
          </p>
          <p className="text-xs text-muted-foreground">
            {new Date(match.kickoff_at).toLocaleString("pt-BR")} · {match.status}
          </p>
        </div>
        <ChevronDown className="size-4 transition-transform group-open:rotate-180" />
      </summary>
      <div className="space-y-5 border-t p-4">
        <section className="space-y-3">
          <h3 className="flex items-center gap-2 text-sm font-bold">
            <CalendarClock className="size-4" />
            Dados operacionais
          </h3>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Competição">
              <NativeSelect
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
            <Field label="Data e horário">
              <Input
                type="datetime-local"
                value={form.kickoff_at}
                onChange={(event) =>
                  setForm((current) => ({ ...current, kickoff_at: event.target.value }))
                }
              />
            </Field>
            <Field label="Seleção A">
              <TeamSelect
                teams={teams}
                value={form.home_team_id}
                onChange={(value) => setForm((current) => ({ ...current, home_team_id: value }))}
              />
            </Field>
            <Field label="Seleção B">
              <TeamSelect
                teams={teams}
                value={form.away_team_id}
                onChange={(value) => setForm((current) => ({ ...current, away_team_id: value }))}
              />
            </Field>
            <Field label="Fase">
              <Input
                value={form.stage}
                onChange={(event) =>
                  setForm((current) => ({ ...current, stage: event.target.value }))
                }
              />
            </Field>
            <Field label="Grupo">
              <Input
                value={form.group_name}
                onChange={(event) =>
                  setForm((current) => ({ ...current, group_name: event.target.value }))
                }
              />
            </Field>
            <Field label="Estádio">
              <Input
                value={form.venue}
                onChange={(event) =>
                  setForm((current) => ({ ...current, venue: event.target.value }))
                }
              />
            </Field>
            <Field label="Cidade">
              <Input
                value={form.city}
                onChange={(event) =>
                  setForm((current) => ({ ...current, city: event.target.value }))
                }
              />
            </Field>
          </div>
          <Button
            disabled={busy}
            variant="secondary"
            onClick={() =>
              void onRun(
                () =>
                  callEdgeFunction("admin-save-match", {
                    action: "update",
                    match_id: match.id,
                    ...form,
                    competition_id: form.competition_id || null,
                    kickoff_at: new Date(form.kickoff_at).toISOString(),
                  }),
                "Dados da partida salvos.",
              )
            }
          >
            <Save className="size-4" />
            Salvar dados
          </Button>
        </section>

        <section className="space-y-3 rounded-lg bg-muted/50 p-3">
          <h3 className="flex items-center gap-2 text-sm font-bold">
            <Trophy className="size-4" />
            Resultado oficial
          </h3>
          {future ? (
            <p className="text-sm text-muted-foreground">
              O placar fica bloqueado até o horário de início.
            </p>
          ) : (
            <>
              <div className="flex items-end gap-3">
                <Field label="Casa">
                  <Input
                    type="number"
                    min={0}
                    max={99}
                    className="w-20"
                    value={score.home}
                    onChange={(event) =>
                      setScore((current) => ({ ...current, home: Number(event.target.value) }))
                    }
                  />
                </Field>
                <span className="pb-2 font-bold">×</span>
                <Field label="Fora">
                  <Input
                    type="number"
                    min={0}
                    max={99}
                    className="w-20"
                    value={score.away}
                    onChange={(event) =>
                      setScore((current) => ({ ...current, away: Number(event.target.value) }))
                    }
                  />
                </Field>
                <Field label="Status">
                  <NativeSelect
                    value={score.status}
                    onChange={(value) => setScore((current) => ({ ...current, status: value }))}
                  >
                    <option value="live">Em andamento</option>
                    <option value="finished">Encerrado</option>
                  </NativeSelect>
                </Field>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  disabled={busy || match.status === "closed"}
                  onClick={() =>
                    void onRun(
                      () =>
                        callEdgeFunction("admin-save-match", {
                          action: "result",
                          match_id: match.id,
                          home_score: score.home,
                          away_score: score.away,
                          status: score.status,
                        }),
                      "Resultado salvo.",
                    )
                  }
                >
                  Salvar resultado
                </Button>
                <Button
                  disabled={busy || match.status === "scheduled" || match.status === "closed"}
                  variant="outline"
                  onClick={() =>
                    void onRun(
                      () =>
                        callEdgeFunction("admin-save-match", {
                          action: "close",
                          match_id: match.id,
                        }),
                      "Partida fechada e pontuação recalculada.",
                    )
                  }
                >
                  Fechar e recalcular
                </Button>
              </div>
            </>
          )}
        </section>
      </div>
    </details>
  );
}

function TeamSelect({
  teams,
  value,
  onChange,
}: {
  teams: Team[];
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <NativeSelect value={value} onChange={onChange} required>
      <option value="">Selecione</option>
      {teams.map((team) => (
        <option key={team.id} value={team.id}>
          {team.name}
        </option>
      ))}
    </NativeSelect>
  );
}

function NativeSelect({
  children,
  value,
  onChange,
  required,
}: {
  children: React.ReactNode;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
}) {
  return (
    <select
      required={required}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
    >
      {children}
    </select>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {children}
    </div>
  );
}

function toLocalInput(value: string) {
  const date = new Date(value);
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}
