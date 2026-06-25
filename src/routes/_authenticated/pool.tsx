import { createFileRoute } from "@tanstack/react-router";
import {
  CheckCircle2,
  Clock3,
  ExternalLink,
  ReceiptText,
  ShieldCheck,
  Trophy,
  Users,
  WalletCards,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

import { MobileShell } from "@/components/mobile/MobileShell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { useAuth } from "@/hooks/use-auth";
import { supabase as _supabaseTyped } from "@/integrations/supabase/client";
const supabase = _supabaseTyped as any;
import { callEdgeFunction } from "@/lib/edge";

interface PoolSummary {
  id: string;
  title: string;
  status: string;
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

export const Route = createFileRoute("/_authenticated/pool")({
  component: PoolPage,
});

function PoolPage() {
  const { user } = useAuth();
  const [summary, setSummary] = useState<PoolSummary | null>(null);
  const [enrollment, setEnrollment] = useState<Enrollment | null>(null);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [eligibleForPrize, setEligibleForPrize] = useState(false);
  const [prizeRequested, setPrizeRequested] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!user?.id) return;
    const [summaryResult, enrollmentResult, prizeResult, rankingResult] = await Promise.all([
      supabase.from("pool_public_summary").select("*").maybeSingle(),
      supabase
        .from("enrollments")
        .select("id,status,terms_accepted_at")
        .eq("user_id", user.id)
        .maybeSingle(),
      supabase.from("prize_requests").select("id,status").eq("user_id", user.id).maybeSingle(),
      supabase.from("ranking_pool").select("rank_position").eq("user_id", user.id).maybeSingle(),
    ]);
    const nextSummary = summaryResult.data as PoolSummary | null;
    const nextEnrollment = enrollmentResult.data as Enrollment | null;
    setSummary(nextSummary);
    setEnrollment(nextEnrollment);
    setTermsAccepted(Boolean(nextEnrollment?.terms_accepted_at));
    setPrizeRequested(Boolean(prizeResult.data));
    setEligibleForPrize(
      nextSummary?.status === "closed" &&
        Boolean(rankingResult.data && Number(rankingResult.data.rank_position) <= 3),
    );

    if (nextEnrollment) {
      const { data } = await supabase
        .from("payments")
        .select("id,status,provider,checkout_url,receipt_url,amount_cents")
        .eq("enrollment_id", nextEnrollment.id)
        .order("created_at", { ascending: false });
      setPayments((data ?? []) as Payment[]);
    } else {
      setPayments([]);
    }
    setError(
      summaryResult.error?.message ??
        enrollmentResult.error?.message ??
        prizeResult.error?.message ??
        rankingResult.error?.message ??
        null,
    );
    setLoading(false);
  }, [user?.id]);

  useEffect(() => {
    void load();
  }, [load]);

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
        return load();
      })
      .catch((caught: Error) => setError(caught.message))
      .finally(() => setBusy(false));
  }, [enrollment, load, payments]);

  const progress = useMemo(() => {
    if (!summary?.minimum_participants) return 0;
    return Math.min(100, (summary.participants_count / summary.minimum_participants) * 100);
  }, [summary]);

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

  async function requestEnrollment() {
    await run(
      () =>
        callEdgeFunction("pool-enrollment", { action: "request", terms_accepted: termsAccepted }),
      "Solicitação registrada.",
    );
  }

  async function createCheckout() {
    setBusy(true);
    setError(null);
    try {
      const result = await callEdgeFunction<{ checkout_url?: string; already_active?: boolean }>(
        "pool-create-checkout",
        {},
      );
      if (result.already_active) {
        setMessage("Sua inscrição já está ativa.");
        await load();
        return;
      }
      if (result.checkout_url) {
        window.open(result.checkout_url, "_blank", "noopener,noreferrer");
        setMessage("Checkout aberto. A inscrição será liberada após confirmação server-side.");
        await load();
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Não foi possível criar o checkout.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <MobileShell active="bolao">
      <main className="mx-auto max-w-xl space-y-4 px-3 py-5">
        <div className="text-center">
          <Trophy className="mx-auto size-9 text-warning" />
          <h1 className="mt-2 text-2xl font-extrabold">{summary?.title ?? "Bolão da Copa 2026"}</h1>
          <p className="text-sm text-muted-foreground">
            {summary?.status === "open"
              ? "Inscrições abertas"
              : "Acompanhe o status da competição oficial"}
          </p>
        </div>

        {loading && <p className="text-center text-sm text-muted-foreground">Carregando...</p>}
        {error && (
          <p className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">{error}</p>
        )}
        {message && <p className="rounded-lg bg-success/10 p-3 text-sm text-success">{message}</p>}

        {summary && (
          <>
            <div className="grid grid-cols-2 gap-3">
              <Metric icon={Users} label="Inscritos" value={String(summary.participants_count)} />
              <Metric icon={WalletCards} label="Entrada" value={money(summary.entry_fee_cents)} />
              <Metric
                icon={Trophy}
                label="Prêmio estimado"
                value={money(summary.estimated_prize_cents)}
              />
              <Metric icon={ShieldCheck} label="Premiação" value={`${summary.prize_percentage}%`} />
            </div>
            <Card>
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

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Sua inscrição</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <EnrollmentStatus status={enrollment?.status ?? "none"} />
                {!enrollment && (
                  <>
                    <div className="max-h-36 overflow-y-auto rounded-lg bg-muted p-3 text-xs text-muted-foreground">
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
                      disabled={busy || !termsAccepted || summary.status === "closed"}
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
                        <WalletCards className="size-4" />
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
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Pagamentos</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {payments.map((payment) => (
                    <div
                      key={payment.id}
                      className="flex items-center justify-between rounded-lg bg-muted p-3"
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
                              <ExternalLink className="size-4" />
                            </a>
                          </Button>
                        )}
                        {payment.receipt_url && (
                          <Button asChild size="icon" variant="ghost">
                            <a href={payment.receipt_url} target="_blank" rel="noreferrer">
                              <ReceiptText className="size-4" />
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
              <Card>
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

function Metric({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Trophy;
  label: string;
  value: string;
}) {
  return (
    <Card>
      <CardContent className="p-3">
        <Icon className="size-4 text-brand" />
        <p className="mt-2 text-xl font-extrabold">{value}</p>
        <p className="text-[11px] text-muted-foreground">{label}</p>
      </CardContent>
    </Card>
  );
}

function EnrollmentStatus({ status }: { status: string }) {
  const map: Record<string, { icon: typeof CheckCircle2; label: string; className: string }> = {
    none: { icon: Clock3, label: "Não inscrito", className: "text-muted-foreground" },
    requested: { icon: Clock3, label: "Solicitação enviada", className: "text-warning" },
    payment_pending: { icon: Clock3, label: "Pagamento pendente", className: "text-warning" },
    active: { icon: CheckCircle2, label: "Inscrição confirmada", className: "text-success" },
    rejected: { icon: Clock3, label: "Solicitação recusada", className: "text-destructive" },
    cancelled: { icon: Clock3, label: "Inscrição cancelada", className: "text-muted-foreground" },
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
