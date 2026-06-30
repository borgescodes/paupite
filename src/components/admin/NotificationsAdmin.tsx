import { useCallback, useEffect, useMemo, useState } from "react";
import { BiBell, BiBarChartAlt2, BiSend, BiTrash } from "react-icons/bi";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import {
  getCampaignReport,
  isValidExternalLink,
  listNotificationCampaigns,
  sendManualNotification,
  sendMatchReminder,
  sendSpecialsReminder,
  targetModeLabel,
  deleteNotificationCampaign,
  type CampaignReport,
  type CampaignSummary,
  type NotificationTargetMode,
} from "@/lib/notifications";

type SendType = "manual" | "match_reminder" | "special_reminder";

interface ActiveUser {
  id: string;
  display_name: string | null;
  nickname: string | null;
  email: string;
}

interface OpenMatch {
  id: string;
  kickoff_at: string;
  home: string;
  away: string;
}

export function NotificationsAdmin() {
  const [sendType, setSendType] = useState<SendType>("manual");
  const [message, setMessage] = useState("");
  const [actionUrl, setActionUrl] = useState("");
  const [targetMode, setTargetMode] = useState<NotificationTargetMode>("geral");
  const [selectedUsers, setSelectedUsers] = useState<string[]>([]);
  const [matchId, setMatchId] = useState("");

  const [users, setUsers] = useState<ActiveUser[]>([]);
  const [matches, setMatches] = useState<OpenMatch[]>([]);
  const [campaigns, setCampaigns] = useState<CampaignSummary[]>([]);
  const [loadingCampaigns, setLoadingCampaigns] = useState(true);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const linkOk = isValidExternalLink(actionUrl);

  const loadPickers = useCallback(async () => {
    const usersResult = await supabase
      .from("profiles")
      .select("id,display_name,nickname,email")
      .eq("status", "active")
      .order("display_name");
    setUsers((usersResult.data ?? []) as ActiveUser[]);

    const matchesResult = await supabase
      .from("matches")
      .select(
        "id,kickoff_at,home_team:teams!matches_home_team_id_fkey(short_name,name),away_team:teams!matches_away_team_id_fkey(short_name,name)",
      )
      .eq("status", "scheduled")
      .gt("kickoff_at", new Date().toISOString())
      .order("kickoff_at", { ascending: true });
    const mapped: OpenMatch[] = (matchesResult.data ?? []).map((row) => {
      const home = Array.isArray(row.home_team) ? row.home_team[0] : row.home_team;
      const away = Array.isArray(row.away_team) ? row.away_team[0] : row.away_team;
      return {
        id: row.id as string,
        kickoff_at: row.kickoff_at as string,
        home: home?.short_name || home?.name || "Casa",
        away: away?.short_name || away?.name || "Fora",
      };
    });
    setMatches(mapped);
  }, []);

  const loadCampaigns = useCallback(async () => {
    setLoadingCampaigns(true);
    try {
      setCampaigns(await listNotificationCampaigns());
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Falha ao carregar campanhas.");
    } finally {
      setLoadingCampaigns(false);
    }
  }, []);

  useEffect(() => {
    void loadPickers();
    void loadCampaigns();
    const interval = setInterval(() => {
      void loadCampaigns();
    }, 20_000);
    const onFocus = () => void loadCampaigns();
    window.addEventListener("focus", onFocus);
    return () => {
      clearInterval(interval);
      window.removeEventListener("focus", onFocus);
    };
  }, [loadPickers, loadCampaigns]);

  function toggleUser(id: string) {
    setSelectedUsers((current) =>
      current.includes(id) ? current.filter((value) => value !== id) : [...current, id],
    );
  }

  async function handleSend() {
    setBusy(true);
    setError(null);
    try {
      let summary;
      if (sendType === "manual") {
        if (!message.trim()) throw new Error("A mensagem é obrigatória.");
        if (!linkOk) throw new Error("Link externo inválido (use http:// ou https://).");
        if (targetMode === "specific" && selectedUsers.length === 0) {
          throw new Error("Selecione ao menos um usuário.");
        }
        summary = await sendManualNotification({
          message: message.trim(),
          action_url: actionUrl.trim() || null,
          target_mode: targetMode,
          target_user_ids: targetMode === "specific" ? selectedUsers : [],
        });
      } else if (sendType === "match_reminder") {
        if (!matchId) throw new Error("Selecione um jogo.");
        summary = await sendMatchReminder(matchId);
      } else {
        summary = await sendSpecialsReminder();
      }

      toast.success(`Notificação enviada para ${summary.total_sent} usuário(s).`);
      setMessage("");
      setActionUrl("");
      setSelectedUsers([]);
      setMatchId("");
      await loadCampaigns();
    } catch (caught) {
      const detail = caught instanceof Error ? caught.message : "Falha no envio.";
      setError(detail);
      toast.error(detail);
    } finally {
      setBusy(false);
    }
  }

  const userLabel = (user: ActiveUser) => user.display_name || user.nickname || user.email;

  const formattedMatches = useMemo(
    () =>
      matches.map((match) => ({
        ...match,
        label: `${match.home} x ${match.away} — ${formatDateTime(match.kickoff_at)}`,
      })),
    [matches],
  );

  return (
    <div className="space-y-4">
      <Card className="glass-card">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <BiBell className="size-5 text-brand" />
            Enviar notificação
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label>Tipo de envio</Label>
            <select
              className="h-9 w-full rounded-md border bg-background px-3 text-sm"
              value={sendType}
              onChange={(event) => setSendType(event.target.value as SendType)}
            >
              <option value="manual">Mensagem manual</option>
              <option value="match_reminder">Lembrete: palpite de jogo pendente</option>
              <option value="special_reminder">Lembrete: palpites especiais pendentes</option>
            </select>
          </div>

          {sendType === "manual" && (
            <>
              <div className="space-y-1.5">
                <Label>Mensagem (título exibido ao usuário: "Sistema informa")</Label>
                <Textarea
                  rows={3}
                  value={message}
                  placeholder="Escreva a mensagem que o usuário verá."
                  onChange={(event) => setMessage(event.target.value)}
                />
              </div>

              <div className="space-y-1.5">
                <Label>Link externo (opcional)</Label>
                <Input
                  value={actionUrl}
                  placeholder="https://..."
                  onChange={(event) => setActionUrl(event.target.value)}
                />
                {!linkOk && (
                  <p className="text-xs text-destructive">
                    Link inválido. Use apenas http:// ou https://
                  </p>
                )}
                {linkOk && actionUrl.trim() && (
                  <p className="text-xs text-muted-foreground">
                    O usuário verá o botão "Acessar link".
                  </p>
                )}
              </div>

              <div className="space-y-1.5">
                <Label>Público alvo</Label>
                <select
                  className="h-9 w-full rounded-md border bg-background px-3 text-sm"
                  value={targetMode}
                  onChange={(event) => setTargetMode(event.target.value as NotificationTargetMode)}
                >
                  <option value="geral">Geral (todos os usuários ativos)</option>
                  <option value="pool">Pool (inscritos ativos no bolão)</option>
                  <option value="resenha">Resenha (ativos fora do bolão)</option>
                  <option value="specific">Usuários específicos</option>
                </select>
              </div>

              {targetMode === "specific" && (
                <div className="space-y-2">
                  <Label>Selecione os usuários ({selectedUsers.length})</Label>
                  <div className="max-h-56 space-y-1 overflow-y-auto rounded-xl border border-border/70 bg-background/60 p-2">
                    {users.length === 0 && (
                      <p className="p-2 text-sm text-muted-foreground">
                        Nenhum usuário ativo encontrado.
                      </p>
                    )}
                    {users.map((user) => (
                      <label
                        key={user.id}
                        className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-muted/50"
                      >
                        <Checkbox
                          checked={selectedUsers.includes(user.id)}
                          onCheckedChange={() => toggleUser(user.id)}
                        />
                        <span className="min-w-0 flex-1 truncate">{userLabel(user)}</span>
                        <span className="shrink-0 text-xs text-muted-foreground">{user.email}</span>
                      </label>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}

          {sendType === "match_reminder" && (
            <div className="space-y-1.5">
              <Label>Jogo (apenas agendados e abertos para palpite)</Label>
              <select
                className="h-9 w-full rounded-md border bg-background px-3 text-sm"
                value={matchId}
                onChange={(event) => setMatchId(event.target.value)}
              >
                <option value="">Selecione um jogo…</option>
                {formattedMatches.map((match) => (
                  <option key={match.id} value={match.id}>
                    {match.label}
                  </option>
                ))}
              </select>
              <p className="text-xs text-muted-foreground">
                Enviado apenas para players ativos que ainda não palpitaram neste jogo. Botão "Fazer
                Palpite" leva direto ao card do jogo.
              </p>
            </div>
          )}

          {sendType === "special_reminder" && (
            <p className="rounded-xl border border-border/70 bg-muted/35 p-3 text-sm text-muted-foreground">
              Enviado apenas para inscritos ativos do bolão que ainda não fizeram palpites
              especiais. O envio é bloqueado automaticamente se os especiais já estiverem encerrados
              (lock). O botão "Fazer Palpite" abre a aba de especiais.
            </p>
          )}

          {error && <p className="text-sm text-destructive">{error}</p>}

          <Button
            type="button"
            disabled={busy}
            className="bg-brand text-brand-foreground hover:bg-brand/90"
            onClick={() => void handleSend()}
          >
            <BiSend className="size-5" />
            {busy ? "Enviando…" : "Enviar"}
          </Button>
        </CardContent>
      </Card>

      <Card className="glass-card">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <BiBarChartAlt2 className="size-5 text-brand" />
            Campanhas enviadas
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {loadingCampaigns && <Skeleton className="h-24 rounded-2xl" />}

          {!loadingCampaigns && campaigns.length === 0 && (
            <p className="text-sm text-muted-foreground">Nenhuma campanha enviada ainda.</p>
          )}

          {!loadingCampaigns &&
            campaigns.map((campaign) => <CampaignRow key={campaign.id} campaign={campaign} />)}
        </CardContent>
      </Card>
    </div>
  );
}

function CampaignRow({ campaign }: { campaign: CampaignSummary }) {
  const [open, setOpen] = useState(false);
  const [report, setReport] = useState<CampaignReport | null>(null);
  const [loading, setLoading] = useState(false);

  async function toggle() {
    const next = !open;
    setOpen(next);
    if (next && !report) {
      setLoading(true);
      try {
        setReport(await getCampaignReport(campaign.id));
      } catch (caught) {
        toast.error(caught instanceof Error ? caught.message : "Falha ao carregar relatório.");
      } finally {
        setLoading(false);
      }
    }
  }

  return (
    <div className="rounded-2xl border border-border/70 bg-background/60 p-3">
      <button
        type="button"
        onClick={() => void toggle()}
        className="flex w-full flex-col gap-2 text-left"
      >
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm font-bold">{campaign.title}</span>
          <span className="shrink-0 text-xs text-muted-foreground">
            {formatDateTime(campaign.created_at)}
          </span>
        </div>
        <p className="line-clamp-2 text-xs text-muted-foreground">{campaign.message}</p>
        <div className="flex flex-wrap gap-1.5 text-[11px] font-bold">
          <Pill className="bg-muted text-muted-foreground">
            {targetModeLabel(campaign.target_mode)}
          </Pill>
          <Pill className="bg-brand/12 text-brand">Enviadas {campaign.total_sent}</Pill>
          <Pill className="bg-success/15 text-success">Visualizadas {campaign.total_viewed}</Pill>
          <Pill className="bg-amber-500/15 text-amber-600">Pendentes {campaign.total_pending}</Pill>
        </div>
      </button>

      {open && (
        <div className="mt-3 border-t border-border/60 pt-3">
          {loading && <Skeleton className="h-16 rounded-xl" />}
          {!loading && report && (
            <div className="grid gap-3 sm:grid-cols-2">
              <RecipientList title="Visualizaram" tone="success" rows={report.viewed} />
              <RecipientList title="Pendentes" tone="amber" rows={report.pending} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function RecipientList({
  title,
  tone,
  rows,
}: {
  title: string;
  tone: "success" | "amber";
  rows: { user_id: string; name: string }[];
}) {
  return (
    <div className="space-y-1.5">
      <p
        className={cn(
          "text-xs font-extrabold uppercase",
          tone === "success" ? "text-success" : "text-amber-600",
        )}
      >
        {title} ({rows.length})
      </p>
      {rows.length === 0 ? (
        <p className="text-xs text-muted-foreground">—</p>
      ) : (
        <ul className="space-y-1">
          {rows.map((row) => (
            <li key={row.user_id} className="truncate text-xs text-muted-foreground">
              {row.name}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Pill({ className, children }: { className?: string; children: React.ReactNode }) {
  return <span className={cn("rounded-full px-2 py-0.5", className)}>{children}</span>;
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}
