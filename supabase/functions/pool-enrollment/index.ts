import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import {
  authenticate,
  corsHeaders,
  errorResponse,
  HttpError,
  json,
  requireRole,
  writeAudit,
} from "../_shared/paupite.ts";

type Action =
  | "request"
  | "update_settings"
  | "update_score_rules"
  | "confirm_manual"
  | "remove_enrollment"
  | "request_prize"
  | "mark_prize_paid";

type PoolSettings = Record<string, unknown> & {
  id: string;
  title: string;
  status: string;
  entry_fee_cents: number;
  enrollments_mode?: string | null;
  enrollment_opens_at?: string | null;
  enrollment_closes_at?: string | null;
  pool_ends_at?: string | null;
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed." }, 405);

  try {
    const { profile, admin } = await authenticate(req);
    const body = (await req.json()) as Record<string, unknown> & { action?: Action };
    if (!body.action) throw new HttpError(400, "Informe a ação.");

    const { data: settings, error: settingsError } = await admin
      .from("pool_settings")
      .select("*")
      .eq("slug", "world-cup-2026")
      .single();
    if (settingsError) throw new HttpError(500, settingsError.message);
    const poolSettings = settings as PoolSettings;

    if (body.action === "request") {
      const availability = enrollmentAvailability(poolSettings);
      if (!availability.open) throw new HttpError(400, availability.reason);
      if (body.terms_accepted !== true) {
        throw new HttpError(400, "Aceite os termos para solicitar participação.");
      }

      const { data: existing } = await admin
        .from("enrollments")
        .select("id,status")
        .eq("pool_id", poolSettings.id)
        .eq("user_id", profile.id)
        .maybeSingle();

      if (existing?.status === "active") return json({ enrollment: existing });
      if (existing && ["removed", "refund_pending"].includes(existing.status)) {
        throw new HttpError(400, "Sua inscrição foi removida pelo administrador.");
      }

      const now = new Date().toISOString();
      const { data, error } = await admin
        .from("enrollments")
        .upsert(
          {
            pool_id: poolSettings.id,
            user_id: profile.id,
            status: poolSettings.entry_fee_cents === 0 ? "active" : "requested",
            terms_accepted_at: now,
            activated_at: poolSettings.entry_fee_cents === 0 ? now : null,
          },
          { onConflict: "pool_id,user_id" },
        )
        .select("*")
        .single();
      if (error) throw new HttpError(400, error.message);
      await writeAudit(admin, profile.id, "pool.enrollment_requested", "enrollment", data.id, {
        auto_activated: poolSettings.entry_fee_cents === 0,
      });
      return json({ enrollment: data });
    }

    if (body.action === "update_settings") {
      requireRole(profile, ["superadmin"]);
      const allowed = [
        "title",
        "status",
        "entry_fee_cents",
        "minimum_participants",
        "prize_percentage",
        "prize_description",
        "terms",
        "free_ranking_starts_at",
        "enrollment_opens_at",
        "enrollment_closes_at",
        "pool_ends_at",
        "enrollments_mode",
        "coming_soon_message",
      ];
      const patch: Record<string, unknown> = { updated_by: profile.id };
      for (const key of allowed) {
        if (key in body) patch[key] = body[key];
      }
      if ("payout_percentage" in body && !("prize_percentage" in patch)) {
        patch.prize_percentage = body.payout_percentage;
      }
      if (Object.keys(patch).length === 1)
        throw new HttpError(400, "Nenhuma configuração informada.");
      const { data, error } = await admin
        .from("pool_settings")
        .update(patch)
        .eq("id", poolSettings.id)
        .select("*")
        .single();
      if (error) throw new HttpError(400, error.message);
      await writeAudit(
        admin,
        profile.id,
        "pool.settings_updated",
        "pool_settings",
        poolSettings.id,
        patch,
      );
      return json({ settings: data });
    }

    if (body.action === "update_score_rules") {
      requireRole(profile, ["superadmin"]);
      const values = {
        exact_score_points: Number(body.exact_score_points),
        outcome_points: Number(body.outcome_points),
        goal_difference_bonus: Number(body.goal_difference_bonus),
      };
      if (
        Object.values(values).some((value) => !Number.isInteger(value) || value < 0 || value > 100)
      ) {
        throw new HttpError(400, "Regras de pontuação inválidas.");
      }
      const { data: current, error: currentError } = await admin
        .from("score_rules")
        .select("id")
        .order("created_at")
        .limit(1)
        .single();
      if (currentError) throw new HttpError(500, currentError.message);
      const { error } = await admin.from("score_rules").update(values).eq("id", current.id);
      if (error) throw new HttpError(400, error.message);
      await writeAudit(admin, profile.id, "score_rules.updated", "score_rules", current.id, values);
      return json({ ok: true });
    }

    if (body.action === "confirm_manual") {
      requireRole(profile, ["superadmin"]);
      const enrollmentId = String(body.enrollment_id ?? "");
      if (!enrollmentId) throw new HttpError(400, "Informe a inscrição.");
      const { data: enrollment, error: enrollmentError } = await admin
        .from("enrollments")
        .select("*")
        .eq("id", enrollmentId)
        .single();
      if (enrollmentError) throw new HttpError(404, "Inscrição não encontrada.");
      if (["removed", "refund_pending"].includes(enrollment.status)) {
        throw new HttpError(400, "Inscrição removida não pode ser ativada.");
      }
      const orderNsu = `manual-${enrollment.id}`;
      const now = new Date().toISOString();
      const { error: paymentError } = await admin.from("payments").upsert(
        {
          enrollment_id: enrollment.id,
          provider: "manual",
          status: "paid",
          amount_cents: poolSettings.entry_fee_cents,
          paid_amount_cents: poolSettings.entry_fee_cents,
          order_nsu: orderNsu,
          paid_at: now,
          confirmed_by: profile.id,
        },
        { onConflict: "order_nsu" },
      );
      if (paymentError) throw new HttpError(400, paymentError.message);
      const { error } = await admin
        .from("enrollments")
        .update({ status: "active", activated_at: now, confirmed_by: profile.id })
        .eq("id", enrollment.id);
      if (error) throw new HttpError(400, error.message);
      await writeAudit(
        admin,
        profile.id,
        "pool.manual_payment_confirmed",
        "enrollment",
        enrollment.id,
        {
          amount_cents: poolSettings.entry_fee_cents,
        },
      );
      return json({ ok: true });
    }

    if (body.action === "remove_enrollment") {
      requireRole(profile, ["admin", "superadmin"]);
      if (body.confirmation !== "REMOVER") {
        throw new HttpError(400, "Confirmação inválida para remover inscrição.");
      }
      const enrollmentId = String(body.enrollment_id ?? "");
      if (!enrollmentId) throw new HttpError(400, "Informe a inscrição.");
      const { data: enrollment, error: enrollmentError } = await admin
        .from("enrollments")
        .select("*")
        .eq("id", enrollmentId)
        .single();
      if (enrollmentError) throw new HttpError(404, "Inscrição não encontrada.");
      if (["removed", "refund_pending"].includes(enrollment.status)) return json({ ok: true });

      const { error } = await admin
        .from("enrollments")
        .update({
          status: "refund_pending",
          note: "Inscrição removida pelo administrador. Reembolso manual pendente.",
        })
        .eq("id", enrollment.id);
      if (error) throw new HttpError(400, error.message);

      await insertNotification(
        admin,
        enrollment.user_id,
        "enrollment_removed",
        "Inscrição removida",
        "Você não faz mais parte do bolão. O reembolso será tratado manualmente pelo administrador.",
        {
          enrollment_id: enrollment.id,
          pool_id: enrollment.pool_id,
          dedupe_key: `enrollment_removed:${enrollment.id}`,
        },
      );
      await writeAudit(admin, profile.id, "pool.enrollment_removed", "enrollment", enrollment.id);
      return json({ ok: true });
    }

    if (body.action === "request_prize") {
      const ended = await poolEnded(admin, poolSettings);
      if (!ended) throw new HttpError(400, "A premiação ainda não está disponível.");
      const pixKey = String(body.pix_key ?? "").trim();
      if (pixKey.length < 3 || pixKey.length > 160) {
        throw new HttpError(400, "Informe uma chave Pix válida.");
      }
      const { data: ranking, error: rankingError } = await admin
        .from("ranking_pool")
        .select("rank_position")
        .eq("user_id", profile.id)
        .maybeSingle();
      if (rankingError) throw new HttpError(500, rankingError.message);
      if (!ranking || Number(ranking.rank_position) > 3) {
        throw new HttpError(403, "Você não está elegível para solicitar prêmio.");
      }
      const { data, error } = await admin
        .from("prize_requests")
        .upsert(
          { pool_id: poolSettings.id, user_id: profile.id, status: "requested", pix_key: pixKey },
          { onConflict: "pool_id,user_id" },
        )
        .select("*")
        .single();
      if (error) throw new HttpError(400, error.message);
      await notifyActiveStaff(
        admin,
        "admin_prize_requested",
        "Solicitação de prêmio",
        "Há uma nova solicitação de prêmio aguardando pagamento manual.",
        {
          prize_request_id: data.id,
          pool_id: poolSettings.id,
          user_id: profile.id,
          dedupe_key: `admin_prize_requested:${data.id}`,
        },
      );
      await writeAudit(admin, profile.id, "prize.requested", "prize_request", data.id);
      return json({ request: data });
    }

    if (body.action === "mark_prize_paid") {
      requireRole(profile, ["admin", "superadmin"]);
      const requestId = String(body.request_id ?? "");
      if (!requestId) throw new HttpError(400, "Informe a solicitação.");
      const { data: prizeRequest, error: requestError } = await admin
        .from("prize_requests")
        .select("*")
        .eq("id", requestId)
        .single();
      if (requestError) throw new HttpError(404, "Solicitação não encontrada.");

      const now = new Date().toISOString();
      const { error } = await admin
        .from("prize_requests")
        .update({
          status: "paid",
          reviewed_at: now,
          paid_at: now,
          reviewed_by: profile.id,
          note: typeof body.note === "string" ? body.note : null,
        })
        .eq("id", requestId);
      if (error) throw new HttpError(400, error.message);

      await insertNotification(
        admin,
        prizeRequest.user_id,
        "prize_paid",
        "Prêmio pago",
        "Seu prêmio do bolão foi marcado como pago pelo administrador.",
        {
          prize_request_id: prizeRequest.id,
          pool_id: prizeRequest.pool_id,
          dedupe_key: `prize_paid:${prizeRequest.id}`,
        },
      );
      await writeAudit(admin, profile.id, "prize.marked_paid", "prize_request", requestId);
      return json({ ok: true });
    }

    throw new HttpError(400, "Ação inválida.");
  } catch (error) {
    return errorResponse(error);
  }
});

function parseDate(value: unknown) {
  if (typeof value !== "string" || !value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function enrollmentAvailability(settings: PoolSettings) {
  const now = new Date();
  const opensAt = parseDate(settings.enrollment_opens_at);
  const closesAt = parseDate(settings.enrollment_closes_at);
  const endsAt = parseDate(settings.pool_ends_at);

  if (settings.status === "closed" || settings.status === "archived") {
    return { open: false, reason: "As inscrições estão encerradas." };
  }
  if (endsAt && now >= endsAt) {
    return { open: false, reason: "O bolão já foi encerrado." };
  }
  if (opensAt && now < opensAt) {
    return { open: false, reason: "As inscrições ainda não estão abertas." };
  }
  if (closesAt && now >= closesAt) {
    return { open: false, reason: "As inscrições estão encerradas." };
  }
  if (settings.enrollments_mode === "closed") {
    return { open: false, reason: "As inscrições estão encerradas." };
  }
  if (settings.enrollments_mode === "coming_soon" && (!opensAt || now < opensAt)) {
    return { open: false, reason: "As inscrições ainda não estão abertas." };
  }

  return { open: true, reason: "" };
}

async function poolEnded(admin: SupabaseClient, settings: PoolSettings) {
  const configuredEnd = parseDate(settings.pool_ends_at);
  if (configuredEnd) return configuredEnd <= new Date();

  const { data: finalMatch } = await admin
    .from("matches")
    .select("kickoff_at")
    .eq("stage", "final")
    .order("kickoff_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const finalDate = parseDate(finalMatch?.kickoff_at);
  if (finalDate) return finalDate <= new Date();

  const { data: lastMatch } = await admin
    .from("matches")
    .select("kickoff_at")
    .order("kickoff_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const lastDate = parseDate(lastMatch?.kickoff_at);
  return Boolean(lastDate && lastDate <= new Date());
}

async function insertNotification(
  admin: SupabaseClient,
  userId: string,
  type: string,
  title: string,
  message: string,
  data: Record<string, unknown>,
) {
  const { error } = await admin.from("notifications").insert({
    user_id: userId,
    type,
    title,
    message,
    data,
  });
  if (error && !error.message.includes("duplicate key")) throw new HttpError(400, error.message);
}

async function notifyActiveStaff(
  admin: SupabaseClient,
  type: string,
  title: string,
  message: string,
  data: Record<string, unknown>,
) {
  const { data: staff, error } = await admin
    .from("profiles")
    .select("id")
    .eq("status", "active")
    .in("role", ["admin", "superadmin"]);
  if (error) throw new HttpError(400, error.message);
  await Promise.all(
    (staff ?? []).map((item: { id: string }) =>
      insertNotification(admin, item.id, type, title, message, data),
    ),
  );
}
