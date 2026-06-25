import { useNavigate } from "@tanstack/react-router";
import { useState } from "react";

import { AppHeader, type ThemeMode } from "@/components/mobile/AppHeader";
import { TabBar } from "@/components/mobile/TabBar";
import { useAuth } from "@/hooks/use-auth";
import { cn } from "@/lib/utils";

const tabs = [
  { key: "partidas", label: "Partidas" },
  { key: "bolao", label: "Bolão" },
  { key: "ranking", label: "Ranking" },
  { key: "perfil", label: "Perfil" },
];

export function MobileShell({
  active,
  children,
  className,
}: {
  active: "partidas" | "bolao" | "ranking" | "perfil";
  children: React.ReactNode;
  className?: string;
}) {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const [theme, setTheme] = useState<ThemeMode>(() => {
    if (typeof window === "undefined") return "light";
    return window.localStorage.getItem("paupite-theme") === "dark" ? "dark" : "light";
  });

  const userName = profile?.nickname || profile?.display_name || profile?.email || "Jogador";

  function select(key: string) {
    if (key === "partidas") navigate({ to: "/home" });
    if (key === "bolao") navigate({ to: "/pool" });
    if (key === "ranking") navigate({ to: "/ranking" });
    if (key === "perfil") navigate({ to: "/profile" });
  }

  function toggleTheme() {
    setTheme((current) => {
      const next = current === "light" ? "dark" : "light";
      window.localStorage.setItem("paupite-theme", next);
      return next;
    });
  }

  return (
    <div
      className={cn(
        "min-h-screen bg-muted/30 [font-family:'Space_Grotesk',sans-serif]",
        theme === "dark" && "dark",
        className,
      )}
    >
      <AppHeader
        userName={userName}
        avatarUrl={profile?.avatar_url}
        theme={theme}
        onRankingShortcutClick={() => navigate({ to: "/ranking" })}
        onToggleTheme={toggleTheme}
      />
      <TabBar items={tabs} activeKey={active} onSelect={select} />
      {children}
    </div>
  );
}
