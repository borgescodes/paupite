import {
  authenticate,
  corsHeaders,
  errorResponse,
  HttpError,
  json,
  writeAudit,
} from "../_shared/paupite.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed." }, 405);

  try {
    const { profile, admin } = await authenticate(req);
    const handle = Deno.env.get("INFINITEPAY_HANDLE");
    if (!handle) throw new HttpError(503, "Pagamento automático não configurado.");
    const { payment_id, transaction_nsu, slug } = (await req.json()) as {
      payment_id?: string;
      transaction_nsu?: string;
      slug?: string;
    };
    if (!payment_id) throw new HttpError(400, "Informe o pagamento.");

    const { data: payment, error } = await admin
      .from("payments")
      .select("*, enrollment:enrollment_id(id,user_id,pool_id)")
      .eq("id", payment_id)
      .maybeSingle();
    if (error) throw new HttpError(500, error.message);
    if (!payment) throw new HttpError(404, "Pagamento não encontrado.");
    if (payment.enrollment?.user_id !== profile.id && profile.role !== "superadmin") {
      throw new HttpError(403, "Pagamento não pertence ao usuário.");
    }
    if (payment.status === "paid") return json({ paid: true });
    if (["removed", "refund_pending"].includes(payment.enrollment?.status)) {
      throw new HttpError(409, "Sua inscrição foi removida pelo administrador.");
    }
    const { data: settings, error: settingsError } = await admin
      .from("pool_settings")
      .select("entry_fee_cents")
      .eq("id", payment.enrollment.pool_id)
      .single();
    if (settingsError) throw new HttpError(500, settingsError.message);
    if (settings.entry_fee_cents !== payment.amount_cents) {
      throw new HttpError(400, "O valor da inscrição mudou; gere um novo checkout.");
    }
    const transactionNsu = payment.transaction_nsu || transaction_nsu;
    const invoiceSlug = payment.invoice_slug || slug;
    if (!transactionNsu || !invoiceSlug) {
      return json({ paid: false, pending: true });
    }

    const response = await fetch("https://api.checkout.infinitepay.io/payment_check", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        handle,
        order_nsu: payment.order_nsu,
        transaction_nsu: transactionNsu,
        slug: invoiceSlug,
      }),
    });
    const checked = (await response.json().catch(() => ({}))) as {
      success?: boolean;
      paid?: boolean;
      amount?: number;
      paid_amount?: number;
      capture_method?: string;
    };
    if (!response.ok || !checked.success)
      throw new HttpError(502, "Falha ao consultar a InfinitePay.");
    if (!checked.paid) return json({ paid: false, pending: true });
    if (checked.amount !== payment.amount_cents) throw new HttpError(400, "Valor pago divergente.");

    const paidAt = new Date().toISOString();
    await admin
      .from("payments")
      .update({
        status: "paid",
        transaction_nsu: transactionNsu,
        invoice_slug: invoiceSlug,
        paid_amount_cents: checked.paid_amount ?? checked.amount,
        capture_method: checked.capture_method ?? null,
        paid_at: paidAt,
      })
      .eq("id", payment.id);
    await admin
      .from("enrollments")
      .update({ status: "active", activated_at: paidAt })
      .eq("id", payment.enrollment_id);
    await writeAudit(admin, profile.id, "payment.confirmed", "payment", payment.id, {
      source: "authenticated_payment_check",
      amount_cents: checked.amount,
    });
    return json({ paid: true });
  } catch (error) {
    return errorResponse(error);
  }
});
