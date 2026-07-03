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
type QualificationMethod = "regulation" | "extra_time" | "penalties";

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
  regulation_home_score?: number | null;
  regulation_away_score?: number | null;
  qualified_team_id?: string | null;
  qualification_method?: QualificationMethod | null;
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
      const result = validateMatchResult(current, homeScore, awayScore, status, body);
      const { error } = await admin
        .from("matches")
        .update({
          home_score: homeScore,
          away_score: awayScore,
          regulation_home_score: result.regulation_home_score,
          regulation_away_score: result.regulation_away_score,
          qualified_team_id: result.qualified_team_id,
          qualification_method: result.qualification_method,
          status,
          manual_override: true,
        })
        .eq("id", body.match_id);
      if (error) throw new HttpError(400, error.message);
      await writeAudit(admin, profile.id, "match.result_updated", "match", body.match_id, {
        home_score: homeScore,
        away_score: awayScore,
        regulation_home_score: result.regulation_home_score,
        regulation_away_score: result.regulation_away_score,
        qualified_team_id: result.qualified_team_id,
        qualification_method: result.qualification_method,
        status,
      });
      return json({ ok: true });
    }

    if (current.status !== "finished") {
      throw new HttpError(400, "Salve o resultado como encerrado antes de fechar a partida.");
    }

    const { data: finalizedRows, error: rpcError } = await admin.rpc(
      "admin_finalize_match_result",
      {
        _match_id: body.match_id,
        _actor_id: profile.id,
      },
    );
    if (rpcError) throw new HttpError(400, rpcError.message);
    const finalized = Array.isArray(finalizedRows) ? finalizedRows[0] : finalizedRows;
    await writeAudit(admin, profile.id, "match.closed_and_scored", "match", body.match_id, {
      bets_updated: finalized?.bets_updated ?? 0,
    });
    return json({ updated: finalized?.bets_updated ?? 0, match: finalized ?? null });
  } catch (error) {
    return errorResponse(error);
  }
});

function clean(value: string | null | undefined) {
  const normalized = value?.trim();
  return normalized || null;
}

type ResultStatus = "live" | "finished";

interface ValidatedMatchResult {
  regulation_home_score: number | null;
  regulation_away_score: number | null;
  qualified_team_id: string | null;
  qualification_method: QualificationMethod | null;
}

function score(value: number | undefined) {
  if (!Number.isInteger(value)) throw new HttpError(400, "Placar deve ser número inteiro.");
  if (value! < 0) throw new HttpError(400, "Placar não pode ser negativo.");
  if (value! > 99) throw new HttpError(400, "Placar deve ser menor que 100.");
  return value!;
}

function validateMatchResult(
  current: {
    home_team_id?: string | null;
    away_team_id?: string | null;
    stage?: string | null;
  },
  homeScore: number,
  awayScore: number,
  status: ResultStatus,
  body: MatchPayload,
): ValidatedMatchResult {
  if (status === "live") {
    return {
      regulation_home_score: null,
      regulation_away_score: null,
      qualified_team_id: null,
      qualification_method: null,
    };
  }

  if (!isKnockoutStage(current.stage)) {
    if (
      body.qualified_team_id ||
      body.qualification_method ||
      body.regulation_home_score != null ||
      body.regulation_away_score != null
    ) {
      throw new HttpError(
        400,
        "Fase de grupos não permite classificado ou método de classificação.",
      );
    }

    return {
      regulation_home_score: null,
      regulation_away_score: null,
      qualified_team_id: null,
      qualification_method: null,
    };
  }

  if (!current.home_team_id || !current.away_team_id) {
    throw new HttpError(400, "Defina as duas seleções antes de lançar o resultado do mata-mata.");
  }

  if (!isQualificationMethod(body.qualification_method)) {
    throw new HttpError(
      400,
      body.qualification_method
        ? "Método de classificação inválido."
        : "Partida mata-mata encerrada sem qualification_method.",
    );
  }

  if (body.qualification_method === "regulation") {
    return validateRegulationResult(current, homeScore, awayScore, body);
  }
  if (body.qualification_method === "extra_time") {
    return validateExtraTimeResult(current, homeScore, awayScore, body);
  }
  return validatePenaltiesResult(current, homeScore, awayScore, body);
}

function validateRegulationResult(
  current: { home_team_id?: string | null; away_team_id?: string | null },
  homeScore: number,
  awayScore: number,
  body: MatchPayload,
): ValidatedMatchResult {
  const winnerId = winnerFor(homeScore, awayScore, current.home_team_id!, current.away_team_id!);
  if (!winnerId) {
    throw new HttpError(
      400,
      "Partida decidida no tempo regulamentar precisa ter vencedor no placar final.",
    );
  }
  if (!body.qualified_team_id) {
    throw new HttpError(400, "Partida mata-mata encerrada sem qualified_team_id.");
  }
  if (!isMatchTeam(body.qualified_team_id, current)) {
    throw new HttpError(400, "Classificado não pertence à partida.");
  }
  if (body.qualified_team_id !== winnerId) {
    throw new HttpError(400, "Classificado diferente do vencedor em tempo regulamentar.");
  }
  if (
    hasSubmittedRegulationScore(body) &&
    (body.regulation_home_score !== homeScore || body.regulation_away_score !== awayScore)
  ) {
    throw new HttpError(
      400,
      "Campos dos 90 minutos devem corresponder ao placar final em tempo regulamentar.",
    );
  }

  return {
    regulation_home_score: homeScore,
    regulation_away_score: awayScore,
    qualified_team_id: winnerId,
    qualification_method: "regulation",
  };
}

function validateExtraTimeResult(
  current: { home_team_id?: string | null; away_team_id?: string | null },
  homeScore: number,
  awayScore: number,
  body: MatchPayload,
): ValidatedMatchResult {
  const regulationScore = requiredRegulationScore(body);
  if (regulationScore.home !== regulationScore.away) {
    throw new HttpError(
      400,
      "Partida decidida na prorrogação precisa estar empatada ao fim dos 90 minutos.",
    );
  }

  const winnerId = winnerFor(homeScore, awayScore, current.home_team_id!, current.away_team_id!);
  if (!winnerId) {
    throw new HttpError(
      400,
      "Partida decidida na prorrogação precisa ter vencedor após 120 minutos.",
    );
  }
  if (!body.qualified_team_id) {
    throw new HttpError(400, "Partida mata-mata encerrada sem qualified_team_id.");
  }
  if (!isMatchTeam(body.qualified_team_id, current)) {
    throw new HttpError(400, "Classificado não pertence à partida.");
  }
  if (body.qualified_team_id !== winnerId) {
    throw new HttpError(400, "Classificado diferente do vencedor na prorrogação.");
  }

  return {
    regulation_home_score: regulationScore.home,
    regulation_away_score: regulationScore.away,
    qualified_team_id: winnerId,
    qualification_method: "extra_time",
  };
}

function validatePenaltiesResult(
  current: { home_team_id?: string | null; away_team_id?: string | null },
  homeScore: number,
  awayScore: number,
  body: MatchPayload,
): ValidatedMatchResult {
  const regulationScore = requiredRegulationScore(body);
  if (regulationScore.home !== regulationScore.away) {
    throw new HttpError(
      400,
      "Partida decidida nos pênaltis precisa estar empatada ao fim dos 90 minutos.",
    );
  }
  if (homeScore !== awayScore) {
    throw new HttpError(
      400,
      "No campo de placar, informe resultado após 120 minutos, sem incluir cobranças de pênaltis.",
    );
  }
  if (!body.qualified_team_id) {
    throw new HttpError(400, "Informe seleção classificada na disputa de pênaltis.");
  }
  if (!isMatchTeam(body.qualified_team_id, current)) {
    throw new HttpError(400, "Classificado não pertence à partida.");
  }

  return {
    regulation_home_score: regulationScore.home,
    regulation_away_score: regulationScore.away,
    qualified_team_id: body.qualified_team_id,
    qualification_method: "penalties",
  };
}

function requiredRegulationScore(body: MatchPayload) {
  if (body.regulation_home_score == null || body.regulation_away_score == null) {
    throw new HttpError(400, "Informe placar aos 90 minutos.");
  }

  return {
    home: score(body.regulation_home_score),
    away: score(body.regulation_away_score),
  };
}

function hasSubmittedRegulationScore(body: MatchPayload) {
  return body.regulation_home_score != null || body.regulation_away_score != null;
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

function winnerFor(
  homeScore: number,
  awayScore: number,
  homeTeamId: string,
  awayTeamId: string,
) {
  if (homeScore > awayScore) return homeTeamId;
  if (awayScore > homeScore) return awayTeamId;
  return null;
}

function isMatchTeam(
  teamId: string,
  current: { home_team_id?: string | null; away_team_id?: string | null },
) {
  return teamId === current.home_team_id || teamId === current.away_team_id;
}

function isQualificationMethod(value: unknown): value is QualificationMethod {
  return value === "regulation" || value === "extra_time" || value === "penalties";
}
