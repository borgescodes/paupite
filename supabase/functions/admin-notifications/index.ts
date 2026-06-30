// Edge Function: admin-notifications
// Central de Controle de Notificações — somente superadmin ativo.
// Calcula destinatários no backend, valida links, cria campanha e dispara
// uma notificação por destinatário. Também serve o relatório por campanha.
//
// Nunca expõe service role ao frontend. JWT validado via authenticate().
import {
  authenticate,
  corsHeaders,
  errorResponse,
  HttpError,
  json,
  requireRole,
} from "../_shared/paupite.ts";
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const POOL_SLUG = "world-cup-2026";
const INSERT_CHUNK = 500;

type TargetMode = "specific" | "resenha" | "pool" | "geral";
type SendType = "manual" | "match_reminder" | "special_reminder";

interface SendPayload {
  action: "send";
  send_type: SendType;
  message?: string;
  action_url?: string | null;
  target_mode?: TargetMode;
  target_user_ids?: string[];
  match_id?: string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed." }, 405);

  try {
    const { profile, admin } = await authenticate(req);
    // MVP: somente superadmin. Admin/player são rejeitados aqui no backend.
    requireRole(profile, ["superadmin"]);

    const body = (await req.json()) as { action?: string } & Record<string, unknown>;
    const action = body.action ?? "send";

    if (action === "list_campaigns") return await listCampaigns(admin);
    if (action === "campaign_report") {
      const id = String(body.campaign_id ?? "");
      if (!id) throw new HttpError(400, "Informe a campanha.");
      return await campaignReport(admin, id);
    }
    if (action === "send") return await handleSend(admin, profile.id, body as SendPayload);

    throw new HttpError(400, "Ação inválida.");
  } catch (error) {
    return errorResponse(error);
  }
});

// ---------------------------------------------------------------------------
// Envio
// ---------------------------------------------------------------------------
async function handleSend(admin: SupabaseClient, actorId: string, body: SendPayload) {
  const poolId = await resolvePoolId(admin);

  let type: string;
  let title: string;
  let message: string;
  let targetMode: string;
  let actionLabel: string | null = null;
  let actionUrl: string | null = null;
  let internalRoute: string | null = null;
  let recipientIds: string[] = [];
  // dados extra por destinatário (ex.: preview de bandeiras do jogo)
  let extraData: Record<string, unknown> = {};

  if (body.send_type === "manual") {
    message = (body.message ?? "").trim();
    if (!message) throw new HttpError(400, "A mensagem é obrigatória.");
    if (message.length > 2000) throw new HttpError(400, "Mensagem muito longa.");

    actionUrl = validateExternalLink(body.action_url ?? null);
    targetMode = body.target_mode ?? "geral";
    type = "system_broadcast";
    title = "Sistema informa";
    if (actionUrl) actionLabel = "Acessar link";

    recipientIds = await resolveAudience(
      admin,
      poolId,
      targetMode as TargetMode,
      body.target_user_ids,
    );
  } else if (body.send_type === "match_reminder") {
    const matchId = String(body.match_id ?? "");
    if (!matchId) throw new HttpError(400, "Selecione um jogo.");

    const match = await loadMatch(admin, matchId);
    if (!match) throw new HttpError(404, "Jogo não encontrado.");
    if (match.status !== "scheduled" || new Date(match.kickoff_at) <= new Date()) {
      throw new HttpError(400, "O jogo precisa estar agendado e ainda aberto para palpite.");
    }

    type = "bet_reminder";
    title = "Palpite pendente";
    message = `Você ainda não fez seu palpite para ${match.home} x ${match.away}.`;
    targetMode = "match_pending";
    actionLabel = "Fazer Palpite";
    internalRoute = `/home?matchId=${matchId}`;
    extraData = {
      match_id: matchId,
      home: match.home,
      away: match.away,
      home_country_code: match.home_country_code,
      away_country_code: match.away_country_code,
    };

    // (a) somente players, ativos, sem palpite neste jogo.
    recipientIds = await resolveMatchPending(admin, matchId);
  } else if (body.send_type === "special_reminder") {
    // (c) bloqueia envio quando os especiais já estão encerrados (lock).
    const lockAt = await specialsLockAt(admin, poolId);
    if (lockAt && lockAt <= new Date()) {
      throw new HttpError(
        400,
        `Palpites especiais já encerrados (lock em ${lockAt.toISOString()}). Lembrete bloqueado.`,
      );
    }

    type = "special_reminder";
    title = "Palpites especiais pendentes";
    message = "Você ainda não fez seus palpites especiais (campeão, vice, artilheiro...).";
    targetMode = "specials_pending";
    actionLabel = "Fazer Palpite";
    internalRoute = "/pool?tab=specials";

    // (b) membro ativo do pool SEM nenhuma linha em special_predictions.
    recipientIds = await resolveSpecialsPending(admin, poolId);
  } else {
    throw new HttpError(400, "Tipo de envio inválido.");
  }

  if (recipientIds.length === 0) {
    throw new HttpError(400, "Nenhum destinatário elegível para este envio.");
  }

  // 1) cria a campanha
  const { data: campaign, error: campaignError } = await admin
    .from("notification_campaigns")
    .insert({
      created_by: actorId,
      type,
      title,
      message,
      target_mode: targetMode,
      action_label: actionLabel,
      action_url: actionUrl,
      internal_route: internalRoute,
    })
    .select("id")
    .single();
  if (campaignError || !campaign) {
    throw new HttpError(500, campaignError?.message ?? "Falha ao criar campanha.");
  }
  const campaignId = campaign.id as string;

  // 2) uma notificação por destinatário (service role, dentro da function)
  const rows = recipientIds.map((userId) => ({
    user_id: userId,
    type,
    title,
    message,
    campaign_id: campaignId,
    data: {
      ...extraData,
      ...(actionUrl ? { action_url: actionUrl } : {}),
      ...(internalRoute ? { internal_route: internalRoute } : {}),
      ...(actionLabel ? { action_label: actionLabel } : {}),
      campaign_id: campaignId,
      dedupe_key: `campaign:${campaignId}:${userId}`,
    },
  }));

  let inserted = 0;
  for (let i = 0; i < rows.length; i += INSERT_CHUNK) {
    const chunk = rows.slice(i, i + INSERT_CHUNK);
    const { error: insertError, count } = await admin
      .from("notifications")
      .insert(chunk, { count: "exact" });
    if (insertError) throw new HttpError(500, insertError.message);
    inserted += count ?? chunk.length;
  }

  // 3) registra total enviado
  await admin.from("notification_campaigns").update({ total_sent: inserted }).eq("id", campaignId);

  return json({
    ok: true,
    campaign_id: campaignId,
    total_sent: inserted,
    target_mode: targetMode,
  });
}

// ---------------------------------------------------------------------------
// Cálculo de público
// ---------------------------------------------------------------------------
async function resolveAudience(
  admin: SupabaseClient,
  poolId: string | null,
  mode: TargetMode,
  targetUserIds?: string[],
): Promise<string[]> {
  const activeIds = await activeProfileIds(admin);
  const activeSet = new Set(activeIds);

  if (mode === "geral") return activeIds;

  if (mode === "specific") {
    const requested = Array.isArray(targetUserIds) ? targetUserIds : [];
    const filtered = requested.filter((id) => activeSet.has(id));
    if (filtered.length === 0) {
      throw new HttpError(400, "Selecione ao menos um usuário ativo.");
    }
    return filtered;
  }

  // pool / resenha dependem do pool ativo
  if (!poolId) {
    if (mode === "pool") throw new HttpError(400, "Nenhum bolão ativo encontrado.");
    return activeIds; // sem pool, "resenha" = todos ativos
  }

  const enrolledSet = new Set(await activeEnrollmentIds(admin, poolId));
  if (mode === "pool") return activeIds.filter((id) => enrolledSet.has(id));
  // resenha
  return activeIds.filter((id) => !enrolledSet.has(id));
}

async function resolveMatchPending(admin: SupabaseClient, matchId: string): Promise<string[]> {
  // somente players ativos
  const { data: players, error } = await admin
    .from("profiles")
    .select("id")
    .eq("status", "active")
    .eq("role", "player");
  if (error) throw new HttpError(500, error.message);
  const playerIds = (players ?? []).map((p) => p.id as string);

  const { data: bets, error: betsError } = await admin
    .from("bets")
    .select("user_id")
    .eq("match_id", matchId);
  if (betsError) throw new HttpError(500, betsError.message);
  const betUsers = new Set((bets ?? []).map((b) => b.user_id as string));

  return playerIds.filter((id) => !betUsers.has(id));
}

async function resolveSpecialsPending(
  admin: SupabaseClient,
  poolId: string | null,
): Promise<string[]> {
  if (!poolId) throw new HttpError(400, "Nenhum bolão ativo encontrado.");
  const enrolled = await activeEnrollmentIds(admin, poolId);

  const { data: specials, error } = await admin
    .from("special_predictions")
    .select("user_id")
    .eq("pool_id", poolId);
  if (error) throw new HttpError(500, error.message);
  const withSpecials = new Set((specials ?? []).map((s) => s.user_id as string));

  return enrolled.filter((id) => !withSpecials.has(id));
}

async function activeProfileIds(admin: SupabaseClient): Promise<string[]> {
  const { data, error } = await admin.from("profiles").select("id").eq("status", "active");
  if (error) throw new HttpError(500, error.message);
  return (data ?? []).map((p) => p.id as string);
}

async function activeEnrollmentIds(admin: SupabaseClient, poolId: string): Promise<string[]> {
  const { data, error } = await admin
    .from("enrollments")
    .select("user_id")
    .eq("pool_id", poolId)
    .eq("status", "active");
  if (error) throw new HttpError(500, error.message);
  return Array.from(new Set((data ?? []).map((e) => e.user_id as string)));
}

async function resolvePoolId(admin: SupabaseClient): Promise<string | null> {
  const { data: bySlug } = await admin
    .from("pool_settings")
    .select("id")
    .eq("slug", POOL_SLUG)
    .maybeSingle();
  if (bySlug?.id) return bySlug.id as string;

  const { data: first } = await admin
    .from("pool_settings")
    .select("id")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  return (first?.id as string) ?? null;
}

async function specialsLockAt(admin: SupabaseClient, poolId: string | null): Promise<Date | null> {
  if (!poolId) return null;
  const { data } = await admin
    .from("pool_scoring_rules")
    .select("specials_lock_at")
    .eq("pool_id", poolId)
    .maybeSingle();
  return data?.specials_lock_at ? new Date(data.specials_lock_at as string) : null;
}

interface MatchInfo {
  status: string;
  kickoff_at: string;
  home: string;
  away: string;
  home_country_code: string | null;
  away_country_code: string | null;
}

async function loadMatch(admin: SupabaseClient, matchId: string): Promise<MatchInfo | null> {
  const { data, error } = await admin
    .from("matches")
    .select(
      "status,kickoff_at,home_team:teams!matches_home_team_id_fkey(short_name,name,country_code),away_team:teams!matches_away_team_id_fkey(short_name,name,country_code)",
    )
    .eq("id", matchId)
    .maybeSingle();
  if (error) throw new HttpError(500, error.message);
  if (!data) return null;

  const home = pickTeam(data.home_team);
  const away = pickTeam(data.away_team);
  return {
    status: data.status as string,
    kickoff_at: data.kickoff_at as string,
    home: home.label,
    away: away.label,
    home_country_code: home.code,
    away_country_code: away.code,
  };
}

function pickTeam(team: unknown): { label: string; code: string | null } {
  const t = Array.isArray(team) ? team[0] : team;
  if (!t || typeof t !== "object") return { label: "?", code: null };
  const obj = t as Record<string, unknown>;
  return {
    label: (obj.short_name as string) || (obj.name as string) || "?",
    code: (obj.country_code as string) ?? null,
  };
}

// ---------------------------------------------------------------------------
// Validação de link externo (server-side)
// ---------------------------------------------------------------------------
function validateExternalLink(raw: string | null): string | null {
  if (raw == null) return null;
  const value = raw.trim();
  if (value === "") return null;

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new HttpError(400, "Link externo inválido.");
  }
  // aceita SOMENTE http/https; bloqueia javascript:, data:, blob:, etc.
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new HttpError(400, "Link externo precisa começar com http:// ou https://");
  }
  return url.toString();
}

// ---------------------------------------------------------------------------
// Relatório
// ---------------------------------------------------------------------------
async function listCampaigns(admin: SupabaseClient) {
  const { data: campaigns, error } = await admin
    .from("notification_campaigns")
    .select("id,type,title,message,target_mode,action_url,internal_route,total_sent,created_at")
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) throw new HttpError(500, error.message);

  const ids = (campaigns ?? []).map((c) => c.id as string);
  const counts = new Map<string, { sent: number; viewed: number }>();

  if (ids.length > 0) {
    const { data: notifs, error: notifsError } = await admin
      .from("notifications")
      .select("campaign_id,read_at")
      .in("campaign_id", ids);
    if (notifsError) throw new HttpError(500, notifsError.message);
    for (const n of notifs ?? []) {
      const key = n.campaign_id as string;
      const bucket = counts.get(key) ?? { sent: 0, viewed: 0 };
      bucket.sent += 1;
      if (n.read_at) bucket.viewed += 1;
      counts.set(key, bucket);
    }
  }

  const result = (campaigns ?? []).map((c) => {
    const bucket = counts.get(c.id as string);
    const sent = bucket?.sent ?? (c.total_sent as number) ?? 0;
    const viewed = bucket?.viewed ?? 0;
    return {
      ...c,
      total_sent: sent,
      total_viewed: viewed,
      total_pending: Math.max(sent - viewed, 0),
    };
  });

  return json({ campaigns: result });
}

async function campaignReport(admin: SupabaseClient, campaignId: string) {
  const { data: campaign, error: campaignError } = await admin
    .from("notification_campaigns")
    .select("id,type,title,message,target_mode,action_url,internal_route,total_sent,created_at")
    .eq("id", campaignId)
    .maybeSingle();
  if (campaignError) throw new HttpError(500, campaignError.message);
  if (!campaign) throw new HttpError(404, "Campanha não encontrada.");

  const { data: rows, error } = await admin
    .from("notifications")
    .select(
      "user_id,read_at,recipient:profiles!notifications_user_id_fkey(display_name,nickname,email)",
    )
    .eq("campaign_id", campaignId);
  if (error) throw new HttpError(500, error.message);

  const viewed: RecipientRow[] = [];
  const pending: RecipientRow[] = [];
  for (const row of rows ?? []) {
    const r = Array.isArray(row.recipient) ? row.recipient[0] : row.recipient;
    const entry: RecipientRow = {
      user_id: row.user_id as string,
      name:
        (r?.display_name as string) || (r?.nickname as string) || (r?.email as string) || "Usuário",
      read_at: (row.read_at as string) ?? null,
    };
    if (row.read_at) viewed.push(entry);
    else pending.push(entry);
  }

  return json({
    campaign: {
      ...campaign,
      total_sent: (rows ?? []).length,
      total_viewed: viewed.length,
      total_pending: pending.length,
    },
    viewed,
    pending,
  });
}

interface RecipientRow {
  user_id: string;
  name: string;
  read_at: string | null;
}
