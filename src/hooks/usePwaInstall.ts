import { useCallback, useEffect, useMemo, useState } from "react";

type InstallOutcome = "accepted" | "dismissed" | "installed" | "unavailable";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};

type NavigatorWithStandalone = Navigator & {
  standalone?: boolean;
};

function isStandaloneDisplay() {
  if (typeof window === "undefined") return false;
  const standaloneMedia = window.matchMedia("(display-mode: standalone)").matches;
  return standaloneMedia || Boolean((window.navigator as NavigatorWithStandalone).standalone);
}

function isIosDevice() {
  if (typeof window === "undefined") return false;
  const userAgent = window.navigator.userAgent.toLowerCase();
  const platform = window.navigator.platform?.toLowerCase() ?? "";
  const maxTouchPoints = window.navigator.maxTouchPoints ?? 0;
  return /iphone|ipad|ipod/.test(userAgent) || (platform === "macintel" && maxTouchPoints > 1);
}

export function usePwaInstall() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState(false);
  const [isIos, setIsIos] = useState(false);

  useEffect(() => {
    setIsInstalled(isStandaloneDisplay());
    setIsIos(isIosDevice());

    const displayMode = window.matchMedia("(display-mode: standalone)");
    const handleDisplayModeChange = () => setIsInstalled(isStandaloneDisplay());
    const handleBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      setDeferredPrompt(event as BeforeInstallPromptEvent);
    };
    const handleInstalled = () => {
      setDeferredPrompt(null);
      setIsInstalled(true);
    };

    displayMode.addEventListener("change", handleDisplayModeChange);
    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    window.addEventListener("appinstalled", handleInstalled);

    return () => {
      displayMode.removeEventListener("change", handleDisplayModeChange);
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
      window.removeEventListener("appinstalled", handleInstalled);
    };
  }, []);

  const canInstall = useMemo(
    () => Boolean(deferredPrompt) && !isInstalled,
    [deferredPrompt, isInstalled],
  );

  const install = useCallback(async (): Promise<InstallOutcome> => {
    if (isInstalled) return "installed";
    if (!deferredPrompt) return "unavailable";

    const promptEvent = deferredPrompt;
    setDeferredPrompt(null);
    await promptEvent.prompt();
    const choice = await promptEvent.userChoice.catch(() => null);
    if (choice?.outcome === "accepted") setIsInstalled(isStandaloneDisplay());
    return choice?.outcome ?? "unavailable";
  }, [deferredPrompt, isInstalled]);

  return {
    canInstall,
    isIos,
    isInstalled,
    install,
  };
}
