import { Check, CheckCheck, Circle, Loader2 } from "lucide-react";

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
import { cn } from "@/lib/utils";

interface NotificationCenterProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  notifications: Notification[];
  unreadCount: number;
  isLoading: boolean;
  error: Error | null;
  markingId: string | null;
  isMarkingAllAsRead: boolean;
  onMarkAsRead: (notificationId: string) => void;
  onMarkAllAsRead: () => void;
}

export function NotificationCenter({
  open,
  onOpenChange,
  notifications,
  unreadCount,
  isLoading,
  error,
  markingId,
  isMarkingAllAsRead,
  onMarkAsRead,
  onMarkAllAsRead,
}: NotificationCenterProps) {
  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="mx-auto max-h-[88vh] max-w-xl rounded-t-3xl">
        <DrawerHeader className="px-5 text-left">
          <div className="flex items-start justify-between gap-4 pr-8">
            <div className="min-w-0">
              <DrawerTitle>Notificações</DrawerTitle>
              <DrawerDescription>
                {unreadCount > 0
                  ? `${unreadCount} ${unreadCount === 1 ? "não lida" : "não lidas"}`
                  : "Tudo em dia"}
              </DrawerDescription>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="shrink-0"
              disabled={unreadCount === 0 || isMarkingAllAsRead}
              onClick={onMarkAllAsRead}
            >
              {isMarkingAllAsRead ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <CheckCheck className="size-4" />
              )}
              Marcar todas
            </Button>
          </div>
        </DrawerHeader>

        <ScrollArea className="h-[min(64vh,520px)] px-5 pb-5">
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
                  marking={markingId === notification.id}
                  disabled={isMarkingAllAsRead}
                  onMarkAsRead={onMarkAsRead}
                />
              ))}
            </div>
          )}
        </ScrollArea>
      </DrawerContent>
    </Drawer>
  );
}

function NotificationItem({
  notification,
  marking,
  disabled,
  onMarkAsRead,
}: {
  notification: Notification;
  marking: boolean;
  disabled: boolean;
  onMarkAsRead: (notificationId: string) => void;
}) {
  const unread = !notification.read_at;

  return (
    <article
      className={cn(
        "rounded-xl border p-3 transition-colors",
        unread ? "border-brand/25 bg-brand/8" : "border-border/70 bg-muted/35",
      )}
    >
      <div className="flex items-start gap-3">
        <span
          className={cn(
            "mt-1 grid size-7 shrink-0 place-items-center rounded-full",
            unread ? "bg-brand/15 text-brand" : "bg-muted text-muted-foreground",
          )}
          aria-hidden="true"
        >
          <Circle className={cn("size-3", unread && "fill-current")} />
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <h3 className="text-sm font-extrabold leading-snug">{notification.title}</h3>
            <span
              className={cn(
                "rounded-full px-2 py-0.5 text-[10px] font-bold uppercase",
                unread ? "bg-brand/12 text-brand" : "bg-muted text-muted-foreground",
              )}
            >
              {unread ? "Não lida" : "Lida"}
            </span>
          </div>
          <p className="mt-1 text-sm leading-snug text-muted-foreground">{notification.message}</p>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
            <time className="text-xs text-muted-foreground" dateTime={notification.created_at}>
              {formatNotificationDate(notification.created_at)}
            </time>
            {unread && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-8"
                disabled={disabled || marking}
                onClick={() => onMarkAsRead(notification.id)}
              >
                {marking ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Check className="size-4" />
                )}
                Marcar como lida
              </Button>
            )}
          </div>
        </div>
      </div>
    </article>
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
