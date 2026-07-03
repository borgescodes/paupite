import { ExternalLink, Flag as FlagIcon, Loader2, Trash2 } from "lucide-react";
import { useNavigate } from "@tanstack/react-router";

import { Flag } from "@/components/mobile/Flag";
import { Button } from "@/components/ui/button";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import type { Notification } from "@/hooks/use-notifications";
import { usePushNotifications } from "@/hooks/usePushNotifications";
import { cn } from "@/lib/utils";

interface NotificationCenterProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  notifications: Notification[];
  isLoading: boolean;
  error: Error | null;
  isClearingAllNotifications: boolean;
  onClearAllNotifications: () => void;
  userId?: string | null;
}

export function NotificationCenter({
  open,
  onOpenChange,
  notifications,
  isLoading,
  error,
  isClearingAllNotifications,
  onClearAllNotifications,
  userId,
}: NotificationCenterProps) {
  const hasNotifications = notifications.length > 0;
  const push = usePushNotifications(userId ?? null);

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="mx-auto max-h-[88vh] max-w-xl rounded-t-3xl">
        <DrawerHeader className="px-5 text-left">
          <div className="flex items-start justify-between gap-4 pr-8">
            <div className="min-w-0">
              <DrawerTitle>Notificações</DrawerTitle>
              <DrawerDescription>
                {hasNotifications ? "Notificações recentes" : "Tudo em dia"}
              </DrawerDescription>
            </div>
            <div className="flex shrink-0 items-center gap-1">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={!hasNotifications || isClearingAllNotifications}
                onClick={onClearAllNotifications}
              >
                {isClearingAllNotifications ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Trash2 className="size-4" />
                )}
                Limpar
              </Button>
            </div>
          </div>
        </DrawerHeader>

        <ScrollArea className="h-[min(64vh,520px)] px-5 pb-5">
          {userId && (
            <div className="mb-3 rounded-xl border border-border/70 bg-muted/30 p-3">
              <p className="text-xs font-extrabold uppercase tracking-wide text-muted-foreground">
                Notificações deste aparelho
              </p>
              <PushToggle push={push} />
            </div>
          )}

          {isLoading && <NotificationSkeleton />}

          {!isLoading && error && (
            <div className="rounded-xl border border-destructive/25 bg-destructive/10 p-4 text-sm text-destructive">
              Não foi possível carregar
            </div>
          )}

          {!isLoading && !error && notifications.length === 0 && (
            <div className="rounded-xl border border-dashed border-border bg-muted/35 p-6 text-center text-sm text-muted-foreground">
              Sem notificações por enquanto
            </div>
          )}

          {!isLoading && !error && notifications.length > 0 && (
            <div className="space-y-2">
              {notifications.map((notification) => (
                <NotificationItem
                  key={notification.id}
                  notification={notification}
                  onNavigate={() => onOpenChange(false)}
                />
              ))}
            </div>
          )}
        </ScrollArea>
      </DrawerContent>
    </Drawer>
  );
}

function readActionData(notification: Notification) {
  const data = notification.data;
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    return {
      actionUrl: null as string | null,
      internalRoute: null as string | null,
      actionLabel: null as string | null,
    };
  }
  const record = data as Record<string, unknown>;
  const actionUrl = typeof record.action_url === "string" ? record.action_url : null;
  const internalRoute = typeof record.internal_route === "string" ? record.internal_route : null;
  const actionLabel = typeof record.action_label === "string" ? record.action_label : null;
  return { actionUrl, internalRoute, actionLabel };
}

function NotificationItem({
  notification,
  onNavigate,
}: {
  notification: Notification;
  onNavigate: () => void;
}) {
  const navigate = useNavigate();
  const unread = !notification.read_at;
  const { actionUrl, internalRoute, actionLabel } = readActionData(notification);

  function handleInternal() {
    if (!internalRoute) return;
    onNavigate();
    // rota interna, mesma aba, sem abrir nova janela.
    void navigate({ to: internalRoute });
  }

  return (
    <article
      className={cn(
        "rounded-xl border p-3 transition-colors",
        unread ? "border-brand/25 bg-brand/8" : "border-border/70 bg-muted/35",
      )}
    >
      <div className="min-w-0 flex-1">
        <h3 className="text-sm font-extrabold leading-snug">{notification.title}</h3>
        <p className="mt-1 text-sm leading-snug text-muted-foreground">{notification.message}</p>

        {notification.matchPreview && <MatchMiniPreview notification={notification} />}

        {(actionUrl || internalRoute) && (
          <div className="mt-3 flex flex-wrap gap-2">
            {actionUrl && (
              <Button asChild type="button" size="sm" variant="outline" className="h-8 rounded-xl">
                <a href={actionUrl} target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="size-4" />
                  Acessar link
                </a>
              </Button>
            )}
            {internalRoute && (
              <Button
                type="button"
                size="sm"
                className="h-8 rounded-xl bg-brand text-brand-foreground hover:bg-brand/90"
                onClick={handleInternal}
              >
                <FlagIcon className="size-4" />
                {actionLabel || "Abrir"}
              </Button>
            )}
          </div>
        )}

        <time
          className="mt-3 block text-xs text-muted-foreground"
          dateTime={notification.created_at}
        >
          {formatNotificationDate(notification.created_at)}
        </time>
      </div>
    </article>
  );
}

function MatchMiniPreview({ notification }: { notification: Notification }) {
  const match = notification.matchPreview;
  if (!match) return null;

  return (
    <div className="mt-2 inline-flex items-center gap-2 rounded-full border border-border/70 bg-background/60 px-2.5 py-1.5 text-xs font-extrabold">
      <TeamMiniIcon code={match.homeCountryCode} label={match.home} />
      <span>{match.home}</span>
      <span className="text-muted-foreground">x</span>
      <TeamMiniIcon code={match.awayCountryCode} label={match.away} />
      <span>{match.away}</span>
    </div>
  );
}

function TeamMiniIcon({ code, label }: { code: string | null; label: string }) {
  if (code) {
    return <Flag code={code.toLowerCase()} label={label} size="sm" className="h-4 w-6 rounded" />;
  }

  return (
    <span className="grid size-5 place-items-center rounded-full bg-muted text-[9px] font-extrabold text-muted-foreground">
      {label.slice(0, 2).toUpperCase()}
    </span>
  );
}

function NotificationSkeleton() {
  return (
    <div className="space-y-2">
      <Skeleton className="h-24 rounded-xl" />
      <Skeleton className="h-24 rounded-xl" />
      <Skeleton className="h-24 rounded-xl" />
    </div>
  );
}

function formatNotificationDate(value: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  })
    .format(new Date(value))
    .replace(".", "");
}

function PushToggle({ push }: { push: ReturnType<typeof usePushNotifications> }) {
  const { status, isBusy, error, subscribe, unsubscribe } = push;

  if (status === "loading") {
    return <p className="mt-2 text-sm text-muted-foreground">Verificando…</p>;
  }
  if (status === "unsupported") {
    return <p className="mt-2 text-sm text-muted-foreground">Navegador incompatível.</p>;
  }
  if (status === "needs-ios-install") {
    return (
      <p className="mt-2 text-sm text-muted-foreground">
        Instale o Pau Pite na Tela de Início para ativar no iPhone/iPad.
      </p>
    );
  }
  if (status === "denied") {
    return (
      <p className="mt-2 text-sm text-muted-foreground">
        Permissão bloqueada no navegador. Ajuste nas configurações do site.
      </p>
    );
  }
  return (
    <div className="mt-2 space-y-2">
      {status === "subscribed" ? (
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm">Notificações ativadas neste aparelho.</span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={isBusy}
            onClick={() => void unsubscribe()}
          >
            {isBusy ? <Loader2 className="size-4 animate-spin" /> : null}
            Desativar
          </Button>
        </div>
      ) : (
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm text-muted-foreground">
            Receba alertas no celular e computador.
          </span>
          <Button
            type="button"
            size="sm"
            className="bg-brand text-brand-foreground hover:bg-brand/90"
            disabled={isBusy}
            onClick={() => void subscribe()}
          >
            {isBusy ? <Loader2 className="size-4 animate-spin" /> : null}
            Ativar notificações
          </Button>
        </div>
      )}
      {error && status === "error" && (
        <p className="text-xs text-destructive">Não foi possível ativar.</p>
      )}
    </div>
  );
}
