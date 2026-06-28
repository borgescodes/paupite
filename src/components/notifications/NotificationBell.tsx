import { useState } from "react";
import { Bell } from "lucide-react";

import { NotificationCenter } from "@/components/notifications/NotificationCenter";
import { useNotifications } from "@/hooks/use-notifications";

export function NotificationBell({ userId }: { userId?: string | null }) {
  const [open, setOpen] = useState(false);
  const [markingId, setMarkingId] = useState<string | null>(null);
  const {
    notifications,
    unreadCount,
    isLoading,
    error,
    markAsRead,
    markAllAsRead,
    clearAllNotifications,
    isMarkingAllAsRead,
    isClearingAllNotifications,
  } = useNotifications(userId);

  if (!userId) return null;

  async function handleMarkAsRead(notificationId: string) {
    setMarkingId(notificationId);
    try {
      await markAsRead(notificationId);
    } finally {
      setMarkingId(null);
    }
  }

  async function handleMarkAllAsRead() {
    await markAllAsRead();
  }

  async function handleClearAllNotifications() {
    await clearAllNotifications();
  }

  const badgeLabel = unreadCount > 99 ? "99+" : String(unreadCount);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={
          unreadCount > 0 ? `Abrir notificações, ${unreadCount} não lidas` : "Abrir notificações"
        }
        className="tap-feedback relative grid size-10 place-items-center rounded-2xl border border-border bg-surface text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
      >
        <Bell className="size-5" />
        {unreadCount > 0 && (
          <span className="absolute -right-1 -top-1 grid min-w-5 place-items-center rounded-full bg-destructive px-1 text-[10px] font-extrabold leading-5 text-destructive-foreground ring-2 ring-background">
            {badgeLabel}
          </span>
        )}
      </button>

      <NotificationCenter
        open={open}
        onOpenChange={setOpen}
        notifications={notifications}
        unreadCount={unreadCount}
        isLoading={isLoading}
        error={error}
        markingId={markingId}
        isMarkingAllAsRead={isMarkingAllAsRead}
        isClearingAllNotifications={isClearingAllNotifications}
        onMarkAsRead={(notificationId) => void handleMarkAsRead(notificationId)}
        onMarkAllAsRead={() => void handleMarkAllAsRead()}
        onClearAllNotifications={() => void handleClearAllNotifications()}
      />
    </>
  );
}
