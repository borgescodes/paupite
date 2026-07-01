import { useNavigate } from "@tanstack/react-router";
import { BiFootball, BiGroup, BiShieldQuarter, BiTrophy, BiUserCircle } from "react-icons/bi";

import { AppHeader } from "@/components/mobile/AppHeader";
import { useAuth } from "@/hooks/use-auth";
import { useThemeMode } from "@/hooks/use-theme";
import { cn } from "@/lib/utils";

export function MobileShell({
  active,
  children,
  className,
}: {
  active: "partidas" | "bolao" | "ranking" | "perfil" | "admin";
  children: React.ReactNode;
  className?: string;
}) {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const { theme, toggleTheme } = useThemeMode(profile?.id);

  const userName = profile?.nickname || profile?.display_name || profile?.email || "Jogador";
  const isOperator = profile?.role === "admin" || profile?.role === "superadmin";
  const navigationItems = [
    { key: "partidas", label: "Partidas", icon: BiFootball },
    { key: "bolao", label: "Bolão", icon: BiGroup },
    { key: "ranking", label: "Ranking", icon: BiTrophy },
    { key: "perfil", label: "Perfil", icon: BiUserCircle },
    ...(isOperator ? [{ key: "admin", label: "Administração", icon: BiShieldQuarter }] : []),
  ];

  function select(key: string) {
    if (key === "partidas") navigate({ to: "/home" });
    if (key === "bolao") navigate({ to: "/pool" });
    if (key === "ranking") navigate({ to: "/ranking" });
    if (key === "perfil") navigate({ to: "/profile" });
    if (key === "admin") navigate({ to: "/admin" });
  }

  return (
    <div className={cn("app-backdrop min-h-screen", className)}>
      <AppHeader
        userId={profile?.id}
        userName={userName}
        avatarUrl={profile?.avatar_url}
        theme={theme}
        onProfileClick={() => navigate({ to: "/profile" })}
        onToggleTheme={toggleTheme}
        navigationItems={navigationItems}
        activeNavigationKey={active}
        onNavigate={select}
      />
      {children}
    </div>
  );
}
