import * as React from "react";
import { BiSolidMoon, BiSolidSun } from "react-icons/bi";

import { cn } from "@/lib/utils";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { NotificationBell } from "@/components/notifications/NotificationBell";

export type ThemeMode = "light" | "dark";

export interface AppHeaderProps {
  userId?: string | null;
  userName: string;
  avatarUrl?: string | null;
  theme: ThemeMode;
  onProfileClick?: () => void;
  onToggleTheme?: () => void;
  className?: string;
}

function getInitials(name: string) {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

function AppHeader({
  userId,
  userName,
  avatarUrl,
  theme,
  onProfileClick,
  onToggleTheme,
  className,
}: AppHeaderProps) {
  return (
    <header
      className={cn(
        "sticky top-0 z-30 border-b border-border/70 bg-background/78 backdrop-blur-xl",
        className,
      )}
    >
      <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-3">
        <button
          type="button"
          onClick={onProfileClick}
          className="flex min-w-0 items-center gap-3 rounded-2xl text-left outline-none transition-colors hover:text-brand focus-visible:ring-2 focus-visible:ring-ring"
          aria-label="Abrir meu perfil"
        >
          <Avatar className="size-10 border-2 border-background shadow-md ring-1 ring-border">
            {avatarUrl && <AvatarImage src={avatarUrl} alt={userName} />}
            <AvatarFallback className="bg-brand text-sm font-bold text-brand-foreground">
              {getInitials(userName)}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <p className="eyebrow text-brand">Pau Pite</p>
            <p className="truncate text-sm text-muted-foreground">
              Olá, <span className="font-extrabold text-foreground">{userName}</span>
            </p>
          </div>
        </button>

        <div className="flex shrink-0 items-center gap-1.5">
          <NotificationBell userId={userId} />
          <button
            type="button"
            onClick={onToggleTheme}
            aria-label={theme === "light" ? "Ativar tema escuro" : "Ativar tema claro"}
            className="tap-feedback grid size-10 place-items-center rounded-2xl border border-border bg-surface text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
          >
            {theme === "light" ? (
              <BiSolidMoon className="size-5" />
            ) : (
              <BiSolidSun className="size-5" />
            )}
          </button>
        </div>
      </div>
    </header>
  );
}

export { AppHeader };
