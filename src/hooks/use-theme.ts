import { useEffect, useState } from "react";

import type { ThemeMode } from "@/components/mobile/AppHeader";

const THEME_KEY = "paupite-theme";
const THEME_EVENT = "paupite:theme-changed";

function initialTheme(): ThemeMode {
  if (typeof window === "undefined") return "light";
  const stored = window.localStorage.getItem(THEME_KEY);
  if (stored === "dark" || stored === "light") return stored;
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function useThemeMode() {
  const [theme, setTheme] = useState<ThemeMode>("light");

  useEffect(() => {
    setTheme(initialTheme());
  }, []);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
  }, [theme]);

  useEffect(() => {
    const sync = (event: Event) => {
      const next = (event as CustomEvent<ThemeMode>).detail;
      if (next === "dark" || next === "light") setTheme(next);
    };
    window.addEventListener(THEME_EVENT, sync);
    return () => window.removeEventListener(THEME_EVENT, sync);
  }, []);

  function toggleTheme() {
    const next = theme === "light" ? "dark" : "light";
    window.localStorage.setItem(THEME_KEY, next);
    setTheme(next);
    window.dispatchEvent(new CustomEvent<ThemeMode>(THEME_EVENT, { detail: next }));
  }

  return { theme, toggleTheme };
}
