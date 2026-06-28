import {
  authenticate,
  corsHeaders,
  errorResponse,
  HttpError,
  json,
  requireRole,
  writeAudit,
} from "../_shared/paupite.ts";
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

interface ImportTeam {
  id: string;
  name: string;
  short_name?: string;
  flag_code?: string | null;
  flag_path?: string | null;
}

interface ImportMatch {
  id: string;
  match_number?: number;
  kickoff_datetime: string;
  stage?: string;
  group?: string;
  stadium?: string;
  city?: string;
  country?: string;
  status?: "scheduled" | "live" | "finished" | "closed";
  home_team: ImportTeam;
  away_team: ImportTeam;
  score?: { home?: number | null; away?: number | null };
}

interface ImportPayload {
  competition?: { id?: string; name?: string; data_version?: string };
  matches?: ImportMatch[];
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed." }, 405);

  try {
    const { profile, admin } = await authenticate(req);
    requireRole(profile, ["superadmin"]);
    const payload = (await req.json()) as ImportPayload;
    if (!Array.isArray(payload.matches) || payload.matches.length === 0) {
      throw new HttpError(400, "O JSON precisa conter uma lista não vazia de partidas.");
    }
    if (payload.matches.length > 300)
      throw new HttpError(400, "O JSON excede o limite de 300 partidas.");

    const errors: Array<{ match: string; error: string }> = [];
    let createdCount = 0;
    let updatedCount = 0;
    let skippedCount = 0;

    let competitionId: string | null = null;
    const competitionName = payload.competition?.name?.trim();
    if (competitionName) {
      const { data: existingCompetition } = await admin
        .from("competitions")
        .select("id")
        .eq("name", competitionName)
        .maybeSingle();
      if (existingCompetition) {
        competitionId = existingCompetition.id;
      } else {
        const { data: created, error } = await admin
          .from("competitions")
          .insert({ name: competitionName, season: "2026", status: "active" })
          .select("id")
          .single();
        if (error) throw new HttpError(400, error.message);
        competitionId = created.id;
      }
    }

    const teamCache = new Map<string, string>();
    for (const item of payload.matches) {
      try {
        validateMatch(item);
        const homeSource = parseBracketSource(item.home_team);
        const awaySource = parseBracketSource(item.away_team);
        const homeTeamId = homeSource ? null : await upsertTeam(admin, item.home_team, teamCache);
        const awayTeamId = awaySource ? null : await upsertTeam(admin, item.away_team, teamCache);
        if (homeTeamId && awayTeamId && homeTeamId === awayTeamId) {
          throw new Error("As seleções da partida são iguais.");
        }

        const kickoff = new Date(item.kickoff_datetime);
        const future = kickoff > new Date();
        const requestedStatus = item.status ?? "scheduled";
        const status = future ? "scheduled" : requestedStatus;
        const homeScore = future ? 0 : normalizeScore(item.score?.home);
        const awayScore = future ? 0 : normalizeScore(item.score?.away);
        const row = {
          external_key: item.id,
          match_number: item.match_number ?? null,
          competition_id: competitionId,
          kickoff_at: kickoff.toISOString(),
          stage: normalizeStage(item.stage),
          group_name: clean(item.group),
          venue: clean(item.stadium),
          city: clean(item.city),
          country: clean(item.country),
          home_team_id: homeTeamId,
          away_team_id: awayTeamId,
          bracket_source_home: homeSource?.source ?? null,
          bracket_source_away: awaySource?.source ?? null,
          bracket_home_source_match_number: homeSource?.matchNumber ?? null,
          bracket_home_source_result: homeSource?.result ?? null,
          bracket_away_source_match_number: awaySource?.matchNumber ?? null,
          bracket_away_source_result: awaySource?.result ?? null,
          status,
          home_score: homeScore,
          away_score: awayScore,
          manual_override: status !== "scheduled",
        };

        const { data: existing, error: existingError } = await admin
          .from("matches")
          .select("id,status,home_score,away_score")
          .eq("external_key", item.id)
          .maybeSingle();
        if (existingError) throw new Error(existingError.message);

        if (existing) {
          const { error } = await admin.from("matches").update(row).eq("id", existing.id);
          if (error) throw new Error(error.message);
          updatedCount += 1;
          if (status === "closed") {
            const { error: rpcError } = await admin.rpc("admin_recalculate_match_points", {
              _match_id: existing.id,
            });
            if (rpcError) throw new Error(rpcError.message);
          }
        } else {
          const { data: created, error } = await admin
            .from("matches")
            .insert(row)
            .select("id")
            .single();
          if (error) throw new Error(error.message);
          createdCount += 1;
          if (status === "closed") {
            const { error: rpcError } = await admin.rpc("admin_recalculate_match_points", {
              _match_id: created.id,
            });
            if (rpcError) throw new Error(rpcError.message);
          }
        }
      } catch (error) {
        skippedCount += 1;
        errors.push({
          match: typeof item?.id === "string" ? item.id : "sem-id",
          error: error instanceof Error ? error.message : "Erro de importação.",
        });
      }
    }

    const { data: importLog, error: importError } = await admin
      .from("match_imports")
      .insert({
        imported_by: profile.id,
        source_version: payload.competition?.data_version ?? null,
        created_count: createdCount,
        updated_count: updatedCount,
        skipped_count: skippedCount,
        errors,
      })
      .select("id")
      .single();
    if (importError) throw new HttpError(500, importError.message);

    await writeAudit(admin, profile.id, "matches.json_imported", "match_import", importLog.id, {
      created_count: createdCount,
      updated_count: updatedCount,
      skipped_count: skippedCount,
    });
    return json({
      import_id: importLog.id,
      created_count: createdCount,
      updated_count: updatedCount,
      skipped_count: skippedCount,
      errors,
    });
  } catch (error) {
    return errorResponse(error);
  }
});

function validateMatch(match: ImportMatch) {
  if (!match || typeof match !== "object") throw new Error("Partida inválida.");
  if (!match.id?.trim()) throw new Error("Partida sem id.");
  if (!match.home_team?.id || !match.home_team.name) throw new Error("Seleção mandante inválida.");
  if (!match.away_team?.id || !match.away_team.name) throw new Error("Seleção visitante inválida.");
  if (Number.isNaN(new Date(match.kickoff_datetime).getTime())) throw new Error("Data inválida.");
  if (
    (match.status === "finished" || match.status === "closed") &&
    (!Number.isInteger(match.score?.home) || !Number.isInteger(match.score?.away))
  ) {
    throw new Error("Partida encerrada precisa ter placar válido.");
  }
}

async function upsertTeam(admin: SupabaseClient, team: ImportTeam, cache: Map<string, string>) {
  const cached = cache.get(team.id);
  if (cached) return cached;
  const row = {
    external_key: team.id,
    name: team.name.trim(),
    short_name: clean(team.short_name),
    country_code: clean(team.flag_code)?.toUpperCase() ?? null,
    flag_url: team.flag_code ? `/flags/${team.flag_code.toLowerCase()}.svg` : null,
  };
  const { data: byKey } = await admin
    .from("teams")
    .select("id")
    .eq("external_key", team.id)
    .maybeSingle();
  const { data: byName } = byKey
    ? { data: null }
    : await admin.from("teams").select("id").ilike("name", team.name.trim()).limit(1).maybeSingle();

  const query =
    byKey?.id || byName?.id
      ? admin
          .from("teams")
          .update(row)
          .eq("id", byKey?.id ?? byName!.id)
      : admin.from("teams").insert(row);
  const { data, error } = await query.select("id").single();
  if (error) throw new Error(error.message);
  cache.set(team.id, data.id);
  return data.id as string;
}

function clean(value: string | null | undefined) {
  return value?.trim() || null;
}

function normalizeStage(value: string | undefined) {
  const stage = clean(value);
  if (stage === "quarter_finals" || stage === "quarter-finals") return "quarterfinal";
  if (stage === "semi_finals" || stage === "semi-finals") return "semifinal";
  return stage;
}

function parseBracketSource(team: ImportTeam) {
  const match = team.id.match(/^(winner|runner-up|loser)-match-(\d+)$/);
  if (!match) return null;
  return {
    source: team.id,
    result: match[1] === "winner" ? "winner" : "loser",
    matchNumber: Number(match[2]),
  };
}

function normalizeScore(value: number | null | undefined) {
  return Number.isInteger(value) && value! >= 0 && value! <= 99 ? value : 0;
}
