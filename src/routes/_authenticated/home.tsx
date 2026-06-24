import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";

import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/use-auth";
import { AppHeader, type ThemeMode } from "@/components/mobile/AppHeader";
import { DaySelector } from "@/components/mobile/DaySelector";
import { MatchCard } from "@/components/mobile/MatchCard";
import { TabBar } from "@/components/mobile/TabBar";
import type { ScoreValue } from "@/components/mobile/types";
import {
  getMatchDays,
  getMatchesForDate,
  groupStageMatches,
  toMatchCardData,
} from "@/data/world-cup-2026-group-stage";

export const Route = createFileRoute("/_authenticated/home")({
  head: () => ({
    links: [
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;700;800&display=swap",
      },
    ],
  }),
  component: HomePage,
});

const tabs = [
  { key: "partidas", label: "Partidas" },
  { key: "bolao", label: "Bolão" },
  { key: "perfil", label: "Perfil" },
];

function HomePage() {
  const { profile, loading } = useAuth();
  const navigate = useNavigate();

  const days = useMemo(() => getMatchDays(groupStageMatches), []);
  const todayIso = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const [selectedDate, setSelectedDate] = useState(
    () => days.find((d) => d.date === todayIso)?.date ?? days[0]?.date ?? "",
  );
  const [activeTab, setActiveTab] = useState("partidas");
  const [theme, setTheme] = useState<ThemeMode>("light");
  const [guesses, setGuesses] = useState<Record<string, ScoreValue>>({});

  const visibleMatches = useMemo(
    () =>
      getMatchesForDate(selectedDate, groupStageMatches).map((match) => {
        const card = toMatchCardData(match);
        const guess = guesses[match.id];
        return guess ? { ...card, guess: { value: guess } } : card;
      }),
    [selectedDate, guesses],
  );

  function handleTabSelect(key: string) {
    setActiveTab(key);
    if (key === "perfil") navigate({ to: "/profile" });
  }

  if (loading) {
    return <p className="p-6 text-center text-sm text-muted-foreground">Carregando...</p>;
  }

  const userName = profile?.display_name ?? profile?.nickname ?? profile?.email ?? "Jogador";

  return (
    <div
      className={cn(
        "flex min-h-screen flex-col [font-family:'Space_Grotesk',sans-serif]",
        theme === "dark" && "dark",
      )}
    >
      <AppHeader
        userName={userName}
        avatarUrl={profile?.avatar_url}
        theme={theme}
        onRankingShortcutClick={() => navigate({ to: "/ranking" })}
        onToggleTheme={() => setTheme((t) => (t === "light" ? "dark" : "light"))}
      />
      <TabBar items={tabs} activeKey={activeTab} onSelect={handleTabSelect} />
      <DaySelector days={days} selectedDate={selectedDate} onSelect={setSelectedDate} />

      <div className="relative flex-1 overflow-hidden">
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          <div className="animate-blob-drift absolute -top-12 -left-10 size-56 rounded-full bg-brand/30 blur-3xl" />
          <div className="animate-blob-drift absolute top-1/3 -right-12 size-64 rounded-full bg-success/20 blur-3xl [animation-delay:-9s]" />
        </div>

        <main className="relative z-10 mx-auto h-full max-w-xl space-y-3 overflow-y-auto px-3 py-3">
          {visibleMatches.length === 0 && (
            <p className="pt-12 text-center text-sm text-muted-foreground">
              Nenhuma partida nesta data.
            </p>
          )}
          {visibleMatches.map((match) => (
            <MatchCard
              key={match.id}
              data={match}
              onGuessChange={(value) => setGuesses((prev) => ({ ...prev, [match.id]: value }))}
            />
          ))}
        </main>
      </div>
    </div>
  );
}
