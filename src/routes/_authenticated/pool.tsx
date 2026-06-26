import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  BiCheckCircle,
  BiCreditCard,
  BiGroup,
  BiLinkExternal,
  BiReceipt,
  BiShieldQuarter,
  BiSolidTrophy,
  BiTimeFive,
} from "react-icons/bi";
import type { IconType } from "react-icons";
import { useEffect, useMemo, useState } from "react";

import { MobileShell } from "@/components/mobile/MobileShell";
import { ComingSoonCountdown } from "@/components/mobile/ComingSoonCountdown";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { callEdgeFunction } from "@/lib/edge";

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

type PoolData = {
  summary: PoolSummary | null;
  enrollment: Enrollment | null;
  payments: Payment[];
  eligibleForPrize: boolean;
  prizeRequested: boolean;
  error: string | null;
};

export const Route = createFileRoute("/_authenticated/pool")({
  component: PoolPage,
});

const emptyPayments: Payment[] = [];
const poolQueryKey = (userId: string | null | undefined) => ["pool", userId] as const;

function PoolPage() {
  const { user } = useAuth();
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);

  const poolQuery = useQuery({
    queryKey: poolQueryKey(user?.id),
    enabled: Boolean(user?.id),
    queryFn: () => fetchPool(user!.id),
  });

  const summary = poolQuery.data?.summary ?? null;
  const enrollment = poolQuery.data?.enrollment ?? null;
  const payments = poolQuery.data?.payments ?? emptyPayments;
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

            <Card className="glass-card overflow-hidden">
              <div className="h-1 bg-brand" />
              <CardHeader>
                <CardTitle className="text-base">Sua inscrição</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <EnrollmentStatus status={enrollment?.status ?? "none"} />
                {!enrollment && summary.enrollments_mode === "coming_soon" && (
                  <ComingSoonCountdown
                    opensAt={summary.enrollment_opens_at}
                    message={summary.coming_soon_message}
                  />
                )}
                {!enrollment && summary.enrollments_mode !== "coming_soon" && (
                  <>
                    <div className="max-h-40 overflow-y-auto rounded-2xl bg-muted/70 p-4 text-xs leading-relaxed text-muted-foreground">
                      {summary.terms}
                    </div>
                    <div className="flex items-start gap-2">
                      <Checkbox
                        id="terms"
                        checked={termsAccepted}
                        onCheckedChange={(value) => setTermsAccepted(value === true)}
                      />
                      <Label htmlFor="terms" className="text-sm leading-snug">
                        Li e aceito os termos de participação.
                      </Label>
                    </div>
                    <Button
                      className="w-full"
                      disabled={
                        busy ||
                        !termsAccepted ||
                        summary.status === "closed" ||
                        summary.enrollments_mode === "closed"
                      }
                      onClick={() => void requestEnrollment()}
                    >
                      Solicitar participação
                    </Button>
                  </>
                )}
                {enrollment && ["requested", "payment_pending"].includes(enrollment.status) && (
                  <div className="space-y-2">
                    {summary.entry_fee_cents > 0 && summary.status === "open" && (
                      <Button
                        className="w-full"
                        disabled={busy}
                        onClick={() => void createCheckout()}
                      >
                        <BiCreditCard className="size-5" />
                        Pagar com Pix/cartão
                      </Button>
                    )}
                    <p className="text-xs text-muted-foreground">
                      A confirmação manual pelo superadmin permanece disponível. O retorno do
                      checkout, sozinho, nunca ativa a inscrição.
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>

            {payments.length > 0 && (
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
                        <p className="text-sm font-bold">
                          {money(payment.amount_cents)} · {payment.provider}
                        </p>
                        <p className="text-xs text-muted-foreground">{payment.status}</p>
                      </div>
                      <div className="flex gap-1">
                        {payment.checkout_url && payment.status === "pending" && (
                          <Button asChild size="icon" variant="ghost">
                            <a href={payment.checkout_url} target="_blank" rel="noreferrer">
                              <BiLinkExternal className="size-5" />
                            </a>
                          </Button>
                        )}
                        {payment.receipt_url && (
                          <Button asChild size="icon" variant="ghost">
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
            )}

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

function money(cents: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(cents / 100);
}

async function fetchPool(userId: string): Promise<PoolData> {
  const [summaryResult, enrollmentResult, prizeResult, rankingResult] = await Promise.all([
    supabase.from("pool_public_summary").select("*").maybeSingle(),
    supabase
      .from("enrollments")
      .select("id,status,terms_accepted_at")
      .eq("user_id", userId)
      .maybeSingle(),
    supabase.from("prize_requests").select("id,status").eq("user_id", userId).maybeSingle(),
    supabase.from("ranking_pool").select("rank_position").eq("user_id", userId).maybeSingle(),
  ]);
  const summary = summaryResult.data as PoolSummary | null;
  const enrollment = enrollmentResult.data as Enrollment | null;
  let payments: Payment[] = [];

  if (enrollment) {
    const { data } = await supabase
      .from("payments")
      .select("id,status,provider,checkout_url,receipt_url,amount_cents")
      .eq("enrollment_id", enrollment.id)
      .order("created_at", { ascending: false });
    payments = (data ?? []) as Payment[];
  }

  return {
    summary,
    enrollment,
    payments,
    eligibleForPrize:
      summary?.status === "closed" &&
      Boolean(rankingResult.data && Number(rankingResult.data.rank_position) <= 3),
    prizeRequested: Boolean(prizeResult.data),
    error:
      summaryResult.error?.message ??
      enrollmentResult.error?.message ??
      prizeResult.error?.message ??
      rankingResult.error?.message ??
      null,
  };
}
