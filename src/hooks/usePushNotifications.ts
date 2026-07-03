import { useCallback, useEffect, useState } from "react";

import { supabase } from "@/integrations/supabase/client";

type PermissionState = "default" | "granted" | "denied";
type Status =
  | "unsupported"
  | "needs-ios-install"
  | "loading"
  | "unsubscribed"
  | "subscribed"
  | "denied"
  | "error";

interface PushState {
  status: Status;
  permission: PermissionState;
  isBusy: boolean;
  error: string | null;
  subscribe: () => Promise<void>;
  unsubscribe: () => Promise<void>;
  refresh: () => Promise<void>;
}

function isSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

function isIOS(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  const isIPad =
    /iPad/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  return /iPhone|iPod/.test(ua) || isIPad;
}

function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia?.("(display-mode: standalone)").matches ||
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = window.atob(base64);
  const output = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) output[i] = raw.charCodeAt(i);
  return output;
}

function subToBody(sub: PushSubscription) {
  const json = sub.toJSON();
  return {
    endpoint: sub.endpoint,
    p256dh: json.keys?.p256dh ?? "",
    auth: json.keys?.auth ?? "",
    expiration_time: sub.expirationTime ?? null,
    user_agent: navigator.userAgent,
    platform: navigator.platform,
  };
}

async function getPublicKey(): Promise<string> {
  const { data, error } = await supabase.functions.invoke("push-subscriptions", {
    body: { action: "public-key" },
  });
  if (error) throw new Error(error.message);
  const k = (data as { public_key?: string })?.public_key;
  if (!k) throw new Error("VAPID public key indisponível.");
  return k;
}

export function usePushNotifications(userId: string | null | undefined): PushState {
  const [permission, setPermission] = useState<PermissionState>("default");
  const [status, setStatus] = useState<Status>("loading");
  const [isBusy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setError(null);
    if (!isSupported()) {
      if (isIOS() && !isStandalone()) {
        setStatus("needs-ios-install");
      } else {
        setStatus("unsupported");
      }
      return;
    }
    const perm = Notification.permission as PermissionState;
    setPermission(perm);
    if (perm === "denied") {
      setStatus("denied");
      return;
    }
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      setStatus(sub ? "subscribed" : "unsubscribed");
    } catch (e) {
      setStatus("error");
      setError((e as Error).message);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh, userId]);

  const subscribe = useCallback(async () => {
    setError(null);
    if (!userId) return;
    if (!isSupported()) {
      setStatus(isIOS() && !isStandalone() ? "needs-ios-install" : "unsupported");
      return;
    }
    setBusy(true);
    try {
      const perm = await Notification.requestPermission();
      setPermission(perm as PermissionState);
      if (perm !== "granted") {
        setStatus(perm === "denied" ? "denied" : "unsubscribed");
        return;
      }
      const reg = await navigator.serviceWorker.ready;
      let sub = await reg.pushManager.getSubscription();
      if (!sub) {
        const pub = await getPublicKey();
        sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(pub).buffer as ArrayBuffer,
        });
      }
      const { error: err } = await supabase.functions.invoke("push-subscriptions", {
        body: { action: "subscribe", ...subToBody(sub) },
      });
      if (err) throw new Error(err.message);
      setStatus("subscribed");
    } catch (e) {
      setError((e as Error).message);
      setStatus("error");
    } finally {
      setBusy(false);
    }
  }, [userId]);

  const unsubscribe = useCallback(async () => {
    setError(null);
    if (!isSupported()) return;
    setBusy(true);
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        try {
          await supabase.functions.invoke("push-subscriptions", {
            body: { action: "unsubscribe", endpoint: sub.endpoint },
          });
        } catch {
          /* ignore backend errors */
        }
        try {
          await sub.unsubscribe();
        } catch {
          /* ignore */
        }
      }
      setStatus("unsubscribed");
    } catch (e) {
      setError((e as Error).message);
      setStatus("error");
    } finally {
      setBusy(false);
    }
  }, []);

  return { status, permission, isBusy, error, subscribe, unsubscribe, refresh };
}

// Helper para chamar no logout (best effort).
export async function unsubscribePushOnLogout(): Promise<void> {
  if (!isSupported()) return;
  try {
    const reg = await navigator.serviceWorker.getRegistration();
    if (!reg) return;
    const sub = await reg.pushManager.getSubscription();
    if (!sub) return;
    try {
      await supabase.functions.invoke("push-subscriptions", {
        body: { action: "unsubscribe", endpoint: sub.endpoint },
      });
    } catch {
      /* ignore */
    }
    try {
      await sub.unsubscribe();
    } catch {
      /* ignore */
    }
  } catch {
    /* nunca bloquear logout */
  }
}
