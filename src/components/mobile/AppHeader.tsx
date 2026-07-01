import * as React from "react";
import { BiSolidMoon, BiSolidSun } from "react-icons/bi";
import type { IconType } from "react-icons";

import { cn } from "@/lib/utils";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { NotificationBell } from "@/components/notifications/NotificationBell";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";

export type ThemeMode = "light" | "dark";

export interface AppHeaderNavigationItem {
  key: string;
  label: string;
  icon: IconType;
}

export interface AppHeaderProps {
  userId?: string | null;
  userName: string;
  avatarUrl?: string | null;
  theme: ThemeMode;
  navigationItems?: AppHeaderNavigationItem[];
  activeNavigationKey?: string;
  onNavigate?: (key: string) => void;
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
  navigationItems = [],
  activeNavigationKey,
  onNavigate,
  onProfileClick,
  onToggleTheme,
  className,
}: AppHeaderProps) {
  const [menuOpen, setMenuOpen] = React.useState(false);

  function handleNavigate(key: string) {
    setMenuOpen(false);
    onNavigate?.(key);
  }

  return (
    <header
      className={cn(
        "sticky top-0 z-30 border-b border-border/70 bg-background/78 backdrop-blur-xl",
        className,
      )}
    >
      <div className="mx-auto flex max-w-5xl items-center justify-between gap-2 px-4 py-3">
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

          <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
            <SheetTrigger asChild>
              <button
                type="button"
                aria-label="Abrir menu"
                className="tap-feedback grid size-10 place-items-center rounded-2xl border border-border bg-surface text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="24"
                  height="24"
                  fill="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path d="M3 5h18v2H3zm0 6h18v2H3zm0 6h18v2H3z"></path>
                </svg>
              </button>
            </SheetTrigger>
            <SheetContent className="w-[86vw] max-w-xs px-4 pt-10">
              <SheetHeader className="text-left">
                <SheetTitle>Navegação</SheetTitle>
                <SheetDescription className="sr-only">Menu principal do Pau Pite.</SheetDescription>
              </SheetHeader>

              <nav aria-label="Navegação principal" className="mt-6 grid gap-2">
                {navigationItems.map((item) => {
                  const Icon = item.icon;
                  const isActive = item.key === activeNavigationKey;

                  return (
                    <button
                      key={item.key}
                      type="button"
                      aria-current={isActive ? "page" : undefined}
                      onClick={() => handleNavigate(item.key)}
                      className={cn(
                        "tap-feedback flex min-h-12 items-center gap-3 rounded-2xl px-3 text-left text-sm font-extrabold transition-colors focus-visible:ring-2 focus-visible:ring-ring",
                        isActive
                          ? "bg-brand text-brand-foreground shadow-lg shadow-brand/20"
                          : "text-muted-foreground hover:bg-accent hover:text-foreground",
                      )}
                    >
                      <Icon className="size-5 shrink-0" aria-hidden="true" />
                      <span>{item.label}</span>
                    </button>
                  );
                })}
              </nav>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </header>
  );
}

export { AppHeader };
