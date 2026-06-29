import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  BiCalendar,
  BiCheckCircle,
  BiChevronDown,
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { callEdgeFunction } from "@/lib/edge";
import { cn } from "@/lib/utils";
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
  enrollment_closes_at: string | null;
  pool_ends_at: string | null;
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
  refundPending: number;
  paymentsPending: number;
}

interface PrizeRequest {
  id: string;
  status: string;
  pix_key: string | null;
}

type PoolData = {
  summary: PoolSummary | null;
  enrollment: Enrollment | null;
  payments: Payment[];
  scoreRules: ScoreRules | null;
  poolScoringRules: PoolScoringRules | null;
  specialPrediction: SpecialPrediction | null;
  teams: PoolTeam[];
  poolEndsFallbackAt: string | null;
  adminSummary: AdminPoolSummary | null;
  eligibleForPrize: boolean;
  prizeRequest: PrizeRequest | null;
  error: string | null;
};

type PoolPhaseKind = "before_enrollment" | "enrollment_open" | "running" | "ended" | "blocked";

type PoolPhase = {
  kind: PoolPhaseKind;
  title: string;
  label: string;
  description: string;
  target: Date | null;
  tone: Tone;
  ctaEnabled: boolean;
  ctaDisabledReason: string;
};

export const Route = createFileRoute("/_authenticated/pool")({
  component: PoolPage,
});

const emptyPayments: Payment[] = [];
const poolQueryKey = (userId: string | null | undefined, isOperator: boolean) =>
  ["pool", userId, isOperator] as const;
const softTabTriggerClass =
  "rounded-xl text-muted-foreground transition-all hover:bg-brand/10 hover:text-brand data-[state=active]:bg-brand/12 data-[state=active]:text-brand data-[state=active]:shadow-none data-[state=active]:ring-1 data-[state=active]:ring-brand/15";

function PoolPage() {
  const { user, profile } = useAuth();
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [termsDialogOpen, setTermsDialogOpen] = useState(false);
  const [prizePixKey, setPrizePixKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);

  const isOperator = ["admin", "superadmin"].includes(profile?.role ?? "");

  const poolQuery = useQuery({
    queryKey: poolQueryKey(user?.id, isOperator),
    enabled: Boolean(user?.id && profile),
    queryFn: () => fetchPool(user!.id, isOperator),
    refetchOnWindowFocus: true,
    refetchInterval: (query) => {
      const status = query.state.data?.enrollment?.status;
      return status === "requested" || status === "payment_pending" ? 10_000 : false;
    },
  });

  const summary = poolQuery.data?.summary ?? null;
  const enrollment = poolQuery.data?.enrollment ?? null;
  const payments = poolQuery.data?.payments ?? emptyPayments;
  const scoreRules = poolQuery.data?.scoreRules ?? null;
  const poolScoringRules = poolQuery.data?.poolScoringRules ?? null;
  const specialPrediction = poolQuery.data?.specialPrediction ?? null;
  const teams = poolQuery.data?.teams ?? [];
  const poolEndsFallbackAt = poolQuery.data?.poolEndsFallbackAt ?? null;
  const adminSummary = poolQuery.data?.adminSummary ?? null;
  const eligibleForPrize = poolQuery.data?.eligibleForPrize ?? false;
  const prizeRequest = poolQuery.data?.prizeRequest ?? null;
  const loading = poolQuery.isLoading && !poolQuery.data;
  const queryError = poolQuery.error instanceof Error ? poolQuery.error.message : null;
  const error = localError ?? poolQuery.data?.error ?? queryError;
  const refetchPool = poolQuery.refetch;

  const phase = useMemo(
    () => (summary ? getPoolPhase(summary, poolEndsFallbackAt) : null),
    [summary, poolEndsFallbackAt],
  );
  const specialsLockAt = poolScoringRules?.specials_lock_at
    ? new Date(poolScoringRules.specials_lock_at)
    : null;
  const specialsLocked = Boolean(specialsLockAt && specialsLockAt <= new Date());
  const specialsPending = Boolean(
    isActiveEnrollment(enrollment?.status) && !specialPrediction && !specialsLocked,
  );

  useEffect(() => {
    if (!enrollment) return;
    setTermsAccepted(Boolean(enrollment.terms_accepted_at));
  }, [enrollment]);

  useEffect(() => {
    setPrizePixKey(prizeRequest?.pix_key ?? "");
  }, [prizeRequest?.pix_key]);

  useEffect(() => {
    if (!user?.id) return;
    let channel = supabase
      .channel(`pool-status-${user.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "enrollments", filter: `user_id=eq.${user.id}` },
        () => void refetchPool(),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "prize_requests", filter: `user_id=eq.${user.id}` },
        () => void refetchPool(),
      );

    if (enrollment?.id) {
      channel = channel.on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "payments",
          filter: `enrollment_id=eq.${enrollment.id}`,
        },
        () => void refetchPool(),
      );
    }

    channel.subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [enrollment?.id, refetchPool, user?.id]);

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

  async function run(operation: () => Promise<unknown>, success: string, friendlyError?: string) {
    setBusy(true);
    setLocalError(null);
    setMessage(null);
    try {
      await operation();
      setMessage(success);
      toast.success(success);
      await refetchPool();
    } catch (caught) {
      const detail = friendlyError ?? friendlyPoolError(caught);
      setLocalError(detail);
      toast.error(detail);
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
    setTermsDialogOpen(false);
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
          <p className="eyebrow mt-3 text-brand">Bolão oficial</p>
          <h1 className="mt-1 text-3xl font-extrabold tracking-tight">
            {summary?.title ?? "Bolão da Copa 2026"}
          </h1>
          <p className="text-sm text-muted-foreground">
            Inscrição, palpites especiais e premiação do ranking oficial.
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

        {!loading && !summary && (
          <Card className="glass-card border-muted/70">
            <CardContent className="p-5 text-center">
              <p className="font-extrabold">Nenhum bolão ativo no momento.</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Quando um novo bolão abrir, ele aparecerá aqui.
              </p>
            </CardContent>
          </Card>
        )}

        {summary && phase && (
          <>
            <Tabs defaultValue="status" className="space-y-3">
              <TabsList className="grid h-auto w-full grid-cols-3 gap-1 rounded-2xl bg-muted/45 p-1 ring-1 ring-border/40">
                <TabsTrigger value="status" className={softTabTriggerClass}>
                  Status
                </TabsTrigger>
                <TabsTrigger value="prizes" className={softTabTriggerClass}>
                  Premiação
                </TabsTrigger>
                <TabsTrigger value="specials" className={cn(softTabTriggerClass, "relative")}>
                  Especiais
                  {specialsPending && (
                    <span className="absolute right-2 top-2 size-2 rounded-full bg-destructive ring-2 ring-background" />
                  )}
                </TabsTrigger>
              </TabsList>

              <TabsContent value="status" className="space-y-3">
                <PoolStatusCard
                  summary={summary}
                  phase={phase}
                  enrollment={enrollment}
                  payments={payments}
                  busy={busy}
                  onOpenTerms={() => setTermsDialogOpen(true)}
                  onCreateCheckout={() => void createCheckout()}
                />
                <RulesCard summary={summary} />
                <KnockoutRulesCard rules={poolScoringRules} teams={teams} />
                {isOperator && adminSummary && <OperatorSummaryCard summary={adminSummary} />}
              </TabsContent>

              <TabsContent value="prizes" className="space-y-3">
                <PrizeTab
                  summary={summary}
                  phase={phase}
                  eligibleForPrize={eligibleForPrize}
                  prizeRequest={prizeRequest}
                  prizePixKey={prizePixKey}
                  busy={busy}
                  onPrizePixKeyChange={setPrizePixKey}
                  onRequestPrize={() =>
                    void run(
                      () =>
                        callEdgeFunction("pool-enrollment", {
                          action: "request_prize",
                          pix_key: prizePixKey.trim(),
                        }),
                      "Solicitação de prêmio registrada.",
                    )
                  }
                />
              </TabsContent>

              <TabsContent value="specials">
                <SpecialPredictionsCard
                  userId={user?.id ?? null}
                  enrollment={enrollment}
                  rules={poolScoringRules}
                  prediction={specialPrediction}
                  teams={teams}
                  busy={busy}
                  onSave={(value) =>
                    void run(async () => {
                      if (!user?.id) throw new Error("Usuário não autenticado.");
                      const lockAt = poolScoringRules?.specials_lock_at
                        ? new Date(poolScoringRules.specials_lock_at)
                        : null;
                      if (lockAt && lockAt <= new Date()) {
                        throw new Error("special_predictions_locked");
                      }

                      const { error: saveError } = await supabase
                        .from("special_predictions")
                        .upsert(
                          {
                            pool_id: summary.id,
                            user_id: user.id,
                            champion_team_id: value.champion_team_id || null,
                            runner_up_team_id: value.runner_up_team_id || null,
                            third_place_team_id: value.third_place_team_id || null,
                            top_scorer: null,
                          },
                          { onConflict: "pool_id,user_id" },
                        );
                      if (saveError) throw new Error(saveError.message);
                    }, "Palpites especiais salvos.")
                  }
                />
              </TabsContent>
            </Tabs>

            <TermsDialog
              open={termsDialogOpen}
              summary={summary}
              phase={phase}
              accepted={termsAccepted}
              busy={busy}
              onAcceptedChange={setTermsAccepted}
              onOpenChange={setTermsDialogOpen}
              onConfirm={() => void requestEnrollment()}
            />
          </>
        )}
      </main>
    </MobileShell>
  );
}

function PoolStatusCard({
  summary,
  phase,
  enrollment,
  payments,
  busy,
  onOpenTerms,
  onCreateCheckout,
}: {
  summary: PoolSummary;
  phase: PoolPhase;
  enrollment: Enrollment | null;
  payments: Payment[];
  busy: boolean;
  onOpenTerms: () => void;
  onCreateCheckout: () => void;
}) {
  const status = enrollment?.status ?? "none";
  const canPay =
    Boolean(enrollment) &&
    ["requested", "payment_pending"].includes(status) &&
    summary.entry_fee_cents > 0 &&
    phase.kind !== "ended";
  const statusHelp = enrollmentStatusHelp(status);
  const visiblePayments = isActiveEnrollment(status)
    ? payments.filter((payment) => !["paid", "confirmed"].includes(payment.status))
    : payments;

  return (
    <Card className="glass-card overflow-hidden border-brand/25">
      <div className="h-1 bg-brand" />
      <CardContent className="space-y-4 p-5">
        <div className="flex items-center justify-between gap-3">
          <p className="eyebrow min-w-0 text-brand">Status do bolão</p>
          <StatusPill label={phase.label} tone={phase.tone} />
        </div>

        <PoolCountdownBlock phase={phase} />

        <div className="rounded-2xl bg-muted/55 p-4">
          <p className="text-xs font-bold uppercase text-muted-foreground">Minha inscrição</p>
          <div className="mt-2">
            <EnrollmentStatus status={status} />
          </div>
          {statusHelp && <p className="mt-2 text-xs text-muted-foreground">{statusHelp}</p>}
        </div>

        {!enrollment && (
          <div className="space-y-2">
            <Button
              className="h-11 w-full rounded-2xl"
              disabled={busy || !phase.ctaEnabled}
              onClick={onOpenTerms}
            >
              {!phase.ctaEnabled && <BiLockAlt className="size-5" />}
              Entrar no bolão
            </Button>
            {!phase.ctaEnabled && (
              <p className="text-xs text-muted-foreground">{phase.ctaDisabledReason}</p>
            )}
          </div>
        )}

        {canPay && (
          <div className="space-y-2">
            <Button className="h-11 w-full rounded-2xl" disabled={busy} onClick={onCreateCheckout}>
              <BiCreditCard className="size-5" />
              Pagar inscrição
            </Button>
            <p className="text-xs text-muted-foreground">
              A confirmação do pagamento atualiza esta tela automaticamente em poucos segundos.
            </p>
          </div>
        )}

        {visiblePayments.length > 0 && <PaymentsList payments={visiblePayments} />}
      </CardContent>
    </Card>
  );
}

function TermsDialog({
  open,
  summary,
  phase,
  accepted,
  busy,
  onAcceptedChange,
  onOpenChange,
  onConfirm,
}: {
  open: boolean;
  summary: PoolSummary;
  phase: PoolPhase;
  accepted: boolean;
  busy: boolean;
  onAcceptedChange: (checked: boolean) => void;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto rounded-3xl sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Termos de participação</DialogTitle>
          <DialogDescription>
            Leia os termos antes de confirmar sua entrada no bolão.
          </DialogDescription>
        </DialogHeader>
        <div className="max-h-72 overflow-y-auto rounded-2xl bg-muted/70 p-4 text-sm leading-relaxed text-muted-foreground">
          {summary.terms}
        </div>
        <div className="flex items-start gap-2">
          <Checkbox
            id="pool-terms"
            checked={accepted}
            onCheckedChange={(value) => onAcceptedChange(value === true)}
          />
          <Label htmlFor="pool-terms" className="text-sm leading-snug">
            Li e aceito os termos de participação.
          </Label>
        </div>
        {!phase.ctaEnabled && (
          <p className="rounded-2xl bg-muted/55 p-3 text-xs text-muted-foreground">
            {phase.ctaDisabledReason}
          </p>
        )}
        <DialogFooter>
          <Button
            className="w-full sm:w-auto"
            disabled={busy || !accepted || !phase.ctaEnabled}
            onClick={onConfirm}
          >
            Confirmar inscrição
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RulesCard({ summary }: { summary: PoolSummary }) {
  return (
    <Card className="glass-card">
      <CardContent className="p-0">
        <Accordion type="single" collapsible>
          <AccordionItem value="rules" className="border-b-0 px-4">
            <AccordionTrigger className="py-4 font-extrabold hover:no-underline">
              <span className="flex items-center gap-2">
                <BiInfoCircle className="size-5 text-brand" />
                Regras do bolão
              </span>
            </AccordionTrigger>
            <AccordionContent className="space-y-3 pb-4 text-sm text-muted-foreground">
              <RuleLine
                title="Prazo dos palpites"
                text="Cada palpite de jogo bloqueia automaticamente no início da partida."
              />
              <RuleLine
                title="Ranking oficial"
                text="O ranking do Bolão considera somente participantes com inscrição ativa."
              />
              <RuleLine
                title="Desempate"
                text="Em empate de pontos, fica na frente quem enviou primeiro o palpite válido. Editar o palpite depois não muda esse critério."
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
      <CardContent className="p-0">
        <Accordion type="single" collapsible>
          <AccordionItem value="knockout" className="border-b-0 px-4">
            <AccordionTrigger className="py-4 font-extrabold hover:no-underline">
              <span className="flex items-center gap-2">
                <BiShieldQuarter className="size-5 text-brand" />
                Regras do mata-mata
              </span>
            </AccordionTrigger>
            <AccordionContent className="space-y-3 pb-4 text-sm">
              <div className="rounded-2xl bg-muted/55 p-3 text-muted-foreground">
                <p className="font-bold text-foreground">Pontos base por jogo</p>
                <p className="mt-1">
                  Placar exato: {basePoints.exact_score ?? 3}; resultado no tempo regulamentar:{" "}
                  {basePoints.regulation_result ?? 1}; saldo de gols:{" "}
                  {basePoints.goal_difference ?? 1}; classificado: {basePoints.qualified_team ?? 2};
                  método de classificação: {basePoints.qualification_method ?? 1}; combo perfeito:{" "}
                  {basePoints.perfect_combo ?? 1}.
                </p>
              </div>
              <div className="rounded-2xl border border-brand/20 bg-brand/10 p-3 text-muted-foreground">
                <p className="font-bold text-foreground">Exemplo prático</p>
                <p className="mt-1">
                  Time A 0 x 1 Time B. Você cravou 0 x 1, indicou Time B classificado e método tempo
                  regulamentar: {basePoints.exact_score ?? 3} pelo placar +{" "}
                  {basePoints.goal_difference ?? 1} pelo saldo + {basePoints.qualified_team ?? 2}{" "}
                  pelo classificado + {basePoints.qualification_method ?? 1} pelo método +{" "}
                  {basePoints.perfect_combo ?? 1} pelo combo ={" "}
                  <strong className="text-foreground">
                    {(basePoints.exact_score ?? 3) +
                      (basePoints.goal_difference ?? 1) +
                      (basePoints.qualified_team ?? 2) +
                      (basePoints.qualification_method ?? 1) +
                      (basePoints.perfect_combo ?? 1)}{" "}
                    pts
                  </strong>
                  . Depois aplica o multiplicador da fase e do time, se houver.
                </p>
              </div>
              <div className="space-y-2">
                <p className="text-xs font-bold uppercase text-muted-foreground">
                  Multiplicador por fase
                </p>
                <div className="grid grid-cols-2 gap-2">
                  {Object.entries(stageWeights).map(([stage, weight]) => (
                    <MiniStat
                      key={stage}
                      label={knockoutStageLabel(stage) ?? stage}
                      value={`x${weight}`}
                    />
                  ))}
                </div>
              </div>
              <div className="rounded-2xl bg-muted/55 p-3 text-muted-foreground">
                <p className="font-bold text-foreground">Bônus de campeão, vice e 3º lugar</p>
                <p className="mt-1">
                  Campeão: {specialPoints.champion ?? 60}; vice: {specialPoints.runner_up ?? 35}; 3º
                  lugar: {specialPoints.third_place ?? 25}; pódio perfeito:{" "}
                  {specialPoints.perfect_podium ?? 30}. Final e palpites especiais valem mais por
                  serem cenários mais difíceis e com menos margem para recuperação.
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
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </CardContent>
    </Card>
  );
}

function SpecialPredictionsCard({
  userId,
  enrollment,
  rules,
  prediction,
  teams,
  busy,
  onSave,
}: {
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
  }) => void;
}) {
  const enrolled = isActiveEnrollment(enrollment?.status);
  const lockAt = rules?.specials_lock_at ? new Date(rules.specials_lock_at) : null;
  const locked = Boolean(lockAt && lockAt <= new Date());
  const [form, setForm] = useState({
    champion_team_id: prediction?.champion_team_id ?? "",
    runner_up_team_id: prediction?.runner_up_team_id ?? "",
    third_place_team_id: prediction?.third_place_team_id ?? "",
  });
  const [isEditing, setIsEditing] = useState(false);

  useEffect(() => {
    setForm({
      champion_team_id: prediction?.champion_team_id ?? "",
      runner_up_team_id: prediction?.runner_up_team_id ?? "",
      third_place_team_id: prediction?.third_place_team_id ?? "",
    });
    setIsEditing(false);
  }, [prediction]);

  if (!enrolled) {
    return (
      <Card className="glass-card border-warning/25">
        <CardContent className="flex items-start gap-3 p-4">
          <div className="grid size-10 shrink-0 place-items-center rounded-2xl bg-warning/15 text-warning">
            <BiLockAlt className="size-5" />
          </div>
          <div>
            <p className="font-extrabold">Palpites Especiais bloqueados</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Disponível após confirmação da inscrição.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  const readonly = !userId || locked || (Boolean(prediction) && !isEditing);
  const filled = Boolean(
    form.champion_team_id && form.runner_up_team_id && form.third_place_team_id,
  );

  return (
    <Card className="glass-card overflow-hidden border-warning/25">
      <div className="h-1 bg-warning" />
      <CardHeader>
        <CardTitle className="flex items-center justify-between gap-3 text-base leading-none">
          <span className="min-w-0 leading-none">Palpites Especiais</span>
          <StatusPill
            label={filled ? "Definido" : "Pendente"}
            tone={filled ? "success" : "warning"}
          />
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">
          Defina campeão, vice e 3º lugar antes do prazo. Última edição válida vira definitiva.
        </p>
        {lockAt && <SpecialCountdown lockAt={lockAt} locked={locked} />}
        <div className="grid gap-3 md:grid-cols-3">
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
        </div>
        {prediction && (
          <p className="text-xs font-bold text-muted-foreground">
            Pontuação especial atual: {prediction.points} pts
          </p>
        )}
        {!locked && prediction && !isEditing && (
          <Button
            className="h-11 w-full rounded-2xl"
            disabled={busy}
            onClick={() => setIsEditing(true)}
          >
            Editar palpites especiais
          </Button>
        )}
        {!readonly && (
          <Button
            className="h-11 w-full rounded-2xl"
            disabled={busy || !filled}
            onClick={() => {
              onSave(form);
              setIsEditing(false);
            }}
          >
            {prediction ? "Salvar edição" : "Salvar palpites especiais"}
          </Button>
        )}
        {locked && (
          <p className="text-xs font-bold text-destructive">
            Prazo encerrado. Palpites especiais bloqueados para edição.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function PrizeTab({
  summary,
  phase,
  eligibleForPrize,
  prizeRequest,
  prizePixKey,
  busy,
  onPrizePixKeyChange,
  onRequestPrize,
}: {
  summary: PoolSummary;
  phase: PoolPhase;
  eligibleForPrize: boolean;
  prizeRequest: PrizeRequest | null;
  prizePixKey: string;
  busy: boolean;
  onPrizePixKeyChange: (value: string) => void;
  onRequestPrize: () => void;
}) {
  const progress = summary.minimum_participants
    ? Math.min(100, (summary.participants_count / summary.minimum_participants) * 100)
    : 0;
  const prizes = prizeBreakdown(summary);
  const alreadyRequested = Boolean(prizeRequest);

  return (
    <>
      <Card className="glass-card overflow-hidden border-warning/25">
        <div className="h-1 bg-warning" />
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <BiSolidTrophy className="size-5 text-warning" />
            Premiação
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-3xl bg-warning/10 p-4 text-center ring-1 ring-warning/20">
            <p className="text-xs font-extrabold uppercase text-warning">Prêmio estimado</p>
            <p className="mt-1 break-words text-3xl font-black tracking-tight text-foreground sm:text-4xl">
              {money(prizes.pool)}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {summary.prize_percentage}% da arrecadação atual do bolão.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            <PrizePlaceCard place="1º" label="Campeão" value={money(prizes.first)} tone="warning" />
            <PrizePlaceCard place="2º" label="Vice" value={money(prizes.second)} tone="brand" />
            <PrizePlaceCard
              place="3º"
              label="Terceiro"
              value={money(prizes.third)}
              tone="success"
            />
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Metric
              icon={BiGroup}
              label="Inscritos ativos"
              value={String(summary.participants_count)}
            />
            <Metric icon={BiCreditCard} label="Entrada" value={money(summary.entry_fee_cents)} />
          </div>

          <div className="rounded-2xl bg-muted/55 p-4">
            <div className="flex flex-wrap justify-between gap-2 text-xs font-bold">
              <span>Meta mínima</span>
              <span>
                {summary.participants_count}/{summary.minimum_participants}
              </span>
            </div>
            <Progress value={progress} className="mt-2" />
            <p className="mt-2 break-words text-xs text-muted-foreground">
              Arrecadação bruta atual: {money(prizes.gross)}.
            </p>
          </div>

          {summary.prize_description && (
            <p className="rounded-2xl bg-muted/55 p-3 text-xs leading-relaxed text-muted-foreground">
              {summary.prize_description}
            </p>
          )}
        </CardContent>
      </Card>

      {phase.kind === "ended" && eligibleForPrize && (
        <Card className="glass-card border-warning/30">
          <CardContent className="space-y-3 p-4">
            <p className="font-bold">Você está elegível para solicitar prêmio.</p>
            <Field label="Chave Pix">
              <Input
                value={prizePixKey}
                disabled={busy || alreadyRequested}
                onChange={(event) => onPrizePixKeyChange(event.target.value)}
                placeholder="Informe sua chave Pix"
              />
            </Field>
            <Button
              disabled={busy || alreadyRequested || prizePixKey.trim().length < 3}
              onClick={onRequestPrize}
            >
              {alreadyRequested ? "Prêmio já solicitado" : "Solicitar prêmio"}
            </Button>
          </CardContent>
        </Card>
      )}
    </>
  );
}

function SpecialCountdown({ lockAt, locked }: { lockAt: Date; locked: boolean }) {
  const [timeLeft, setTimeLeft] = useState(() => calcTimeLeft(lockAt));

  useEffect(() => {
    setTimeLeft(calcTimeLeft(lockAt));
    const id = window.setInterval(() => setTimeLeft(calcTimeLeft(lockAt)), 1_000);
    return () => window.clearInterval(id);
  }, [lockAt]);

  const display = timeLeft ?? { days: 0, hours: 0, minutes: 0, seconds: 0 };

  return (
    <div
      className={cn(
        "rounded-2xl p-3",
        locked ? "bg-destructive/10 text-destructive" : "bg-warning/10 text-warning",
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-extrabold uppercase">
          {locked ? "Prazo encerrado" : "Encerra em"}
        </p>
        <p className="text-xs font-bold tabular-nums">
          {String(display.days).padStart(2, "0")}d {String(display.hours).padStart(2, "0")}h{" "}
          {String(display.minutes).padStart(2, "0")}m {String(display.seconds).padStart(2, "0")}s
        </p>
      </div>
      <p className="mt-1 text-xs opacity-80">
        {locked
          ? `Encerrado em ${formatPoolDateTime(lockAt)}. Última edição ficou definitiva.`
          : `Prazo final: ${formatPoolDateTime(lockAt)}.`}
      </p>
    </div>
  );
}

function PoolCountdownBlock({ phase }: { phase: PoolPhase }) {
  const [timeLeft, setTimeLeft] = useState(() =>
    phase.target ? calcTimeLeft(phase.target) : null,
  );

  useEffect(() => {
    if (!phase.target) {
      setTimeLeft(null);
      return;
    }
    setTimeLeft(calcTimeLeft(phase.target));
    const id = window.setInterval(() => setTimeLeft(calcTimeLeft(phase.target!)), 1_000);
    return () => window.clearInterval(id);
  }, [phase.target]);

  return (
    <div className="rounded-2xl bg-muted/55 p-4">
      <div className="flex items-center gap-2">
        <div className="grid size-9 place-items-center rounded-xl bg-brand/12 text-brand">
          <BiCalendar className="size-5" />
        </div>
        <p className="font-extrabold">{phase.title}</p>
      </div>
      {phase.target && timeLeft ? (
        <div className="mt-3 grid grid-cols-4 gap-2 text-center">
          <TimePart label="dias" value={timeLeft.days} />
          <TimePart label="horas" value={timeLeft.hours} />
          <TimePart label="min" value={timeLeft.minutes} />
          <TimePart label="seg" value={timeLeft.seconds} />
        </div>
      ) : (
        <p className="mt-3 text-sm text-muted-foreground">
          {phase.kind === "ended"
            ? "Premiação disponível para os vencedores elegíveis."
            : phase.ctaDisabledReason}
        </p>
      )}
    </div>
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
      <Label htmlFor={id} className="text-xs font-extrabold uppercase text-muted-foreground">
        {label}
      </Label>
      <div className="relative">
        <select
          id={id}
          value={value}
          disabled={disabled}
          onChange={(event) => onChange(event.target.value)}
          className="h-12 w-full appearance-none rounded-2xl border border-brand/15 bg-background/80 px-3 pr-11 text-sm font-bold outline-none transition-colors focus:border-brand/40 focus:ring-2 focus:ring-brand/15 disabled:cursor-not-allowed disabled:opacity-65"
        >
          <option value="">Selecione</option>
          {teams.map((team) => (
            <option key={team.id} value={team.id}>
              {team.name}
            </option>
          ))}
        </select>
        <BiChevronDown className="pointer-events-none absolute right-4 top-1/2 size-5 -translate-y-1/2 text-muted-foreground" />
      </div>
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

function PaymentsList({ payments }: { payments: Payment[] }) {
  return (
    <div className="space-y-2">
      <p className="text-xs font-bold uppercase text-muted-foreground">Pagamentos</p>
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
    </div>
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
        <MiniStat label="Pendentes" value={summary.paymentPending} />
        <MiniStat label="Removidos" value={summary.refundPending} />
        <MiniStat label="Pagamentos pendentes" value={summary.paymentsPending} />
      </CardContent>
    </Card>
  );
}

function MiniStat({ label, value }: { label: number | string; value: number | string }) {
  return (
    <div className="min-w-0 rounded-2xl bg-muted/60 p-3">
      <p className="break-words text-lg font-extrabold tabular-nums sm:text-xl">{value}</p>
      <p className="text-[10px] font-bold uppercase text-muted-foreground">{label}</p>
    </div>
  );
}

function PrizePlaceCard({
  place,
  label,
  value,
  tone,
}: {
  place: string;
  label: string;
  value: string;
  tone: Exclude<Tone, "neutral">;
}) {
  const toneClass =
    tone === "warning"
      ? "bg-warning/10 text-warning ring-warning/20"
      : tone === "success"
        ? "bg-success/10 text-success ring-success/20"
        : "bg-brand/10 text-brand ring-brand/20";

  return (
    <div className={cn("min-w-0 rounded-2xl p-3 ring-1", toneClass)}>
      <div className="flex items-center justify-between gap-2">
        <span className="rounded-full bg-background/60 px-2 py-1 text-[10px] font-black uppercase leading-none">
          {place}
        </span>
        <span className="text-[10px] font-extrabold uppercase opacity-80">{label}</span>
      </div>
      <p className="mt-3 break-words text-xl font-black tabular-nums tracking-tight sm:text-2xl">
        {value}
      </p>
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
    <span
      className={`inline-flex h-7 shrink-0 items-center rounded-full px-3 text-xs font-extrabold leading-none ring-1 ${className}`}
    >
      {label}
    </span>
  );
}

type TimeLeft = { days: number; hours: number; minutes: number; seconds: number };

function calcTimeLeft(target: Date): TimeLeft | null {
  const diff = target.getTime() - Date.now();
  if (diff <= 0) return null;
  return {
    days: Math.floor(diff / 86_400_000),
    hours: Math.floor((diff % 86_400_000) / 3_600_000),
    minutes: Math.floor((diff % 3_600_000) / 60_000),
    seconds: Math.floor((diff % 60_000) / 1_000),
  };
}

function Metric({ icon: Icon, label, value }: { icon: IconType; label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-2xl bg-muted/60 p-4">
      <div className="grid size-9 place-items-center rounded-xl bg-brand/12 text-brand">
        <Icon className="size-5" />
      </div>
      <p className="mt-2 break-words text-lg font-extrabold sm:text-xl">{value}</p>
      <p className="text-[11px] text-muted-foreground">{label}</p>
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

function EnrollmentStatus({ status }: { status: string }) {
  const map: Record<string, { icon: IconType; label: string; className: string }> = {
    none: { icon: BiTimeFive, label: "Não inscrito", className: "text-muted-foreground" },
    requested: { icon: BiTimeFive, label: "Solicitação enviada", className: "text-warning" },
    payment_pending: {
      icon: BiTimeFive,
      label: "Pendente de pagamento",
      className: "text-warning",
    },
    active: { icon: BiCheckCircle, label: "Inscrição confirmada", className: "text-success" },
    removed: { icon: BiLockAlt, label: "Removido do bolão", className: "text-muted-foreground" },
    refund_pending: {
      icon: BiLockAlt,
      label: "Removido do bolão",
      className: "text-muted-foreground",
    },
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

function enrollmentStatusHelp(status: string) {
  const map: Record<string, string | null> = {
    none: null,
    requested: "Solicitação enviada. Faça o pagamento para ativar sua inscrição.",
    payment_pending: "Pendente de pagamento. Use o botão abaixo para pagar a inscrição.",
    active: null,
    removed:
      "Você não faz mais parte do bolão. O reembolso será tratado manualmente pelo administrador.",
    refund_pending:
      "Você não faz mais parte do bolão. O reembolso será tratado manualmente pelo administrador.",
    rejected: "Sua solicitação não foi aprovada.",
    cancelled: "Sua inscrição foi cancelada.",
  };
  return map[status] ?? null;
}

function paymentStatusLabel(status: string) {
  const map: Record<string, string> = {
    pending: "Aguardando pagamento",
    paid: "Pagamento recebido",
    confirmed: "Pagamento confirmado",
    failed: "Pagamento não concluído",
    cancelled: "Pagamento cancelado",
    expired: "Pagamento expirado",
    refunded: "Pagamento estornado",
  };
  return map[status] ?? "Status em análise";
}

function isActiveEnrollment(status?: string | null) {
  return status === "active";
}

function formatPoolDateTime(value: Date) {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(value);
}

function friendlyPoolError(caught: unknown) {
  const message = caught instanceof Error ? caught.message : "";
  const normalized = message.toLowerCase();

  if (
    normalized.includes("special_predictions_locked") ||
    normalized.includes("row-level security") ||
    normalized.includes("policy")
  ) {
    return "Prazo encerrado ou inscrição não ativa. Não foi possível concluir a operação.";
  }

  if (normalized.includes("permission denied")) {
    return "Permissão insuficiente para concluir a operação. Atualize a página ou fale com o admin.";
  }

  return message || "Falha na operação.";
}

function money(cents: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(cents / 100);
}

function prizeBreakdown(summary: PoolSummary) {
  const gross = summary.participants_count * summary.entry_fee_cents;
  const pool = Math.round((gross * summary.prize_percentage) / 100);
  const first = Math.round(pool * 0.5);
  const second = Math.round(pool * 0.3);
  const third = Math.max(0, pool - first - second);
  return { gross, pool, first, second, third };
}

function parseDate(value: string | null | undefined) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function getPoolEndDate(summary: PoolSummary | null, fallback: string | null) {
  return parseDate(summary?.pool_ends_at) ?? parseDate(fallback);
}

function isPoolEnded(summary: PoolSummary | null, fallback: string | null) {
  const endsAt = getPoolEndDate(summary, fallback);
  return Boolean(endsAt && endsAt <= new Date());
}

function getPoolPhase(summary: PoolSummary, poolEndsFallbackAt: string | null): PoolPhase {
  const now = new Date();
  const opensAt = parseDate(summary.enrollment_opens_at);
  const closesAt = parseDate(summary.enrollment_closes_at);
  const endsAt = getPoolEndDate(summary, poolEndsFallbackAt);

  if (endsAt && now >= endsAt) {
    return {
      kind: "ended",
      title: "Bolão encerrado",
      label: "Encerrado",
      description: "O bolão foi encerrado. A premiação pode ser solicitada pelos vencedores.",
      target: null,
      tone: "neutral",
      ctaEnabled: false,
      ctaDisabledReason: "Bolão encerrado",
    };
  }

  if (opensAt && now < opensAt) {
    return {
      kind: "before_enrollment",
      title: "Inscrições abrem em",
      label: "Em breve",
      description: "As inscrições ainda não começaram.",
      target: opensAt,
      tone: "warning",
      ctaEnabled: false,
      ctaDisabledReason: "Inscrições ainda não abriram",
    };
  }

  if (closesAt && now < closesAt && summary.enrollments_mode !== "closed") {
    return {
      kind: "enrollment_open",
      title: "Inscrições encerram em",
      label: "Inscrições abertas",
      description: "",
      target: closesAt,
      tone: "brand",
      ctaEnabled: summary.status !== "closed" && summary.status !== "archived",
      ctaDisabledReason: "Inscrições encerradas",
    };
  }

  if (closesAt && now >= closesAt) {
    return {
      kind: "running",
      title: "Bolão finaliza em",
      label: "Em andamento",
      description: "Novas inscrições estão bloqueadas. Acompanhe a classificação oficial.",
      target: endsAt,
      tone: "success",
      ctaEnabled: false,
      ctaDisabledReason: "Inscrições encerradas",
    };
  }

  if (summary.enrollments_mode === "coming_soon") {
    return {
      kind: "before_enrollment",
      title: "Inscrições abrem em",
      label: "Em breve",
      description: summary.coming_soon_message ?? "A abertura será anunciada aqui.",
      target: opensAt,
      tone: "warning",
      ctaEnabled: false,
      ctaDisabledReason: "Inscrições ainda não abriram",
    };
  }

  if (summary.status === "open" && summary.enrollments_mode !== "closed") {
    return {
      kind: "enrollment_open",
      title: "Inscrições encerram em",
      label: "Inscrições abertas",
      description: "",
      target: closesAt,
      tone: "brand",
      ctaEnabled: true,
      ctaDisabledReason: "Inscrições encerradas",
    };
  }

  return {
    kind: "blocked",
    title: "Bolão finaliza em",
    label: "Inscrições fechadas",
    description: "As inscrições não estão disponíveis no momento.",
    target: endsAt,
    tone: "neutral",
    ctaEnabled: false,
    ctaDisabledReason: "Inscrições indisponíveis",
  };
}

async function fetchPool(userId: string, isOperator: boolean): Promise<PoolData> {
  const [summaryResult, scoreResult, finalMatchResult, lastMatchResult, teamsResult] =
    await Promise.all([
      supabase.from("pool_public_summary").select("*").maybeSingle(),
      supabase
        .from("score_rules")
        .select("exact_score_points,outcome_points,goal_difference_bonus")
        .order("created_at")
        .limit(1)
        .maybeSingle(),
      supabase
        .from("matches")
        .select("kickoff_at")
        .eq("stage", "final")
        .order("kickoff_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from("matches")
        .select("kickoff_at")
        .order("kickoff_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase.from("teams").select("id,name,short_name,external_key").order("name"),
    ]);

  const fetchedSummary = summaryResult.data as PoolSummary | null;
  const summary = !isOperator && fetchedSummary?.status === "archived" ? null : fetchedSummary;
  const poolEndsFallbackAt =
    finalMatchResult.data?.kickoff_at ?? lastMatchResult.data?.kickoff_at ?? null;

  const [enrollmentResult, prizeResult, rankingResult, poolScoringResult, specialPredictionResult] =
    summary?.id
      ? await Promise.all([
          supabase
            .from("enrollments")
            .select("id,status,terms_accepted_at")
            .eq("pool_id", summary.id)
            .eq("user_id", userId)
            .maybeSingle(),
          supabase
            .from("prize_requests")
            .select("*")
            .eq("pool_id", summary.id)
            .eq("user_id", userId)
            .maybeSingle(),
          supabase.from("ranking_pool").select("rank_position").eq("user_id", userId).maybeSingle(),
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
              "id,champion_team_id,runner_up_team_id,third_place_team_id,submitted_at,locked_at,points,points_breakdown",
            )
            .eq("pool_id", summary.id)
            .eq("user_id", userId)
            .maybeSingle(),
        ])
      : [nullResult(), nullResult(), nullResult(), nullResult(), nullResult()];

  const enrollment = enrollmentResult.data as Enrollment | null;
  const teams = (teamsResult.data ?? []) as PoolTeam[];
  let payments: Payment[] = [];
  let adminSummary: AdminPoolSummary | null = null;

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
    const allEnrollments = (allEnrollmentsResult.data ?? []) as Array<{ status: string }>;
    const allPayments = (allPaymentsResult.data ?? []) as Array<{ status: string }>;
    adminSummary = {
      active: allEnrollments.filter((item) => item.status === "active").length,
      requested: allEnrollments.filter((item) => item.status === "requested").length,
      paymentPending: allEnrollments.filter((item) => item.status === "payment_pending").length,
      refundPending: allEnrollments.filter((item) =>
        ["removed", "refund_pending"].includes(item.status),
      ).length,
      paymentsPending: allPayments.filter((item) => item.status === "pending").length,
    };
  }

  return {
    summary,
    enrollment,
    payments,
    scoreRules: scoreResult.data as ScoreRules | null,
    poolScoringRules: poolScoringResult.data as PoolScoringRules | null,
    specialPrediction: specialPredictionResult.data as SpecialPrediction | null,
    teams,
    poolEndsFallbackAt,
    adminSummary,
    eligibleForPrize:
      isPoolEnded(summary, poolEndsFallbackAt) &&
      Boolean(rankingResult.data && Number(rankingResult.data.rank_position) <= 3),
    prizeRequest: prizeResult.data as PrizeRequest | null,
    error:
      summaryResult.error?.message ??
      enrollmentResult.error?.message ??
      prizeResult.error?.message ??
      rankingResult.error?.message ??
      scoreResult.error?.message ??
      finalMatchResult.error?.message ??
      lastMatchResult.error?.message ??
      teamsResult.error?.message ??
      poolScoringResult.error?.message ??
      specialPredictionResult.error?.message ??
      null,
  };
}

function nullResult() {
  return { data: null, error: null };
}
