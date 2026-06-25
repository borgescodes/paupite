import { useEffect, useState } from "react";

import type { ThemeMode } from "@/components/mobile/AppHeader";
import { supabase } from "@/integrations/supabase/client";

export type AccentTheme = "blue" | "pink" | "purple" | "green" | "red" | "brazil";

const THEME_KEY = "paupite-theme";
const ACCENT_KEY = "paupite-accent";
const THEME_EVENT = "paupite:theme-changed";
const ACCENT_EVENT = "paupite:accent-changed";
const accents: AccentTheme[] = ["blue", "pink", "purple", "green", "red", "brazil"];

function initialTheme(): ThemeMode {
  if (typeof window === "undefined") return "light";
  const stored = window.localStorage.getItem(THEME_KEY);
  if (stored === "dark" || stored === "light") return stored;
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function isAccentTheme(value: string | null): value is AccentTheme {
  return Boolean(value && accents.includes(value as AccentTheme));
}

function accentStorageKey(userId?: string | null) {
  return userId ? `${ACCENT_KEY}:${userId}` : ACCENT_KEY;
}

function initialAccent(userId?: string | null): AccentTheme {
  if (typeof window === "undefined") return "blue";
  const userAccent = window.localStorage.getItem(accentStorageKey(userId));
  if (isAccentTheme(userAccent)) return userAccent;
  const genericAccent = window.localStorage.getItem(ACCENT_KEY);
  return isAccentTheme(genericAccent) ? genericAccent : "blue";
}

function applyAccentLocally(next: AccentTheme, userId?: string | null) {
  window.localStorage.setItem(ACCENT_KEY, next);
  window.localStorage.setItem(accentStorageKey(userId), next);
  document.documentElement.dataset.accent = next;
  window.dispatchEvent(new CustomEvent<AccentTheme>(ACCENT_EVENT, { detail: next }));
}

export function useThemeMode(userId?: string | null) {
  const [theme, setTheme] = useState<ThemeMode>("light");
  const [accentTheme, setAccentThemeState] = useState<AccentTheme>("blue");

  useEffect(() => {
    setTheme(initialTheme());
  }, []);

  useEffect(() => {
    setAccentThemeState(initialAccent(userId));
  }, [userId]);

  // After userId is known, fetch accent from DB — DB wins over localStorage
  useEffect(() => {
    if (!userId) return;
    void (async () => {
      try {
        const { data } = await supabase
          .from("profiles")
          .select("accent_theme")
          .eq("id", userId)
          .maybeSingle();
        if (data && isAccentTheme(data.accent_theme)) {
          applyAccentLocally(data.accent_theme, userId);
          setAccentThemeState(data.accent_theme);
        }
      } catch {
        // column may not exist yet in remote; localStorage value stands
      }
    })();
  }, [userId]);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
  }, [theme]);

  useEffect(() => {
    document.documentElement.dataset.accent = accentTheme;
  }, [accentTheme]);

  useEffect(() => {
    const syncTheme = (event: Event) => {
      const next = (event as CustomEvent<ThemeMode>).detail;
      if (next === "dark" || next === "light") setTheme(next);
    };
    const syncAccent = (event: Event) => {
      const next = (event as CustomEvent<AccentTheme>).detail;
      if (isAccentTheme(next)) setAccentThemeState(next);
    };
    window.addEventListener(THEME_EVENT, syncTheme);
    window.addEventListener(ACCENT_EVENT, syncAccent);
    return () => {
      window.removeEventListener(THEME_EVENT, syncTheme);
      window.removeEventListener(ACCENT_EVENT, syncAccent);
    };
  }, []);

  function toggleTheme() {
    const next = theme === "light" ? "dark" : "light";
    window.localStorage.setItem(THEME_KEY, next);
    setTheme(next);
    window.dispatchEvent(new CustomEvent<ThemeMode>(THEME_EVENT, { detail: next }));
  }

  function setAccentTheme(next: AccentTheme) {
    applyAccentLocally(next, userId);
    setAccentThemeState(next);
    if (userId) {
      void supabase
        .from("profiles")
        .update({ accent_theme: next })
        .eq("id", userId);
    }
  }

  return { theme, toggleTheme, accentTheme, setAccentTheme };
}
