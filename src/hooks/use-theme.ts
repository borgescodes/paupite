import { useEffect, useState } from "react";

import type { ThemeMode } from "@/components/mobile/AppHeader";
import { supabase } from "@/integrations/supabase/client";

export type AccentTheme = "blue" | "pink" | "purple" | "green" | "red" | "brazil";
export type BrazilThemeEventDetail = {
  x: number;
  y: number;
  width: number;
  height: number;
};

const THEME_KEY = "paupite-theme";
const ACCENT_KEY = "paupite-accent";
const THEME_EVENT = "paupite:theme-changed";
const ACCENT_EVENT = "paupite:accent-changed";
export const BRAZIL_THEME_EVENT = "paupite:brazil-theme-selected";
const accents: AccentTheme[] = ["blue", "pink", "purple", "green", "red", "brazil"];
const accentFetches = new Map<string, Promise<AccentTheme | null>>();

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

function getBrazilThemeEventDetail(origin?: HTMLElement | null): BrazilThemeEventDetail {
  if (origin) {
    const rect = origin.getBoundingClientRect();
    return {
      x: rect.left + rect.width / 2,
      y: rect.top + rect.height / 2,
      width: rect.width,
      height: rect.height,
    };
  }

  return {
    x: window.innerWidth / 2,
    y: window.innerHeight / 2,
    width: 120,
    height: 52,
  };
}

function fetchAccentTheme(userId: string) {
  const existing = accentFetches.get(userId);
  if (existing) return existing;

  const request = supabase
    .from("profiles")
    .select("accent_theme")
    .eq("id", userId)
    .maybeSingle()
    .then(({ data }) => (isAccentTheme(data?.accent_theme ?? null) ? data.accent_theme : null))
    .catch(() => null);

  accentFetches.set(userId, request);
  return request;
}

export function useThemeMode(userId?: string | null) {
  const [theme, setTheme] = useState<ThemeMode>(() => initialTheme());
  const [accentTheme, setAccentThemeState] = useState<AccentTheme>(() => initialAccent(userId));

  useEffect(() => {
    setTheme(initialTheme());
  }, []);

  useEffect(() => {
    setAccentThemeState(initialAccent(userId));
  }, [userId]);

  // After userId is known, hydrate from DB only when this browser has no explicit user accent.
  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    const localAccent = window.localStorage.getItem(accentStorageKey(userId));

    if (isAccentTheme(localAccent)) {
      document.documentElement.dataset.accent = localAccent;
      setAccentThemeState(localAccent);
      return;
    }

    void fetchAccentTheme(userId).then((next) => {
      if (cancelled || !next) return;
      applyAccentLocally(next, userId);
      setAccentThemeState(next);
    });

    return () => {
      cancelled = true;
    };
  }, [userId]);

  useEffect(() => {
    if (!userId || !accentTheme) return;
    const key = accentStorageKey(userId);
    const stored = window.localStorage.getItem(key);
    if (!isAccentTheme(stored)) {
      window.localStorage.setItem(key, accentTheme);
    }
  }, [accentTheme, userId]);

  useEffect(() => {
    const syncStorage = (event: StorageEvent) => {
      if (event.key === THEME_KEY && (event.newValue === "dark" || event.newValue === "light")) {
        setTheme(event.newValue);
      }
      if (
        event.key &&
        [ACCENT_KEY, accentStorageKey(userId)].includes(event.key) &&
        isAccentTheme(event.newValue)
      ) {
        setAccentThemeState(event.newValue);
      }
    };
    window.addEventListener("storage", syncStorage);
    return () => window.removeEventListener("storage", syncStorage);
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

  function setAccentTheme(next: AccentTheme, origin?: HTMLElement | null) {
    applyAccentLocally(next, userId);
    setAccentThemeState(next);
    if (next === "brazil") {
      window.dispatchEvent(
        new CustomEvent<BrazilThemeEventDetail>(BRAZIL_THEME_EVENT, {
          detail: getBrazilThemeEventDetail(origin),
        }),
      );
    }
    if (userId) {
      accentFetches.set(userId, Promise.resolve(next));
      void supabase.from("profiles").update({ accent_theme: next }).eq("id", userId);
    }
  }

  return { theme, toggleTheme, accentTheme, setAccentTheme };
}
