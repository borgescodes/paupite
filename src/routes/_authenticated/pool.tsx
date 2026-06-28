import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  BiCalendar,
  BiCheckCircle,
  BiCreditCard,
  BiGroup,
  BiInfoCircle,
  BiLinkExternal,
  BiLockAlt,
  BiReceipt,
  BiShieldQuarter,
  BiSolidTrophy,
  BiTimeFive,
} from "react-icons/bi";
import type { IconType } from "react-icons";
import { useEffect, useMemo, useState } from "react";

import { MobileShell } from "@/components/mobile/MobileShell";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { callEdgeFunction } from "@/lib/edge";
import {
  defaultKnockoutBasePoints,
  defaultKnockoutStageWeights,
  defaultSpecialPoints,
  knockoutStageLabel,
} from "@/lib/knockout";

interface PoolSummary {
  id: string;
  title: string;
  status: string;
  enrollments_mode: string | null;
  enrollment_opens_at: string | null;
  coming_soon_message: string | null;
  entry_fee_cents: number;
  minimum_participants: number;
  prize_percentage: number;
  prize_description: string | null;
  terms: string;
  participants_count: number;
  estimated_prize_cents: number;
}

interface Enrollment {
  id: string;
  status: string;
  terms_accepted_at: string;
}

interface Payment {
  id: string;
  status: string;
  provider: string;
  checkout_url: string | null;
  receipt_url: string | null;
  amount_cents: number;
}

interface ScoreRules {
  exact_score_points: number | null;
  outcome_points: number | null;
  goal_difference_bonus: number | null;
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

interface SpecialPrediction {
  id: string;
  champion_team_id: string | null;
  runner_up_team_id: string | null;
  third_place_team_id: string | null;
  top_scorer: string | null;
  submitted_at: string;
  locked_at: string | null;
  points: number;
  points_breakdown: Record<string, unknown>;
}

interface PoolTeam {
  id: string;
  name: string;
  short_name: string | null;
  external_key: string | null;
}

interface AdminPoolSummary {
  active: number;
  requested: number;
  paymentPending: number;
  paymentsPending: number;
}

type PoolData = {
  summary: PoolSummary | null;
  enrollment: Enrollment | null;
  payments: Payment[];
  scoreRules: ScoreRules | null;
  poolScoringRules: PoolScoringRules | null;
  specialPrediction: SpecialPrediction | null;
  teams: PoolTeam[];
  poolStartsAt: string | null;
  adminSummary: AdminPoolSummary | null;
  eligibleForPrize: boolean;
  prizeRequested: boolean;
  error: string | null;
};

export const Route = createFileRoute("/_authenticated/pool")({
  component: PoolPage,
});

const emptyPayments: Payment[] = [];
const poolQueryKey = (userId: string | null | undefined, isOperator: boolean) =>
  ["pool", userId, isOperator] as const;

function PoolPage() {
  const { user, profile } = useAuth();
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);

  const isOperator = ["admin", "superadmin"].includes(profile?.role ?? "");

  const poolQuery = useQuery({
    queryKey: poolQueryKey(user?.id, isOperator),
    enabled: Boolean(user?.id && profile),
    queryFn: () => fetchPool(user!.id, isOperator),
  });

  const summary = poolQuery.data?.summary ?? null;
  const enrollment = poolQuery.data?.enrollment ?? null;
  const payments = poolQuery.data?.payments ?? emptyPayments;
  const scoreRules = poolQuery.data?.scoreRules ?? null;
  const poolScoringRules = poolQuery.data?.poolScoringRules ?? null;
  const specialPrediction = poolQuery.data?.specialPrediction ?? null;
  const teams = poolQuery.data?.teams ?? [];
  const poolStartsAt = poolQuery.data?.poolStartsAt ?? null;
  const adminSummary = poolQuery.data?.adminSummary ?? null;
  const eligibleForPrize = poolQuery.data?.eligibleForPrize ?? false;
  const prizeRequested = poolQuery.data?.prizeRequested ?? false;
  const loading = poolQuery.isLoading && !poolQuery.data;
  const queryError = poolQuery.error instanceof Error ? poolQuery.error.message : null;
  const error = localError ?? poolQuery.data?.error ?? queryError;
  const refetchPool = poolQuery.refetch;

  useEffect(() => {
    if (!enrollment) return;
    setTermsAccepted(Boolean(enrollment.terms_accepted_at));
  }, [enrollment]);

  useEffect(() => {
    if (typeof window === "undefined" || !enrollment) return;
    const params = new URLSearchParams(window.location.search);
    const transactionNsu = params.get("transaction_nsu");
    const slug = params.get("slug");
    const orderNsu = params.get("order_nsu");
    if (!transactionNsu || !slug || !orderNsu) return;
    const pending = payments.find((payment) => payment.status === "pending");
    if (!pending) return;

    setBusy(true);
    callEdgeFunction<{ paid: boolean }>("infinitepay-payment-check", {
      payment_id: pending.id,
      transaction_nsu: transactionNsu,
      slug,
    })
      .then((result) => {
        setMessage(
          result.paid ? "Pagamento confirmado com segurança." : "Pagamento ainda pendente.",
        );
        window.history.replaceState({}, "", "/pool");
        return refetchPool();
      })
      .catch((caught: Error) => setLocalError(caught.message))
      .finally(() => setBusy(false));
  }, [enrollment, payments, refetchPool]);

  const progress = useMemo(() => {
    if (!summary?.minimum_participants) return 0;
    return Math.min(100, (summary.participants_count / summary.minimum_participants) * 100);
  }, [summary]);

  async function run(operation: () => Promise<unknown>, success: string) {
    setBusy(true);
    setLocalError(null);
    setMessage(null);
    try {
      await operation();
      setMessage(success);
      await refetchPool();
    } catch (caught) {
      setLocalError(caught instanceof Error ? caught.message : "Falha na operação.");
    } finally {
      setBusy(false);
    }
  }

  async function requestEnrollment() {
    await run(
      () =>
        callEdgeFunction("pool-enrollment", { action: "request", terms_accepted: termsAccepted }),
      "Solicitação registrada.",
    );
  }

  async function createCheckout() {
    setBusy(true);
    setLocalError(null);
    try {
      const result = await callEdgeFunction<{ checkout_url?: string; already_active?: boolean }>(
        "pool-create-checkout",
        {},
      );
      if (result.already_active) {
        setMessage("Sua inscrição já está ativa.");
        await refetchPool();
        return;
      }
      if (result.checkout_url) {
        window.open(result.checkout_url, "_blank", "noopener,noreferrer");
        setMessage("Checkout aberto. A inscrição será liberada após confirmação server-side.");
        await refetchPool();
      }
    } catch (caught) {
      setLocalError(
        caught instanceof Error ? caught.message : "Não foi possível criar o checkout.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <MobileShell active="bolao">
      <main className="screen-enter mx-auto max-w-xl space-y-5 px-3 py-5">
        <div className="text-center">
          <div className="mx-auto grid size-14 place-items-center rounded-2xl bg-warning/15 text-warning">
            <BiSolidTrophy className="size-8" />
          </div>
          <p className="eyebrow mt-3 text-brand">Competição oficial</p>
          <h1 className="mt-1 text-3xl font-extrabold tracking-tight">
            {summary?.title ?? "Bolão da Copa 2026"}
          </h1>
          <p className="text-sm text-muted-foreground">
            {summary?.status === "open"
              ? "Inscrições abertas"
              : "Acompanhe o status da competição oficial"}
          </p>
        </div>

        {loading && <p className="text-center text-sm text-muted-foreground">Carregando...</p>}
        {error && (
          <p className="rounded-2xl border border-destructive/20 bg-destructive/10 p-3 text-sm text-destructive">
            {error}
          </p>
        )}
        {message && (
          <p className="rounded-2xl border border-success/20 bg-success/10 p-3 text-sm text-success">
            {message}
          </p>
        )}

        {summary && (
          <>
            <PoolStatusCard summary={summary} enrollment={enrollment} poolStartsAt={poolStartsAt} />

            <div className="grid grid-cols-2 gap-3">
              <Metric icon={BiGroup} label="Inscritos" value={String(summary.participants_count)} />
              <Metric icon={BiCreditCard} label="Entrada" value={money(summary.entry_fee_cents)} />
              <Metric
                icon={BiSolidTrophy}
                label="Prêmio estimado"
                value={money(summary.estimated_prize_cents)}
              />
              <Metric
                icon={BiShieldQuarter}
                label="Premiação"
                value={`${summary.prize_percentage}%`}
              />
            </div>

            <GoalCard summary={summary} progress={progress} />

            <CountdownGrid summary={summary} poolStartsAt={poolStartsAt} />

            <EnrollmentCard
              summary={summary}
              enrollment={enrollment}
              termsAccepted={termsAccepted}
              busy={busy}
              onTermsChange={setTermsAccepted}
              onRequestEnrollment={() => void requestEnrollment()}
              onCreateCheckout={() => void createCheckout()}
            />

            <RulesCard summary={summary} scoreRules={scoreRules} />

            <KnockoutRulesCard rules={poolScoringRules} teams={teams} />

            <SpecialPredictionsCard
              summary={summary}
              userId={user?.id ?? null}
              enrollment={enrollment}
              rules={poolScoringRules}
              prediction={specialPrediction}
              teams={teams}
              busy={busy}
              onSave={(value) =>
                void run(async () => {
                  if (!user?.id) throw new Error("Usuário não autenticado.");
                  const { error: saveError } = await supabase.from("special_predictions").upsert(
                    {
                      pool_id: summary.id,
                      user_id: user.id,
                      champion_team_id: value.champion_team_id || null,
                      runner_up_team_id: value.runner_up_team_id || null,
                      third_place_team_id: value.third_place_team_id || null,
                      top_scorer: value.top_scorer.trim() || null,
                    },
                    { onConflict: "pool_id,user_id" },
                  );
                  if (saveError) throw new Error(saveError.message);
                }, "Apostas especiais salvas.")
              }
            />

            {payments.length > 0 && <PaymentsCard payments={payments} />}

            {isOperator && adminSummary && <OperatorSummaryCard summary={adminSummary} />}

            {eligibleForPrize && (
              <Card className="glass-card border-warning/30">
                <CardContent className="space-y-3 p-4">
                  <p className="font-bold">Você está elegível para solicitar prêmio.</p>
                  <Button
                    disabled={busy || prizeRequested}
                    onClick={() =>
                      void run(
                        () => callEdgeFunction("pool-enrollment", { action: "request_prize" }),
                        "Solicitação de prêmio registrada.",
                      )
                    }
                  >
                    {prizeRequested ? "Prêmio já solicitado" : "Solicitar prêmio"}
                  </Button>
                </CardContent>
              </Card>
            )}
          </>
        )}
      </main>
    </MobileShell>
  );
}

function PoolStatusCard({
  summary,
  enrollment,
  poolStartsAt,
}: {
  summary: PoolSummary;
  enrollment: Enrollment | null;
  poolStartsAt: string | null;
}) {
  const phase = getPoolPhase(summary, poolStartsAt);

  return (
    <Card className="glass-card overflow-hidden border-brand/25">
      <div className="h-1 bg-brand" />
      <CardContent className="space-y-4 p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="eyebrow text-brand">Status do bolão</p>
            <h2 className="mt-1 text-2xl font-extrabold tracking-tight">{summary.title}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{phase.description}</p>
          </div>
          <StatusPill label={phase.label} tone={phase.tone} />
        </div>
        <div className="rounded-3xl bg-muted/55 p-4">
          <p className="text-xs font-bold uppercase text-muted-foreground">Minha inscrição</p>
          <div className="mt-2">
            <EnrollmentStatus status={enrollment?.status ?? "none"} />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function GoalCard({ summary, progress }: { summary: PoolSummary; progress: number }) {
  return (
    <Card className="glass-card">
      <CardContent className="space-y-2 p-4">
        <div className="flex justify-between text-xs">
          <span>Meta mínima</span>
          <span>
            {summary.participants_count}/{summary.minimum_participants}
          </span>
        </div>
        <Progress value={progress} />
        {summary.prize_description && (
          <p className="text-xs text-muted-foreground">{summary.prize_description}</p>
        )}
      </CardContent>
    </Card>
  );
}

function CountdownGrid({
  summary,
  poolStartsAt,
}: {
  summary: PoolSummary;
  poolStartsAt: string | null;
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <CountdownCard
        title="Inscrições abrem em"
        target={summary.enrollment_opens_at}
        fallback={
          summary.enrollments_mode === "coming_soon"
            ? "Data de abertura a definir."
            : "Inscrições disponíveis conforme status do bolão."
        }
      />
      <CountdownCard
        title="Bolão começa em"
        target={poolStartsAt}
        fallback="Data inicial dos jogos ainda não disponível."
      />
    </div>
  );
}

function CountdownCard({
  title,
  target,
  fallback,
}: {
  title: string;
  target: string | null;
  fallback: string;
}) {
  const targetDate = useMemo(() => (target ? new Date(target) : null), [target]);
  const [timeLeft, setTimeLeft] = useState(() => (targetDate ? calcTimeLeft(targetDate) : null));

  useEffect(() => {
    if (!targetDate) {
      setTimeLeft(null);
      return;
    }
    setTimeLeft(calcTimeLeft(targetDate));
    const id = window.setInterval(() => setTimeLeft(calcTimeLeft(targetDate)), 30_000);
    return () => window.clearInterval(id);
  }, [targetDate]);

  return (
    <Card className="glass-card">
      <CardContent className="p-4">
        <div className="flex items-center gap-2">
          <div className="grid size-9 place-items-center rounded-xl bg-brand/12 text-brand">
            <BiCalendar className="size-5" />
          </div>
          <p className="font-extrabold">{title}</p>
        </div>
        {targetDate && timeLeft ? (
          <div className="mt-3 grid grid-cols-3 gap-2 text-center">
            <TimePart label="dias" value={timeLeft.days} />
            <TimePart label="horas" value={timeLeft.hours} />
            <TimePart label="min" value={timeLeft.minutes} />
          </div>
        ) : (
          <p className="mt-3 text-sm text-muted-foreground">
            {targetDate ? "Já começou." : fallback}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function TimePart({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl bg-muted/65 px-2 py-2">
      <p className="text-xl font-extrabold tabular-nums">{String(value).padStart(2, "0")}</p>
      <p className="text-[10px] font-bold uppercase text-muted-foreground">{label}</p>
    </div>
  );
}

function EnrollmentCard({
  summary,
  enrollment,
  termsAccepted,
  busy,
  onTermsChange,
  onRequestEnrollment,
  onCreateCheckout,
}: {
  summary: PoolSummary;
  enrollment: Enrollment | null;
  termsAccepted: boolean;
  busy: boolean;
  onTermsChange: (checked: boolean) => void;
  onRequestEnrollment: () => void;
  onCreateCheckout: () => void;
}) {
  const closed = summary.status === "closed" || summary.enrollments_mode === "closed";
  const comingSoon = !enrollment && summary.enrollments_mode === "coming_soon";

  return (
    <Card className="glass-card overflow-hidden">
      <CardHeader>
        <CardTitle className="text-base">Inscrição</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {comingSoon && (
          <div className="rounded-2xl bg-muted/60 p-4 text-sm text-muted-foreground">
            <p className="font-bold text-foreground">Inscrições em breve</p>
            <p className="mt-1">
              {summary.coming_soon_message ?? "A abertura será anunciada aqui."}
            </p>
          </div>
        )}
        {!enrollment && !comingSoon && (
          <>
            <div className="max-h-36 overflow-y-auto rounded-2xl bg-muted/70 p-4 text-xs leading-relaxed text-muted-foreground">
              {summary.terms}
            </div>
            <div className="flex items-start gap-2">
              <Checkbox
                id="terms"
                checked={termsAccepted}
                onCheckedChange={(value) => onTermsChange(value === true)}
              />
              <Label htmlFor="terms" className="text-sm leading-snug">
                Li e aceito os termos de participação.
              </Label>
            </div>
            <Button
              className="h-11 w-full rounded-2xl"
              disabled={busy || !termsAccepted || closed}
              onClick={onRequestEnrollment}
            >
              {closed ? "Inscrições encerradas" : "Entrar no bolão"}
            </Button>
          </>
        )}
        {enrollment && ["requested", "payment_pending"].includes(enrollment.status) && (
          <div className="space-y-2">
            {summary.entry_fee_cents > 0 && summary.status === "open" && (
              <Button
                className="h-11 w-full rounded-2xl"
                disabled={busy}
                onClick={onCreateCheckout}
              >
                <BiCreditCard className="size-5" />
                Pagar inscrição
              </Button>
            )}
            <p className="text-xs text-muted-foreground">
              O pagamento passa pela confirmação segura já existente. Sua inscrição ativa aparecerá
              aqui quando for confirmada.
            </p>
          </div>
        )}
        {enrollment && ["active", "confirmed", "paid"].includes(enrollment.status) && (
          <div className="rounded-2xl border border-success/25 bg-success/10 p-4 text-sm text-success">
            <p className="font-extrabold">Inscrição confirmada</p>
            <p className="mt-1 text-xs">Você já está participando do ranking oficial do bolão.</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function RulesCard({
  summary,
  scoreRules,
}: {
  summary: PoolSummary;
  scoreRules: ScoreRules | null;
}) {
  return (
    <Card className="glass-card">
      <CardContent className="p-0">
        <Accordion type="single" collapsible defaultValue="rules">
          <AccordionItem value="rules" className="border-b-0 px-4">
            <AccordionTrigger className="py-4 font-extrabold hover:no-underline">
              <span className="flex items-center gap-2">
                <BiInfoCircle className="size-5 text-brand" />
                Regras do bolão
              </span>
            </AccordionTrigger>
            <AccordionContent className="space-y-3 pb-4 text-sm text-muted-foreground">
              <RuleLine
                title="Pontuação"
                text={
                  scoreRules
                    ? `Placar exato vale ${scoreRules.exact_score_points ?? 0}; resultado correto vale ${scoreRules.outcome_points ?? 0}; bônus de saldo vale ${scoreRules.goal_difference_bonus ?? 0}.`
                    : "A pontuação segue a configuração atual do bolão."
                }
              />
              <RuleLine
                title="Prazo dos palpites"
                text="Cada palpite bloqueia automaticamente no início da partida."
              />
              <RuleLine
                title="Ranking oficial"
                text="O ranking do Bolão considera participantes com inscrição confirmada."
              />
              <RuleLine
                title="Inscrição e prêmio"
                text={
                  summary.prize_description ||
                  `Entrada de ${money(summary.entry_fee_cents)} e ${summary.prize_percentage}% destinado à premiação.`
                }
              />
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </CardContent>
    </Card>
  );
}

function KnockoutRulesCard({
  rules,
  teams,
}: {
  rules: PoolScoringRules | null;
  teams: PoolTeam[];
}) {
  const stageWeights = rules?.stage_weights ?? defaultKnockoutStageWeights;
  const basePoints = rules?.base_points ?? defaultKnockoutBasePoints;
  const specialPoints = rules?.special_points ?? defaultSpecialPoints;
  const multipliers = rules?.team_multipliers ?? {};
  const multiplierEntries = Object.entries(multipliers)
    .map(([teamId, multiplier]) => ({
      team: teams.find((team) => team.id === teamId || team.external_key === teamId),
      multiplier,
    }))
    .filter((item) => item.multiplier > 1);

  return (
    <Card className="glass-card border-brand/20">
      <CardHeader>
        <CardTitle className="text-base">Regras do mata-mata</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <div className="grid grid-cols-2 gap-2">
          {Object.entries(stageWeights).map(([stage, weight]) => (
            <MiniStat key={stage} label={knockoutStageLabel(stage) ?? stage} value={`x${weight}`} />
          ))}
        </div>
        <div className="rounded-2xl bg-muted/55 p-3 text-muted-foreground">
          <p className="font-bold text-foreground">Pontuação por jogo</p>
          <p className="mt-1">
            Placar exato: {basePoints.exact_score ?? 3}; resultado no tempo regulamentar:{" "}
            {basePoints.regulation_result ?? 1}; classificado: {basePoints.qualified_team ?? 2};
            método: {basePoints.qualification_method ?? 1}; combo perfeito:{" "}
            {basePoints.perfect_combo ?? 1}.
          </p>
        </div>
        <div className="rounded-2xl bg-muted/55 p-3 text-muted-foreground">
          <p className="font-bold text-foreground">Apostas especiais</p>
          <p className="mt-1">
            Campeão: {specialPoints.champion ?? 60}; vice: {specialPoints.runner_up ?? 35}; 3º
            lugar: {specialPoints.third_place ?? 25}; artilheiro: {specialPoints.top_scorer ?? 40};
            pódio perfeito: {specialPoints.perfect_podium ?? 30}.
          </p>
        </div>
        <div className="rounded-2xl bg-muted/55 p-3">
          <p className="font-bold">Multiplicadores por time</p>
          {multiplierEntries.length > 0 ? (
            <div className="mt-2 flex flex-wrap gap-2">
              {multiplierEntries.map((item) => (
                <span
                  key={item.team?.id ?? String(item.multiplier)}
                  className="rounded-full bg-brand/10 px-2 py-1 text-xs font-bold text-brand"
                >
                  {item.team?.short_name || item.team?.name || "Time"} x{item.multiplier}
                </span>
              ))}
            </div>
          ) : (
            <p className="mt-1 text-xs text-muted-foreground">Nenhum multiplicador ativo.</p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function SpecialPredictionsCard({
  summary,
  userId,
  enrollment,
  rules,
  prediction,
  teams,
  busy,
  onSave,
}: {
  summary: PoolSummary;
  userId: string | null;
  enrollment: Enrollment | null;
  rules: PoolScoringRules | null;
  prediction: SpecialPrediction | null;
  teams: PoolTeam[];
  busy: boolean;
  onSave: (value: {
    champion_team_id: string;
    runner_up_team_id: string;
    third_place_team_id: string;
    top_scorer: string;
  }) => void;
}) {
  const enrolled = Boolean(
    enrollment && ["active", "confirmed", "paid"].includes(enrollment.status),
  );
  const lockAt = rules?.specials_lock_at ? new Date(rules.specials_lock_at) : null;
  const locked = Boolean(lockAt && lockAt <= new Date());
  const [form, setForm] = useState({
    champion_team_id: prediction?.champion_team_id ?? "",
    runner_up_team_id: prediction?.runner_up_team_id ?? "",
    third_place_team_id: prediction?.third_place_team_id ?? "",
    top_scorer: prediction?.top_scorer ?? "",
  });

  useEffect(() => {
    setForm({
      champion_team_id: prediction?.champion_team_id ?? "",
      runner_up_team_id: prediction?.runner_up_team_id ?? "",
      third_place_team_id: prediction?.third_place_team_id ?? "",
      top_scorer: prediction?.top_scorer ?? "",
    });
  }, [prediction]);

  const readonly = !userId || !enrolled || locked;

  return (
    <Card className="glass-card border-warning/25">
      <CardHeader>
        <CardTitle className="text-base">Apostas especiais</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">
          Palpites de campeão, vice, 3º lugar e artilheiro do bolão.
        </p>
        {lockAt && (
          <p className="rounded-2xl bg-muted/55 p-3 text-xs text-muted-foreground">
            Lock: {lockAt.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}
          </p>
        )}
        {!enrolled && (
          <p className="rounded-2xl border border-dashed border-border p-3 text-sm text-muted-foreground">
            Confirme sua inscrição no {summary.title} para enviar apostas especiais.
          </p>
        )}
        <div className="grid gap-3 sm:grid-cols-2">
          <TeamField
            id="special-champion"
            label="Campeão"
            value={form.champion_team_id}
            teams={teams}
            disabled={readonly || busy}
            onChange={(value) => setForm((current) => ({ ...current, champion_team_id: value }))}
          />
          <TeamField
            id="special-runner-up"
            label="Vice"
            value={form.runner_up_team_id}
            teams={teams}
            disabled={readonly || busy}
            onChange={(value) => setForm((current) => ({ ...current, runner_up_team_id: value }))}
          />
          <TeamField
            id="special-third-place"
            label="3º lugar"
            value={form.third_place_team_id}
            teams={teams}
            disabled={readonly || busy}
            onChange={(value) => setForm((current) => ({ ...current, third_place_team_id: value }))}
          />
          <div className="space-y-1.5">
            <Label htmlFor="special-top-scorer">Artilheiro</Label>
            <Input
              id="special-top-scorer"
              value={form.top_scorer}
              disabled={readonly || busy}
              onChange={(event) =>
                setForm((current) => ({ ...current, top_scorer: event.target.value }))
              }
            />
          </div>
        </div>
        {prediction && (
          <p className="text-xs font-bold text-muted-foreground">
            Pontuação especial atual: {prediction.points} pts
          </p>
        )}
        {!readonly && (
          <Button className="w-full" disabled={busy} onClick={() => onSave(form)}>
            {prediction ? "Salvar apostas especiais" : "Enviar apostas especiais"}
          </Button>
        )}
        {locked && (
          <p className="text-xs text-muted-foreground">Apostas especiais bloqueadas para edição.</p>
        )}
      </CardContent>
    </Card>
  );
}

function TeamField({
  id,
  label,
  value,
  teams,
  disabled,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  teams: PoolTeam[];
  disabled?: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <select
        id={id}
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        className="h-11 w-full rounded-xl border border-input bg-background/65 px-3 text-sm"
      >
        <option value="">Selecione</option>
        {teams.map((team) => (
          <option key={team.id} value={team.id}>
            {team.name}
          </option>
        ))}
      </select>
    </div>
  );
}

function RuleLine({ title, text }: { title: string; text: string }) {
  return (
    <div className="rounded-2xl bg-muted/55 p-3">
      <p className="font-bold text-foreground">{title}</p>
      <p className="mt-1">{text}</p>
    </div>
  );
}

function PaymentsCard({ payments }: { payments: Payment[] }) {
  return (
    <Card className="glass-card">
      <CardHeader>
        <CardTitle className="text-base">Pagamentos</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {payments.map((payment) => (
          <div
            key={payment.id}
            className="flex items-center justify-between rounded-2xl bg-muted/70 p-3"
          >
            <div>
              <p className="text-sm font-bold">{money(payment.amount_cents)}</p>
              <p className="text-xs text-muted-foreground">{paymentStatusLabel(payment.status)}</p>
            </div>
            <div className="flex gap-1">
              {payment.checkout_url && payment.status === "pending" && (
                <Button asChild size="icon" variant="ghost" aria-label="Abrir pagamento">
                  <a href={payment.checkout_url} target="_blank" rel="noreferrer">
                    <BiLinkExternal className="size-5" />
                  </a>
                </Button>
              )}
              {payment.receipt_url && (
                <Button asChild size="icon" variant="ghost" aria-label="Abrir comprovante">
                  <a href={payment.receipt_url} target="_blank" rel="noreferrer">
                    <BiReceipt className="size-5" />
                  </a>
                </Button>
              )}
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function OperatorSummaryCard({ summary }: { summary: AdminPoolSummary }) {
  return (
    <Card className="glass-card border-brand/25">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <BiShieldQuarter className="size-5 text-brand" />
          Operação do bolão
        </CardTitle>
      </CardHeader>
      <CardContent className="grid grid-cols-2 gap-2 text-sm">
        <MiniStat label="Ativos" value={summary.active} />
        <MiniStat label="Solicitados" value={summary.requested} />
        <MiniStat label="Inscrições pendentes" value={summary.paymentPending} />
        <MiniStat label="Pagamentos pendentes" value={summary.paymentsPending} />
      </CardContent>
    </Card>
  );
}

function MiniStat({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-2xl bg-muted/60 p-3">
      <p className="text-xl font-extrabold tabular-nums">{value}</p>
      <p className="text-[10px] font-bold uppercase text-muted-foreground">{label}</p>
    </div>
  );
}

type Tone = "brand" | "success" | "warning" | "neutral";

function StatusPill({ label, tone }: { label: string; tone: Tone }) {
  const className =
    tone === "success"
      ? "bg-success/12 text-success ring-success/20"
      : tone === "warning"
        ? "bg-warning/15 text-warning ring-warning/25"
        : tone === "brand"
          ? "bg-brand/12 text-brand ring-brand/20"
          : "bg-muted text-muted-foreground ring-border";

  return (
    <span className={`shrink-0 rounded-full px-3 py-1 text-xs font-extrabold ring-1 ${className}`}>
      {label}
    </span>
  );
}

function getPoolPhase(summary: PoolSummary, poolStartsAt: string | null) {
  const startsAt = poolStartsAt ? new Date(poolStartsAt) : null;
  if (summary.status === "closed") {
    return {
      label: "Bolão encerrado",
      tone: "neutral" as const,
      description: "A competição oficial já foi encerrada.",
    };
  }
  if (startsAt && startsAt <= new Date()) {
    return {
      label: "Bolão iniciado",
      tone: "success" as const,
      description: "Acompanhe seu desempenho pelo ranking oficial do bolão.",
    };
  }
  if (summary.enrollments_mode === "coming_soon") {
    return {
      label: "Inscrições em breve",
      tone: "warning" as const,
      description: "Prepare-se para entrar quando as inscrições abrirem.",
    };
  }
  if (summary.status === "open") {
    return {
      label: "Inscrições abertas",
      tone: "brand" as const,
      description: "Entre no bolão, confirme a inscrição e acompanhe seu status aqui.",
    };
  }
  return {
    label: "Bolão em breve",
    tone: "warning" as const,
    description: "A competição oficial será liberada conforme a configuração atual.",
  };
}

type TimeLeft = { days: number; hours: number; minutes: number };

function calcTimeLeft(target: Date): TimeLeft | null {
  const diff = target.getTime() - Date.now();
  if (diff <= 0) return null;
  return {
    days: Math.floor(diff / 86_400_000),
    hours: Math.floor((diff % 86_400_000) / 3_600_000),
    minutes: Math.floor((diff % 3_600_000) / 60_000),
  };
}

function Metric({ icon: Icon, label, value }: { icon: IconType; label: string; value: string }) {
  return (
    <Card className="glass-card interactive-card">
      <CardContent className="p-4">
        <div className="grid size-9 place-items-center rounded-xl bg-brand/12 text-brand">
          <Icon className="size-5" />
        </div>
        <p className="mt-2 text-xl font-extrabold">{value}</p>
        <p className="text-[11px] text-muted-foreground">{label}</p>
      </CardContent>
    </Card>
  );
}

function EnrollmentStatus({ status }: { status: string }) {
  const map: Record<string, { icon: IconType; label: string; className: string }> = {
    none: { icon: BiTimeFive, label: "Não inscrito", className: "text-muted-foreground" },
    requested: { icon: BiTimeFive, label: "Solicitação enviada", className: "text-warning" },
    payment_pending: { icon: BiTimeFive, label: "Pagamento pendente", className: "text-warning" },
    active: { icon: BiCheckCircle, label: "Inscrição confirmada", className: "text-success" },
    confirmed: { icon: BiCheckCircle, label: "Inscrição confirmada", className: "text-success" },
    paid: { icon: BiCheckCircle, label: "Pagamento confirmado", className: "text-success" },
    rejected: { icon: BiTimeFive, label: "Solicitação recusada", className: "text-destructive" },
    cancelled: {
      icon: BiTimeFive,
      label: "Inscrição cancelada",
      className: "text-muted-foreground",
    },
  };
  const item = map[status] ?? map.none;
  const Icon = item.icon;
  return (
    <div className={`flex items-center gap-2 font-bold ${item.className}`}>
      <Icon className="size-5" />
      {item.label}
    </div>
  );
}

function paymentStatusLabel(status: string) {
  const map: Record<string, string> = {
    pending: "Aguardando pagamento",
    paid: "Pagamento recebido",
    confirmed: "Pagamento confirmado",
    failed: "Pagamento não concluído",
    cancelled: "Pagamento cancelado",
    refunded: "Pagamento estornado",
  };
  return map[status] ?? "Status em análise";
}

function money(cents: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(cents / 100);
}

async function fetchPool(userId: string, isOperator: boolean): Promise<PoolData> {
  const [
    summaryResult,
    enrollmentResult,
    prizeResult,
    rankingResult,
    scoreResult,
    firstMatchResult,
    teamsResult,
  ] = await Promise.all([
    supabase.from("pool_public_summary").select("*").maybeSingle(),
    supabase
      .from("enrollments")
      .select("id,status,terms_accepted_at")
      .eq("user_id", userId)
      .maybeSingle(),
    supabase.from("prize_requests").select("id,status").eq("user_id", userId).maybeSingle(),
    supabase.from("ranking_pool").select("rank_position").eq("user_id", userId).maybeSingle(),
    supabase
      .from("score_rules")
      .select("exact_score_points,outcome_points,goal_difference_bonus")
      .order("created_at")
      .limit(1)
      .maybeSingle(),
    supabase.from("matches").select("kickoff_at").order("kickoff_at").limit(1).maybeSingle(),
    supabase.from("teams").select("id,name,short_name,external_key").order("name"),
  ]);
  const summary = summaryResult.data as PoolSummary | null;
  const enrollment = enrollmentResult.data as Enrollment | null;
  const teams = (teamsResult.data ?? []) as PoolTeam[];
  let payments: Payment[] = [];
  let adminSummary: AdminPoolSummary | null = null;
  let poolScoringRules: PoolScoringRules | null = null;
  let specialPrediction: SpecialPrediction | null = null;
  let poolExtrasError: string | null = null;

  if (summary?.id) {
    const [poolScoringResult, specialPredictionResult] = await Promise.all([
      supabase
        .from("pool_scoring_rules")
        .select(
          "id,pool_id,stage_weights,base_points,team_multipliers,special_points,special_results,specials_lock_at",
        )
        .eq("pool_id", summary.id)
        .maybeSingle(),
      supabase
        .from("special_predictions")
        .select(
          "id,champion_team_id,runner_up_team_id,third_place_team_id,top_scorer,submitted_at,locked_at,points,points_breakdown",
        )
        .eq("pool_id", summary.id)
        .eq("user_id", userId)
        .maybeSingle(),
    ]);
    poolScoringRules = poolScoringResult.data as PoolScoringRules | null;
    specialPrediction = specialPredictionResult.data as SpecialPrediction | null;
    poolExtrasError =
      poolScoringResult.error?.message ?? specialPredictionResult.error?.message ?? null;
  }

  if (enrollment) {
    const { data } = await supabase
      .from("payments")
      .select("id,status,provider,checkout_url,receipt_url,amount_cents")
      .eq("enrollment_id", enrollment.id)
      .order("created_at", { ascending: false });
    payments = (data ?? []) as Payment[];
  }

  if (isOperator) {
    const [allEnrollmentsResult, allPaymentsResult] = await Promise.all([
      supabase.from("enrollments").select("status"),
      supabase.from("payments").select("status"),
    ]);
    const enrollments = (allEnrollmentsResult.data ?? []) as Array<{ status: string }>;
    const allPayments = (allPaymentsResult.data ?? []) as Array<{ status: string }>;
    adminSummary = {
      active: enrollments.filter((item) => ["active", "confirmed", "paid"].includes(item.status))
        .length,
      requested: enrollments.filter((item) => item.status === "requested").length,
      paymentPending: enrollments.filter((item) => item.status === "payment_pending").length,
      paymentsPending: allPayments.filter((item) => item.status === "pending").length,
    };
  }

  return {
    summary,
    enrollment,
    payments,
    scoreRules: scoreResult.data as ScoreRules | null,
    poolScoringRules,
    specialPrediction,
    teams,
    poolStartsAt: firstMatchResult.data?.kickoff_at ?? null,
    adminSummary,
    eligibleForPrize:
      summary?.status === "closed" &&
      Boolean(rankingResult.data && Number(rankingResult.data.rank_position) <= 3),
    prizeRequested: Boolean(prizeResult.data),
    error:
      summaryResult.error?.message ??
      enrollmentResult.error?.message ??
      prizeResult.error?.message ??
      rankingResult.error?.message ??
      scoreResult.error?.message ??
      firstMatchResult.error?.message ??
      teamsResult.error?.message ??
      poolExtrasError ??
      null,
  };
}
