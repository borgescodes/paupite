import { useCallback, useEffect, useState } from "react";
import { BiCheckCircle, BiCoinStack, BiSave } from "react-icons/bi";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { callEdgeFunction } from "@/lib/edge";

interface Settings {
  id: string;
  title: string;
  status: string;
  entry_fee_cents: number;
  minimum_participants: number;
  prize_percentage: number;
  prize_description: string | null;
  terms: string;
}

interface Enrollment {
  id: string;
  user_id: string;
  status: string;
  requested_at: string;
}

interface UserName {
  id: string;
  display_name: string | null;
  nickname: string | null;
  email: string;
}

interface PrizeRequest {
  id: string;
  user_id: string;
  status: string;
  requested_at: string;
}

interface ScoreRules {
  exact_score_points: number;
  outcome_points: number;
  goal_difference_bonus: number;
}

interface PoolScoringRules {
  id: string;
  pool_id: string;
  stage_weights: Record<string, number>;
  base_points: Record<string, number>;
  team_multipliers: Record<string, number>;
  special_points: Record<string, number>;
  special_results: Record<string, string | null>;
  specials_lock_at: string | null;
}

interface AdminTeam {
  id: string;
  name: string;
  short_name: string | null;
  external_key: string | null;
}

interface KnockoutForm {
  specials_lock_at: string;
  champion_team_id: string;
  runner_up_team_id: string;
  third_place_team_id: string;
  top_scorer: string;
}

export function PoolAdmin({ currentRole }: { currentRole: string }) {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [enrollments, setEnrollments] = useState<Enrollment[]>([]);
  const [prizes, setPrizes] = useState<PrizeRequest[]>([]);
  const [users, setUsers] = useState<Record<string, UserName>>({});
  const [scoreRules, setScoreRules] = useState<ScoreRules | null>(null);
  const [poolRules, setPoolRules] = useState<PoolScoringRules | null>(null);
  const [teams, setTeams] = useState<AdminTeam[]>([]);
  const [teamMultipliers, setTeamMultipliers] = useState<Record<string, number>>({});
  const [multiplierTeamId, setMultiplierTeamId] = useState("");
  const [multiplierValue, setMultiplierValue] = useState(2);
  const [knockoutForm, setKnockoutForm] = useState<KnockoutForm>({
    specials_lock_at: "",
    champion_team_id: "",
    runner_up_team_id: "",
    third_place_team_id: "",
    top_scorer: "",
  });
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [
      settingsResult,
      enrollmentsResult,
      prizesResult,
      usersResult,
      scoreResult,
      poolRulesResult,
      teamsResult,
    ] = await Promise.all([
      supabase.from("pool_settings").select("*").eq("slug", "world-cup-2026").single(),
      supabase.from("enrollments").select("*").order("requested_at", { ascending: false }),
      supabase.from("prize_requests").select("*").order("requested_at", { ascending: false }),
      supabase.from("profiles").select("id,display_name,nickname,email"),
      supabase
        .from("score_rules")
        .select("exact_score_points,outcome_points,goal_difference_bonus")
        .order("created_at")
        .limit(1)
        .maybeSingle(),
      supabase.from("pool_scoring_rules").select("*").limit(1).maybeSingle(),
      supabase.from("teams").select("id,name,short_name,external_key").order("name"),
    ]);
    setSettings(settingsResult.data as Settings | null);
    setEnrollments((enrollmentsResult.data ?? []) as Enrollment[]);
    setPrizes((prizesResult.data ?? []) as PrizeRequest[]);
    setScoreRules(scoreResult.data as ScoreRules | null);
    const nextPoolRules = poolRulesResult.data as PoolScoringRules | null;
    const nextMultipliers = normalizeMultipliers(nextPoolRules?.team_multipliers);
    const firstMultiplier = Object.entries(nextMultipliers)[0];
    const specialResults = nextPoolRules?.special_results ?? {};
    setPoolRules(nextPoolRules);
    setTeams((teamsResult.data ?? []) as AdminTeam[]);
    setTeamMultipliers(nextMultipliers);
    setMultiplierTeamId(firstMultiplier?.[0] ?? "");
    setMultiplierValue(Number(firstMultiplier?.[1] ?? 2));
    setKnockoutForm({
      specials_lock_at: toDateTimeLocal(nextPoolRules?.specials_lock_at ?? null),
      champion_team_id: specialResults.champion_team_id ?? "",
      runner_up_team_id: specialResults.runner_up_team_id ?? "",
      third_place_team_id: specialResults.third_place_team_id ?? "",
      top_scorer: specialResults.top_scorer ?? "",
    });
    const map: Record<string, UserName> = {};
    for (const user of (usersResult.data ?? []) as UserName[]) map[user.id] = user;
    setUsers(map);
    setError(
      settingsResult.error?.message ??
        enrollmentsResult.error?.message ??
        prizesResult.error?.message ??
        usersResult.error?.message ??
        scoreResult.error?.message ??
        poolRulesResult.error?.message ??
        teamsResult.error?.message ??
        null,
    );
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function run(operation: () => Promise<unknown>, success: string) {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      await operation();
      setMessage(success);
      toast.success(success);
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Falha na operação.");
    } finally {
      setBusy(false);
    }
  }

  function addOrUpdateMultiplier() {
    if (!multiplierTeamId) return;
    const value = Number(multiplierValue);
    setTeamMultipliers((current) => ({
      ...current,
      [multiplierTeamId]: Number.isFinite(value) && value > 1 ? value : 1,
    }));
  }

  function removeMultiplier(teamId: string) {
    setTeamMultipliers((current) => {
      const next = { ...current };
      delete next[teamId];
      return next;
    });
  }

  async function saveKnockoutRules() {
    if (!poolRules) throw new Error("Regras do mata-mata ainda não carregadas.");
    const { error: updateError } = await supabase
      .from("pool_scoring_rules")
      .update({
        team_multipliers: normalizeMultipliers(teamMultipliers),
        special_results: {
          champion_team_id: knockoutForm.champion_team_id || null,
          runner_up_team_id: knockoutForm.runner_up_team_id || null,
          third_place_team_id: knockoutForm.third_place_team_id || null,
          top_scorer: knockoutForm.top_scorer.trim() || null,
        },
        specials_lock_at: fromDateTimeLocal(knockoutForm.specials_lock_at),
      })
      .eq("id", poolRules.id);
    if (updateError) throw new Error(updateError.message);
  }

  if (!settings)
    return <p className="text-sm text-muted-foreground">Carregando configurações...</p>;
  const superadmin = currentRole === "superadmin";

  return (
    <div className="space-y-4">
      {superadmin ? (
        <Card className="glass-card">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <BiCoinStack className="size-5 text-brand" />
              Configuração do bolão
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2">
            <Field label="Título">
              <Input
                value={settings.title}
                onChange={(event) => setSettings({ ...settings, title: event.target.value })}
              />
            </Field>
            <Field label="Status">
              <select
                className="h-9 w-full rounded-md border bg-background px-3 text-sm"
                value={settings.status}
                onChange={(event) => setSettings({ ...settings, status: event.target.value })}
              >
                <option value="draft">Rascunho</option>
                <option value="open">Aberto</option>
                <option value="closed">Encerrado</option>
                <option value="archived">Arquivado</option>
              </select>
            </Field>
            <Field label="Entrada (R$)">
              <Input
                type="number"
                min={0}
                step="0.01"
                value={(settings.entry_fee_cents / 100).toFixed(2)}
                onChange={(event) =>
                  setSettings({
                    ...settings,
                    entry_fee_cents: Math.round(Number(event.target.value) * 100),
                  })
                }
              />
            </Field>
            <Field label="Meta de participantes">
              <Input
                type="number"
                min={1}
                value={settings.minimum_participants}
                onChange={(event) =>
                  setSettings({ ...settings, minimum_participants: Number(event.target.value) })
                }
              />
            </Field>
            <Field label="% destinado à premiação">
              <Input
                type="number"
                min={0}
                max={100}
                value={settings.prize_percentage}
                onChange={(event) =>
                  setSettings({ ...settings, prize_percentage: Number(event.target.value) })
                }
              />
            </Field>
            <div className="sm:col-span-2">
              <Field label="Informação da premiação">
                <Input
                  value={settings.prize_description ?? ""}
                  onChange={(event) =>
                    setSettings({ ...settings, prize_description: event.target.value || null })
                  }
                />
              </Field>
            </div>
            <div className="sm:col-span-2">
              <Field label="Termos">
                <Textarea
                  rows={6}
                  value={settings.terms}
                  onChange={(event) => setSettings({ ...settings, terms: event.target.value })}
                />
              </Field>
            </div>
            <Button
              disabled={busy}
              className="sm:col-span-2"
              onClick={() =>
                void run(
                  () =>
                    callEdgeFunction("pool-enrollment", {
                      action: "update_settings",
                      title: settings.title,
                      status: settings.status,
                      entry_fee_cents: settings.entry_fee_cents,
                      minimum_participants: settings.minimum_participants,
                      prize_percentage: settings.prize_percentage,
                      prize_description: settings.prize_description,
                      terms: settings.terms,
                    }),
                  "Configurações salvas.",
                )
              }
            >
              <BiSave className="size-5" />
              Salvar configurações
            </Button>
          </CardContent>
        </Card>
      ) : (
        <Card className="glass-card border-brand/25">
          <CardContent className="p-4 text-sm text-muted-foreground">
            <p className="font-extrabold text-foreground">Operação do bolão</p>
            <p className="mt-1">
              Admins acompanham inscrições e pendências. Configuração, pontuação e confirmação
              manual seguem restritas ao superadmin.
            </p>
          </CardContent>
        </Card>
      )}

      {(message || error) && (
        <p className={error ? "text-sm text-destructive" : "text-sm text-success"}>
          {error ?? message}
        </p>
      )}

      {superadmin && scoreRules && (
        <Card className="glass-card">
          <CardHeader>
            <CardTitle className="text-base">Regras de pontuação</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-3">
            <Field label="Placar exato">
              <Input
                type="number"
                min={0}
                value={scoreRules.exact_score_points}
                onChange={(event) =>
                  setScoreRules({ ...scoreRules, exact_score_points: Number(event.target.value) })
                }
              />
            </Field>
            <Field label="Resultado">
              <Input
                type="number"
                min={0}
                value={scoreRules.outcome_points}
                onChange={(event) =>
                  setScoreRules({ ...scoreRules, outcome_points: Number(event.target.value) })
                }
              />
            </Field>
            <Field label="Bônus saldo">
              <Input
                type="number"
                min={0}
                value={scoreRules.goal_difference_bonus}
                onChange={(event) =>
                  setScoreRules({
                    ...scoreRules,
                    goal_difference_bonus: Number(event.target.value),
                  })
                }
              />
            </Field>
            <Button
              variant="secondary"
              disabled={busy}
              className="sm:col-span-3"
              onClick={() =>
                void run(
                  () =>
                    callEdgeFunction("pool-enrollment", {
                      action: "update_score_rules",
                      ...scoreRules,
                    }),
                  "Regras de pontuação salvas.",
                )
              }
            >
              Salvar pontuação
            </Button>
          </CardContent>
        </Card>
      )}

      {poolRules && (
        <Card className="glass-card border-brand/25">
          <CardHeader>
            <CardTitle className="text-base">Mata-mata</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Lock apostas especiais">
                <Input
                  type="datetime-local"
                  value={knockoutForm.specials_lock_at}
                  onChange={(event) =>
                    setKnockoutForm((current) => ({
                      ...current,
                      specials_lock_at: event.target.value,
                    }))
                  }
                />
              </Field>
              <Field label="Artilheiro oficial">
                <Input
                  value={knockoutForm.top_scorer}
                  onChange={(event) =>
                    setKnockoutForm((current) => ({ ...current, top_scorer: event.target.value }))
                  }
                />
              </Field>
              <Field label="Campeão oficial">
                <TeamSelectInput
                  value={knockoutForm.champion_team_id}
                  teams={teams}
                  onChange={(value) =>
                    setKnockoutForm((current) => ({ ...current, champion_team_id: value }))
                  }
                />
              </Field>
              <Field label="Vice oficial">
                <TeamSelectInput
                  value={knockoutForm.runner_up_team_id}
                  teams={teams}
                  onChange={(value) =>
                    setKnockoutForm((current) => ({ ...current, runner_up_team_id: value }))
                  }
                />
              </Field>
              <Field label="3º lugar oficial">
                <TeamSelectInput
                  value={knockoutForm.third_place_team_id}
                  teams={teams}
                  onChange={(value) =>
                    setKnockoutForm((current) => ({ ...current, third_place_team_id: value }))
                  }
                />
              </Field>
            </div>

            <div className="rounded-2xl bg-muted/45 p-3">
              <p className="text-sm font-bold">Multiplicador por time</p>
              <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_120px_auto] sm:items-end">
                <Field label="Time">
                  <TeamSelectInput
                    value={multiplierTeamId}
                    teams={teams}
                    onChange={setMultiplierTeamId}
                  />
                </Field>
                <Field label="Multiplicador">
                  <Input
                    type="number"
                    min={1}
                    step={0.1}
                    value={multiplierValue}
                    onChange={(event) => setMultiplierValue(Number(event.target.value))}
                  />
                </Field>
                <Button type="button" variant="secondary" onClick={addOrUpdateMultiplier}>
                  Adicionar
                </Button>
              </div>
              {Object.entries(teamMultipliers).length > 0 ? (
                <div className="mt-3 flex flex-wrap gap-2">
                  {Object.entries(teamMultipliers).map(([teamId, multiplier]) => (
                    <span
                      key={teamId}
                      className="inline-flex items-center gap-2 rounded-full bg-brand/10 px-2 py-1 text-xs font-bold text-brand"
                    >
                      {teamName(teams, teamId)} x{multiplier}
                      <button
                        type="button"
                        className="text-muted-foreground hover:text-destructive"
                        onClick={() => removeMultiplier(teamId)}
                      >
                        Remover
                      </button>
                    </span>
                  ))}
                </div>
              ) : (
                <p className="mt-2 text-xs text-muted-foreground">
                  Nenhum multiplicador ativo. O padrão é x1.
                </p>
              )}
            </div>

            <Button
              variant="secondary"
              disabled={busy}
              className="w-full"
              onClick={() => void run(saveKnockoutRules, "Regras do mata-mata salvas.")}
            >
              Salvar mata-mata
            </Button>
          </CardContent>
        </Card>
      )}

      <Card className="glass-card">
        <CardHeader>
          <CardTitle className="text-base">Inscrições</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {enrollments.length === 0 && (
            <p className="text-sm text-muted-foreground">Nenhuma solicitação.</p>
          )}
          {enrollments.map((enrollment) => (
            <div
              key={enrollment.id}
              className="flex flex-col gap-2 rounded-2xl border border-border/70 bg-muted/35 p-3 sm:flex-row sm:items-center"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate font-bold">{nameOf(users[enrollment.user_id])}</p>
                <p className="text-xs text-muted-foreground">
                  {enrollmentStatusLabel(enrollment.status)}
                </p>
              </div>
              {superadmin && enrollment.status !== "active" && (
                <Button
                  size="sm"
                  disabled={busy}
                  onClick={() =>
                    void run(
                      () =>
                        callEdgeFunction("pool-enrollment", {
                          action: "confirm_manual",
                          enrollment_id: enrollment.id,
                        }),
                      "Pagamento manual confirmado.",
                    )
                  }
                >
                  <BiCheckCircle className="size-5" />
                  Confirmar manualmente
                </Button>
              )}
            </div>
          ))}
        </CardContent>
      </Card>

      <Card className="glass-card">
        <CardHeader>
          <CardTitle className="text-base">Solicitações de prêmio</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {prizes.length === 0 && (
            <p className="text-sm text-muted-foreground">Nenhuma solicitação.</p>
          )}
          {prizes.map((prize) => (
            <div
              key={prize.id}
              className="flex items-center gap-3 rounded-2xl border border-border/70 bg-muted/35 p-3"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate font-bold">{nameOf(users[prize.user_id])}</p>
                <p className="text-xs text-muted-foreground">{prize.status}</p>
              </div>
              {superadmin && prize.status !== "paid" && (
                <Button
                  size="sm"
                  disabled={busy}
                  onClick={() =>
                    void run(
                      () =>
                        callEdgeFunction("pool-enrollment", {
                          action: "mark_prize_paid",
                          request_id: prize.id,
                        }),
                      "Prêmio marcado como pago.",
                    )
                  }
                >
                  Marcar pago
                </Button>
              )}
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
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

function TeamSelectInput({
  value,
  teams,
  onChange,
}: {
  value: string;
  teams: AdminTeam[];
  onChange: (value: string) => void;
}) {
  return (
    <select
      className="h-9 w-full rounded-md border bg-background px-3 text-sm"
      value={value}
      onChange={(event) => onChange(event.target.value)}
    >
      <option value="">Selecione</option>
      {teams.map((team) => (
        <option key={team.id} value={team.id}>
          {team.name}
        </option>
      ))}
    </select>
  );
}

function normalizeMultipliers(value: Record<string, number> | null | undefined) {
  const normalized: Record<string, number> = {};
  for (const [teamId, multiplier] of Object.entries(value ?? {})) {
    const numeric = Number(multiplier);
    if (teamId && Number.isFinite(numeric) && numeric > 1) normalized[teamId] = numeric;
  }
  return normalized;
}

function teamName(teams: AdminTeam[], teamId: string) {
  const team = teams.find((item) => item.id === teamId || item.external_key === teamId);
  return team?.short_name || team?.name || "Time";
}

function toDateTimeLocal(value: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

function fromDateTimeLocal(value: string) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function nameOf(user?: UserName) {
  return user?.nickname || user?.display_name || user?.email || "Usuário";
}

function enrollmentStatusLabel(status: string) {
  const map: Record<string, string> = {
    requested: "Solicitação enviada",
    payment_pending: "Aguardando pagamento",
    active: "Inscrição ativa",
    confirmed: "Inscrição confirmada",
    paid: "Pagamento recebido",
    rejected: "Solicitação recusada",
    cancelled: "Inscrição cancelada",
  };
  return map[status] ?? "Status em análise";
}
