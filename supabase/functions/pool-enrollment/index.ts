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
  | "request_prize"
  | "mark_prize_paid";

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

    if (body.action === "request") {
      if (settings.status === "closed" || settings.status === "archived") {
        throw new HttpError(400, "As inscrições estão encerradas.");
      }
      if (body.terms_accepted !== true) {
        throw new HttpError(400, "Aceite os termos para solicitar participação.");
      }
      const { data: existing } = await admin
        .from("enrollments")
        .select("id,status")
        .eq("pool_id", settings.id)
        .eq("user_id", profile.id)
        .maybeSingle();
      if (existing?.status === "active") return json({ enrollment: existing });

      const { data, error } = await admin
        .from("enrollments")
        .upsert(
          {
            pool_id: settings.id,
            user_id: profile.id,
            status: settings.entry_fee_cents === 0 ? "active" : "requested",
            terms_accepted_at: new Date().toISOString(),
            activated_at: settings.entry_fee_cents === 0 ? new Date().toISOString() : null,
          },
          { onConflict: "pool_id,user_id" },
        )
        .select("*")
        .single();
      if (error) throw new HttpError(400, error.message);
      await writeAudit(admin, profile.id, "pool.enrollment_requested", "enrollment", data.id, {
        auto_activated: settings.entry_fee_cents === 0,
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
      ];
      const patch: Record<string, unknown> = { updated_by: profile.id };
      for (const key of allowed) {
        if (key in body) patch[key] = body[key];
      }
      if (Object.keys(patch).length === 1)
        throw new HttpError(400, "Nenhuma configuração informada.");
      const { data, error } = await admin
        .from("pool_settings")
        .update(patch)
        .eq("id", settings.id)
        .select("*")
        .single();
      if (error) throw new HttpError(400, error.message);
      await writeAudit(
        admin,
        profile.id,
        "pool.settings_updated",
        "pool_settings",
        settings.id,
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
      const orderNsu = `manual-${enrollment.id}`;
      const now = new Date().toISOString();
      const { error: paymentError } = await admin.from("payments").upsert(
        {
          enrollment_id: enrollment.id,
          provider: "manual",
          status: "paid",
          amount_cents: settings.entry_fee_cents,
          paid_amount_cents: settings.entry_fee_cents,
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
          amount_cents: settings.entry_fee_cents,
        },
      );
      return json({ ok: true });
    }

    if (body.action === "request_prize") {
      if (settings.status !== "closed")
        throw new HttpError(400, "A premiação ainda não está disponível.");
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
          { pool_id: settings.id, user_id: profile.id, status: "requested" },
          { onConflict: "pool_id,user_id" },
        )
        .select("*")
        .single();
      if (error) throw new HttpError(400, error.message);
      await writeAudit(admin, profile.id, "prize.requested", "prize_request", data.id);
      return json({ request: data });
    }

    requireRole(profile, ["superadmin"]);
    const requestId = String(body.request_id ?? "");
    if (!requestId) throw new HttpError(400, "Informe a solicitação.");
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
    await writeAudit(admin, profile.id, "prize.marked_paid", "prize_request", requestId);
    return json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
});
