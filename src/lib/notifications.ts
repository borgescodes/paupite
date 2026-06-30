import { callEdgeFunction } from "@/lib/edge";

export type NotificationTargetMode = "specific" | "resenha" | "pool" | "geral";
export type NotificationSendType = "manual" | "match_reminder" | "special_reminder";

export interface SendManualInput {
  message: string;
  action_url?: string | null;
  target_mode: NotificationTargetMode;
  target_user_ids?: string[];
}

export interface SendSummary {
  ok: boolean;
  campaign_id: string;
  total_sent: number;
  target_mode: string;
}

export interface CampaignSummary {
  id: string;
  type: string;
  title: string;
  message: string;
  target_mode: string;
  action_url: string | null;
  internal_route: string | null;
  total_sent: number;
  total_viewed: number;
  total_pending: number;
  created_at: string;
}

export interface CampaignRecipient {
  user_id: string;
  name: string;
  read_at: string | null;
}

export interface CampaignReport {
  campaign: CampaignSummary;
  viewed: CampaignRecipient[];
  pending: CampaignRecipient[];
}

/** Apenas para feedback no formulário. A validação real é server-side. */
export function isValidExternalLink(raw: string): boolean {
  const value = raw.trim();
  if (value === "") return true; // opcional
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

export function sendManualNotification(input: SendManualInput) {
  return callEdgeFunction<SendSummary>("admin-notifications", {
    action: "send",
    send_type: "manual",
    message: input.message,
    action_url: input.action_url ?? null,
    target_mode: input.target_mode,
    target_user_ids: input.target_user_ids ?? [],
  });
}

export function sendMatchReminder(matchId: string) {
  return callEdgeFunction<SendSummary>("admin-notifications", {
    action: "send",
    send_type: "match_reminder",
    match_id: matchId,
  });
}

export function sendSpecialsReminder() {
  return callEdgeFunction<SendSummary>("admin-notifications", {
    action: "send",
    send_type: "special_reminder",
  });
}

export async function listNotificationCampaigns(): Promise<CampaignSummary[]> {
  const data = await callEdgeFunction<{ campaigns: CampaignSummary[] }>("admin-notifications", {
    action: "list_campaigns",
  });
  return data.campaigns ?? [];
}

export function getCampaignReport(campaignId: string) {
  return callEdgeFunction<CampaignReport>("admin-notifications", {
    action: "campaign_report",
    campaign_id: campaignId,
  });
}

export function deleteNotificationCampaign(campaignId: string) {
  return callEdgeFunction<{ ok: boolean; campaign_id: string; notifications_hidden: number }>(
    "admin-notifications",
    { action: "delete_campaign", campaignId },
  );
}

const TARGET_LABELS: Record<string, string> = {
  specific: "Usuários específicos",
  resenha: "Resenha (fora do bolão)",
  pool: "Pool (inscritos ativos)",
  geral: "Geral (todos ativos)",
  match_pending: "Sem palpite no jogo",
  specials_pending: "Especiais pendentes",
};

export function targetModeLabel(mode: string): string {
  return TARGET_LABELS[mode] ?? mode;
}
