import { useCallback, useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Bell, BellOff, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useI18n } from "@/lib/i18n";
import { getPushPublicKey } from "@/lib/push.functions";

/**
 * La clé VAPID voyage en base64url ; l'API attend des octets.
 *
 * Le tampon est alloué explicitement : le type `Uint8Array` générique admet
 * une mémoire partagée, que `applicationServerKey` refuse.
 */
function decodeKey(base64url: string): ArrayBuffer {
  const padded = base64url.padEnd(base64url.length + ((4 - (base64url.length % 4)) % 4), "=");
  const binary = atob(padded.replace(/-/g, "+").replace(/_/g, "/"));
  const buffer = new ArrayBuffer(binary.length);
  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return buffer;
}

/** Les clés du navigateur arrivent en ArrayBuffer ; la base les stocke en texte. */
function encodeKey(buffer: ArrayBuffer | null): string {
  if (!buffer) return "";
  return btoa(String.fromCharCode(...new Uint8Array(buffer)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function isIos(): boolean {
  return typeof navigator !== "undefined" && /iphone|ipad|ipod/i.test(navigator.userAgent);
}

function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (window.navigator as unknown as { standalone?: boolean }).standalone === true
  );
}

/**
 * Interrupteur des notifications poussées.
 *
 * Elles arrivent même quand l'application est fermée : c'est le système
 * d'exploitation qui les reçoit, via le service worker. Deux limites méritent
 * d'être dites plutôt que découvertes — iOS ne les délivre qu'aux applications
 * ajoutées à l'écran d'accueil, et un refus de permission ne peut pas être
 * redemandé depuis la page, il faut passer par les réglages du navigateur.
 */
export function PushToggle() {
  const { session } = useAuth();
  const { t } = useI18n();
  const fetchKey = useServerFn(getPushPublicKey);

  const [supported, setSupported] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const [busy, setBusy] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const [needsInstall, setNeedsInstall] = useState(false);

  useEffect(() => {
    const ok =
      typeof window !== "undefined" &&
      "serviceWorker" in navigator &&
      "PushManager" in window &&
      "Notification" in window;
    setSupported(ok);
    setNeedsInstall(isIos() && !isStandalone());
    if (!ok) return;
    setBlocked(Notification.permission === "denied");
    void navigator.serviceWorker.ready.then(async (registration) => {
      const existing = await registration.pushManager.getSubscription();
      setEnabled(Boolean(existing));
    });
  }, []);

  const enable = useCallback(async () => {
    if (!session) return;
    setBusy(true);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setBlocked(permission === "denied");
        toast.error(t("push.refused"));
        return;
      }

      const { publicKey } = await fetchKey();
      if (!publicKey) {
        toast.error(t("push.notConfigured"));
        return;
      }

      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.subscribe({
        // Exigé par Chrome : chaque message poussé doit se voir. Un abonnement
        // silencieux serait refusé.
        userVisibleOnly: true,
        applicationServerKey: decodeKey(publicKey),
      });

      const { error } = await supabase.from("push_subscriptions").upsert(
        {
          endpoint: subscription.endpoint,
          user_id: session.user.id,
          p256dh: encodeKey(subscription.getKey("p256dh")),
          auth: encodeKey(subscription.getKey("auth")),
          user_agent: navigator.userAgent.slice(0, 200),
        },
        { onConflict: "endpoint" },
      );
      if (error) throw new Error(error.message);

      setEnabled(true);
      toast.success(t("push.enabled"));
    } catch (error) {
      console.error("[push] activation impossible", error);
      toast.error(error instanceof Error ? error.message : t("push.failed"));
    } finally {
      setBusy(false);
    }
  }, [session, fetchKey, t]);

  const disable = useCallback(async () => {
    setBusy(true);
    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      if (subscription) {
        await supabase.from("push_subscriptions").delete().eq("endpoint", subscription.endpoint);
        await subscription.unsubscribe();
      }
      setEnabled(false);
      toast.success(t("push.disabled"));
    } catch (error) {
      console.error("[push] désactivation impossible", error);
    } finally {
      setBusy(false);
    }
  }, [t]);

  if (!supported || !session) return null;

  return (
    <section className="mt-4 rounded-2xl border border-border bg-surface p-4">
      <h2 className="flex items-center gap-2 text-base font-bold">
        {enabled ? (
          <Bell className="h-4 w-4 text-primary" />
        ) : (
          <BellOff className="h-4 w-4 text-muted-foreground" />
        )}
        {t("push.title")}
      </h2>
      <p className="mt-1 text-xs text-muted-foreground">{t("push.body")}</p>

      {needsInstall && (
        <p className="mt-2 rounded-xl border border-border bg-surface-2 px-3 py-2 text-[11px] text-muted-foreground">
          {t("push.iosHint")}
        </p>
      )}
      {blocked && (
        <p className="mt-2 rounded-xl border border-destructive/40 bg-destructive/10 px-3 py-2 text-[11px] text-destructive">
          {t("push.blocked")}
        </p>
      )}

      <button
        type="button"
        onClick={() => void (enabled ? disable() : enable())}
        disabled={busy || blocked}
        className={`mt-3 flex w-full items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-bold disabled:opacity-60 ${
          enabled
            ? "border border-border bg-surface-2 text-foreground"
            : "bg-gradient-brand text-background"
        }`}
      >
        {busy && <Loader2 className="h-4 w-4 animate-spin" />}
        {enabled ? t("push.disable") : t("push.enable")}
      </button>
    </section>
  );
}
