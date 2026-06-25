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

    if (body.action === "result") {
      const homeScore = score(body.home_score);
      const awayScore = score(body.away_score);
      const status = body.status === "live" ? "live" : "finished";
      const { error } = await admin
        .from("matches")
        .update({
          home_score: homeScore,
          away_score: awayScore,
          status,
          manual_override: true,
        })
        .eq("id", body.match_id);
      if (error) throw new HttpError(400, error.message);
      await writeAudit(admin, profile.id, "match.result_updated", "match", body.match_id, {
        home_score: homeScore,
        away_score: awayScore,
        status,
      });
      return json({ ok: true });
    }

    if (current.status === "scheduled") {
      throw new HttpError(400, "Lance o resultado antes de fechar a partida.");
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
