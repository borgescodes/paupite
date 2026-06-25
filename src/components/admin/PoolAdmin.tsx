import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, Coins, Save } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { supabase as _supabaseTyped } from "@/integrations/supabase/client";
const supabase = _supabaseTyped as any;
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
  free_ranking_starts_at: string | null;
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

export function PoolAdmin() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [enrollments, setEnrollments] = useState<Enrollment[]>([]);
  const [prizes, setPrizes] = useState<PrizeRequest[]>([]);
  const [users, setUsers] = useState<Record<string, UserName>>({});
  const [scoreRules, setScoreRules] = useState<ScoreRules | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [settingsResult, enrollmentsResult, prizesResult, usersResult, scoreResult] =
      await Promise.all([
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
      ]);
    setSettings(settingsResult.data as Settings | null);
    setEnrollments((enrollmentsResult.data ?? []) as Enrollment[]);
    setPrizes((prizesResult.data ?? []) as PrizeRequest[]);
    setScoreRules(scoreResult.data as ScoreRules | null);
    const map: Record<string, UserName> = {};
    for (const user of (usersResult.data ?? []) as UserName[]) map[user.id] = user;
    setUsers(map);
    setError(
      settingsResult.error?.message ??
        enrollmentsResult.error?.message ??
        prizesResult.error?.message ??
        usersResult.error?.message ??
        scoreResult.error?.message ??
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
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Falha na operação.");
    } finally {
      setBusy(false);
    }
  }

  if (!settings)
    return <p className="text-sm text-muted-foreground">Carregando configurações...</p>;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Coins className="size-4" />
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
          <Field label="Início do Ranking da Resenha">
            <Input
              type="datetime-local"
              value={
                settings.free_ranking_starts_at ? toLocalInput(settings.free_ranking_starts_at) : ""
              }
              onChange={(event) =>
                setSettings({
                  ...settings,
                  free_ranking_starts_at: event.target.value
                    ? new Date(event.target.value).toISOString()
                    : null,
                })
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
                    free_ranking_starts_at: settings.free_ranking_starts_at,
                  }),
                "Configurações salvas.",
              )
            }
          >
            <Save className="size-4" />
            Salvar configurações
          </Button>
        </CardContent>
      </Card>

      {(message || error) && (
        <p className={error ? "text-sm text-destructive" : "text-sm text-success"}>
          {error ?? message}
        </p>
      )}

      {scoreRules && (
        <Card>
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

      <Card>
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
              className="flex flex-col gap-2 rounded-lg border p-3 sm:flex-row sm:items-center"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate font-bold">{nameOf(users[enrollment.user_id])}</p>
                <p className="text-xs text-muted-foreground">{enrollment.status}</p>
              </div>
              {enrollment.status !== "active" && (
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
                  <CheckCircle2 className="size-4" />
                  Confirmar manualmente
                </Button>
              )}
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Solicitações de prêmio</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {prizes.length === 0 && (
            <p className="text-sm text-muted-foreground">Nenhuma solicitação.</p>
          )}
          {prizes.map((prize) => (
            <div key={prize.id} className="flex items-center gap-3 rounded-lg border p-3">
              <div className="min-w-0 flex-1">
                <p className="truncate font-bold">{nameOf(users[prize.user_id])}</p>
                <p className="text-xs text-muted-foreground">{prize.status}</p>
              </div>
              {prize.status !== "paid" && (
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

function nameOf(user?: UserName) {
  return user?.nickname || user?.display_name || user?.email || "Usuário";
}

function toLocalInput(value: string) {
  const date = new Date(value);
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}
