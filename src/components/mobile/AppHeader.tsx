import * as React from "react";
import { BiSolidMoon, BiSolidSun, BiSolidTrophy } from "react-icons/bi";

import { cn } from "@/lib/utils";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

export type ThemeMode = "light" | "dark";

export interface AppHeaderProps {
  userName: string;
  avatarUrl?: string | null;
  theme: ThemeMode;
  onRankingShortcutClick?: () => void;
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
  userName,
  avatarUrl,
  theme,
  onRankingShortcutClick,
  onToggleTheme,
  className,
}: AppHeaderProps) {
  return (
    <header
      className={cn(
        "flex items-center justify-between gap-3 border-b bg-background px-4 py-3",
        className,
      )}
    >
      <div className="flex min-w-0 items-center gap-3">
        <Avatar className="size-9">
          {avatarUrl && <AvatarImage src={avatarUrl} alt={userName} />}
          <AvatarFallback className="bg-brand text-sm font-semibold text-brand-foreground">
            {getInitials(userName)}
          </AvatarFallback>
        </Avatar>
        <p className="truncate text-sm text-muted-foreground">
          Olá, <span className="font-extrabold text-foreground">{userName}</span>
        </p>
      </div>

      <div className="flex shrink-0 items-center gap-1">
        <button
          type="button"
          onClick={onRankingShortcutClick}
          aria-label="Ver ranking"
          className="rounded-full p-2 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          <BiSolidTrophy className="size-5" />
        </button>
        <button
          type="button"
          onClick={onToggleTheme}
          aria-label={theme === "light" ? "Ativar tema escuro" : "Ativar tema claro"}
          className="rounded-full p-2 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          {theme === "light" ? (
            <BiSolidMoon className="size-5" />
          ) : (
            <BiSolidSun className="size-5" />
          )}
        </button>
      </div>
    </header>
  );
}

export { AppHeader };
