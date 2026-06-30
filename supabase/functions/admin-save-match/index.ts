import {
  authenticate,
  corsHeaders,
  errorResponse,
  HttpError,
  json,
  requireRole,
  writeAudit,
} from "../_shared/paupite.ts";

type MatchAction = "create" | "update" | "result" | "close";

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
  status?: "scheduled" | "live" | "finished";
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

    if (!["create", "update", "result", "close"].includes(body.action)) {
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

    if (body.action === "update") {
      validateOperational(body, false);
      if (current.status === "closed" && profile.role !== "superadmin") {
        throw new HttpError(403, "Somente o superadmin altera partida fechada.");
      }
      const kickoff = body.kickoff_at ? new Date(body.kickoff_at) : new Date(current.kickoff_at);
      const patch: Record<string, unknown> = {
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

      if (current.status === "live" && kickoff.getTime() > Date.now()) {
        Object.assign(patch, {
          status: "scheduled",
          home_score: 0,
          away_score: 0,
          regulation_home_score: null,
          regulation_away_score: null,
          qualified_team_id: null,
          qualification_method: null,
          manual_override: false,
        });
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

    if (body.action === "result") {
      const homeScore = score(body.home_score);
      const awayScore = score(body.away_score);
      const status = body.status === "live" ? "live" : "finished";
      const knockout = isKnockoutStage(current.stage);
      const qualification =
        status === "live"
          ? { qualified_team_id: null, qualification_method: null }
          : knockout
            ? validateKnockoutResult(current, homeScore, awayScore, body)
            : { qualified_team_id: null, qualification_method: null };
      const { error } = await admin
        .from("matches")
        .update({
          home_score: homeScore,
          away_score: awayScore,
          regulation_home_score: knockout && status === "finished" ? homeScore : null,
          regulation_away_score: knockout && status === "finished" ? awayScore : null,
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
      return json({ ok: true });
    }

    if (current.status !== "finished") {
      throw new HttpError(400, "Salve o resultado como encerrado antes de fechar a partida.");
    }

    const closeQualification = isKnockoutStage(current.stage)
      ? validateClosedKnockoutResult(current)
      : { qualified_team_id: null, qualification_method: null };

    if (isKnockoutStage(current.stage)) {
      const { error: qualificationError } = await admin
        .from("matches")
        .update({
          qualified_team_id: closeQualification.qualified_team_id,
          qualification_method: closeQualification.qualification_method,
        })
        .eq("id", body.match_id);
      if (qualificationError) throw new HttpError(400, qualificationError.message);
    }

    const { data: updated, error: rpcError } = await admin.rpc("admin_recalculate_match_points", {
      _match_id: body.match_id,
    });
    if (rpcError) throw new HttpError(400, rpcError.message);
    const { error: closeError } = await admin
      .from("matches")
      .update({ status: "closed" })
      .eq("id", body.match_id);
    if (closeError) throw new HttpError(400, closeError.message);
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

  if (homeScore !== awayScore) {
    const winnerId = homeScore > awayScore ? current.home_team_id : current.away_team_id;
    if (body.qualified_team_id && body.qualified_team_id !== winnerId) {
      throw new HttpError(400, "Classificado não confere com o placar informado.");
    }
    if (body.qualification_method === "penalties") {
      throw new HttpError(400, "Vitória com placar diferente não pode ser por pênaltis.");
    }
    return {
      qualified_team_id: winnerId,
      qualification_method:
        body.qualification_method === "extra_time" ? "extra_time" : "regulation",
    };
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

function validateClosedKnockoutResult(current: {
  home_team_id?: string | null;
  away_team_id?: string | null;
  home_score?: number | null;
  away_score?: number | null;
  regulation_home_score?: number | null;
  regulation_away_score?: number | null;
  qualified_team_id?: string | null;
  qualification_method?: "regulation" | "extra_time" | "penalties" | null;
}) {
  if (!current.home_team_id || !current.away_team_id) {
    throw new HttpError(400, "Defina as duas seleções antes de fechar o mata-mata.");
  }

  const homeScore = current.regulation_home_score ?? current.home_score;
  const awayScore = current.regulation_away_score ?? current.away_score;

  if (!Number.isInteger(homeScore) || !Number.isInteger(awayScore)) {
    throw new HttpError(400, "Placar inválido para fechamento do mata-mata.");
  }

  if (homeScore !== awayScore) {
    const winnerId = homeScore! > awayScore! ? current.home_team_id : current.away_team_id;
    if (current.qualified_team_id && current.qualified_team_id !== winnerId) {
      throw new HttpError(400, "Classificado salvo não confere com o placar do mata-mata.");
    }
    if (current.qualification_method === "penalties") {
      throw new HttpError(400, "Vitória com placar diferente não pode ser por pênaltis.");
    }
    return {
      qualified_team_id: winnerId,
      qualification_method:
        current.qualification_method === "extra_time" ? "extra_time" : "regulation",
    };
  }

  if (![current.home_team_id, current.away_team_id].includes(current.qualified_team_id ?? "")) {
    throw new HttpError(400, "Informe o classificado antes de fechar o mata-mata empatado.");
  }
  if (!["extra_time", "penalties"].includes(current.qualification_method ?? "")) {
    throw new HttpError(
      400,
      "Empate no mata-mata exige prorrogação ou pênaltis antes do fechamento.",
    );
  }

  return {
    qualified_team_id: current.qualified_team_id,
    qualification_method: current.qualification_method,
  };
}
