import {
  authenticate,
  corsHeaders,
  errorResponse,
  HttpError,
  json,
  requireRole,
  writeAudit,
} from "../_shared/paupite.ts";

type MatchAction =
  | "create"
  | "update"
  | "result"
  | "close"
  | "correct_score"
  | "recalculate"
  | "set_status"
  | "soft_delete";

interface MatchPayload {
  action: MatchAction;
  match_id?: string;
  competition_id?: string | null;
  home_team_id?: string | null;
  away_team_id?: string | null;
  kickoff_at?: string;
  stage?: string | null;
  group_name?: string | null;
  venue?: string | null;
  city?: string | null;
  country?: string | null;
  status?: "scheduled" | "open" | "locked" | "live" | "finished" | "closed" | "scored" | "canceled";
  home_score?: number;
  away_score?: number;
  qualified_team_id?: string | null;
  qualification_method?: "regulation" | "extra_time" | "penalties" | null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed." }, 405);

  try {
    const { profile, admin } = await authenticate(req);
    requireRole(profile, ["admin", "superadmin"]);
    const body = (await req.json()) as MatchPayload;

    if (
      ![
        "create",
        "update",
        "result",
        "close",
        "correct_score",
        "recalculate",
        "set_status",
        "soft_delete",
      ].includes(body.action)
    ) {
      throw new HttpError(400, "Ação de partida inválida.");
    }

    if (body.action === "create") {
      validateOperational(body, true);
      const kickoff = new Date(body.kickoff_at!);
      if (kickoff <= new Date()) throw new HttpError(400, "Novas partidas devem ser futuras.");
      const { data, error } = await admin
        .from("matches")
        .insert({
          competition_id: body.competition_id ?? null,
          home_team_id: body.home_team_id,
          away_team_id: body.away_team_id,
          kickoff_at: kickoff.toISOString(),
          stage: clean(body.stage),
          group_name: clean(body.group_name),
          venue: clean(body.venue),
          city: clean(body.city),
          country: clean(body.country),
          status: "scheduled",
          home_score: 0,
          away_score: 0,
        })
        .select("id")
        .single();
      if (error) throw new HttpError(400, error.message);
      await writeAudit(admin, profile.id, "match.created", "match", data.id);
      return json({ id: data.id });
    }

    if (!body.match_id) throw new HttpError(400, "Informe a partida.");
    const { data: current, error: currentError } = await admin
      .from("matches")
      .select("*")
      .eq("id", body.match_id)
      .maybeSingle();
    if (currentError) throw new HttpError(500, currentError.message);
    if (!current) throw new HttpError(404, "Partida não encontrada.");

    if (body.action === "soft_delete") {
      const { data: affected, error: rpcError } = await admin.rpc("admin_soft_delete_match", {
        _match_id: body.match_id,
      });
      if (rpcError) throw new HttpError(400, rpcError.message);
      await writeAudit(admin, profile.id, "match.soft_deleted", "match", body.match_id, {
        bets_reset: affected,
      });
      return json({ updated: affected });
    }

    if (body.action === "set_status") {
      const status = normalizeAdminStatus(body.status);
      const { data: affected, error: rpcError } = await admin.rpc("admin_set_match_status", {
        _match_id: body.match_id,
        _new_status: status,
      });
      if (rpcError) throw new HttpError(400, rpcError.message);
      await writeAudit(admin, profile.id, "match.status_updated", "match", body.match_id, {
        status,
        bets_updated: affected,
      });
      return json({ updated: affected });
    }

    if (body.action === "recalculate") {
      const { data: affected, error: rpcError } = await admin.rpc(
        "admin_recalculate_match_points",
        {
          _match_id: body.match_id,
        },
      );
      if (rpcError) throw new HttpError(400, rpcError.message);
      await writeAudit(admin, profile.id, "match.points_recalculated", "match", body.match_id, {
        bets_updated: affected,
      });
      return json({ updated: affected });
    }

    if (body.action === "update") {
      validateOperational(body, false);
      if (current.status === "closed" && profile.role !== "superadmin") {
        throw new HttpError(403, "Somente o superadmin altera partida fechada.");
      }
      const kickoff = body.kickoff_at ? new Date(body.kickoff_at) : new Date(current.kickoff_at);
      const patch = {
        competition_id: body.competition_id ?? current.competition_id,
        home_team_id: body.home_team_id ?? current.home_team_id,
        away_team_id: body.away_team_id ?? current.away_team_id,
        kickoff_at: kickoff.toISOString(),
        stage: body.stage === undefined ? current.stage : clean(body.stage),
        group_name: body.group_name === undefined ? current.group_name : clean(body.group_name),
        venue: body.venue === undefined ? current.venue : clean(body.venue),
        city: body.city === undefined ? current.city : clean(body.city),
        country: body.country === undefined ? current.country : clean(body.country),
      };
      if (patch.home_team_id && patch.away_team_id && patch.home_team_id === patch.away_team_id) {
        throw new HttpError(400, "Uma seleção não pode enfrentar ela mesma.");
      }
      const { error } = await admin.from("matches").update(patch).eq("id", body.match_id);
      if (error) throw new HttpError(400, error.message);
      await writeAudit(
        admin,
        profile.id,
        "match.operational_updated",
        "match",
        body.match_id,
        patch,
      );
      return json({ ok: true });
    }

    if (new Date(current.kickoff_at) > new Date()) {
      throw new HttpError(400, "Não é permitido lançar placar antes do início da partida.");
    }

    if (body.action === "correct_score") {
      const homeScore = score(body.home_score);
      const awayScore = score(body.away_score);
      const { data: affected, error: rpcError } = await admin.rpc("admin_update_match_score", {
        _match_id: body.match_id,
        _new_home_score: homeScore,
        _new_away_score: awayScore,
      });
      if (rpcError) throw new HttpError(400, rpcError.message);
      await writeAudit(admin, profile.id, "match.score_corrected", "match", body.match_id, {
        home_score: homeScore,
        away_score: awayScore,
        bets_updated: affected,
      });
      return json({ updated: affected });
    }

    if (body.action === "result") {
      const homeScore = score(body.home_score);
      const awayScore = score(body.away_score);
      const status =
        body.status === "live"
          ? "live"
          : body.status === "closed" || body.status === "scored"
            ? body.status
            : "finished";
      const knockout = isKnockoutStage(current.stage);
      const qualification = knockout
        ? validateKnockoutResult(current, homeScore, awayScore, body)
        : { qualified_team_id: null, qualification_method: null };
      const { error } = await admin
        .from("matches")
        .update({
          home_score: homeScore,
          away_score: awayScore,
          regulation_home_score: knockout ? homeScore : null,
          regulation_away_score: knockout ? awayScore : null,
          qualified_team_id: qualification.qualified_team_id,
          qualification_method: qualification.qualification_method,
          status,
          manual_override: true,
        })
        .eq("id", body.match_id);
      if (error) throw new HttpError(400, error.message);
      await writeAudit(admin, profile.id, "match.result_updated", "match", body.match_id, {
        home_score: homeScore,
        away_score: awayScore,
        qualified_team_id: qualification.qualified_team_id,
        qualification_method: qualification.qualification_method,
        status,
      });
      if (status === "closed" || status === "scored") {
        const { error: rpcError } = await admin.rpc("admin_recalculate_match_points", {
          _match_id: body.match_id,
        });
        if (rpcError) throw new HttpError(400, rpcError.message);
      }
      return json({ ok: true });
    }

    if (["scheduled", "open", "locked"].includes(current.status)) {
      throw new HttpError(400, "Lance o resultado antes de fechar a partida.");
    }
    const { data: updated, error: rpcError } = await admin.rpc("admin_set_match_status", {
      _match_id: body.match_id,
      _new_status: "closed",
    });
    if (rpcError) throw new HttpError(400, rpcError.message);
    await writeAudit(admin, profile.id, "match.closed_and_scored", "match", body.match_id, {
      bets_updated: updated,
    });
    return json({ updated });
  } catch (error) {
    return errorResponse(error);
  }
});

function clean(value: string | null | undefined) {
  const normalized = value?.trim();
  return normalized || null;
}

function score(value: number | undefined) {
  if (!Number.isInteger(value) || value! < 0 || value! > 99) {
    throw new HttpError(400, "Placar inválido.");
  }
  return value!;
}

function validateOperational(body: MatchPayload, create: boolean) {
  if (create && (!body.home_team_id || !body.away_team_id || !body.kickoff_at)) {
    throw new HttpError(400, "Informe seleções e data da partida.");
  }
  if (body.home_team_id && body.away_team_id && body.home_team_id === body.away_team_id) {
    throw new HttpError(400, "Uma seleção não pode enfrentar ela mesma.");
  }
  if (body.kickoff_at && Number.isNaN(new Date(body.kickoff_at).getTime())) {
    throw new HttpError(400, "Data da partida inválida.");
  }
}

function normalizeAdminStatus(value: string | undefined) {
  const status = value === "finished" ? "closed" : value;
  if (
    !["scheduled", "open", "locked", "live", "closed", "scored", "canceled"].includes(status ?? "")
  ) {
    throw new HttpError(400, "Status de partida inválido.");
  }
  return status!;
}

function normalizeKnockoutStage(stage: string | null | undefined) {
  if (stage === "quarter_finals" || stage === "quarter-finals") return "quarterfinal";
  if (stage === "semi_finals" || stage === "semi-finals") return "semifinal";
  return stage ?? null;
}

function isKnockoutStage(stage: string | null | undefined) {
  return [
    "round_of_32",
    "round_of_16",
    "quarterfinal",
    "semifinal",
    "third_place",
    "final",
  ].includes(normalizeKnockoutStage(stage) ?? "");
}

function validateKnockoutResult(
  current: {
    home_team_id?: string | null;
    away_team_id?: string | null;
    stage?: string | null;
  },
  homeScore: number,
  awayScore: number,
  body: MatchPayload,
) {
  if (!current.home_team_id || !current.away_team_id) {
    throw new HttpError(400, "Defina as duas seleções antes de lançar o resultado do mata-mata.");
  }

  if (homeScore > awayScore) {
    return { qualified_team_id: current.home_team_id, qualification_method: "regulation" };
  }
  if (awayScore > homeScore) {
    return { qualified_team_id: current.away_team_id, qualification_method: "regulation" };
  }

  if (![current.home_team_id, current.away_team_id].includes(body.qualified_team_id ?? "")) {
    throw new HttpError(400, "Informe o classificado do confronto.");
  }
  if (!["extra_time", "penalties"].includes(body.qualification_method ?? "")) {
    throw new HttpError(400, "Empate no tempo regulamentar exige prorrogação ou pênaltis.");
  }

  return {
    qualified_team_id: body.qualified_team_id,
    qualification_method: body.qualification_method,
  };
}
