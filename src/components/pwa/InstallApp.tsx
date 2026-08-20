import { useEffect, useState } from "react";
import { Download, Share, SquarePlus } from "lucide-react";

import { useI18n } from "@/lib/i18n";

/**
 * Proposition d'installation sur l'écran d'accueil.
 *
 * Deux mondes. Sur Android et sur ordinateur, le navigateur émet
 * `beforeinstallprompt` et laisse déclencher l'installation depuis un bouton.
 * iOS ne connaît pas cet événement : l'ajout passe obligatoirement par le menu
 * de partage de Safari, donc la seule chose utile à faire est de l'expliquer.
 *
 * Rien ne s'affiche quand l'application tourne déjà en installée.
 */
type InstallEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    // Safari iOS n'implémente pas display-mode et expose ce drapeau à la place.
    (window.navigator as unknown as { standalone?: boolean }).standalone === true
  );
}

function isIos(): boolean {
  if (typeof navigator === "undefined") return false;
  return /iphone|ipad|ipod/i.test(navigator.userAgent);
}

export function InstallApp() {
  const { t } = useI18n();
  const [prompt, setPrompt] = useState<InstallEvent | null>(null);
  const [installed, setInstalled] = useState(true);
  const [ios, setIos] = useState(false);

  useEffect(() => {
    setInstalled(isStandalone());
    setIos(isIos());

    const onPrompt = (event: Event) => {
      // Sans cet appel, Chrome affiche sa propre bannière au moment qu'il
      // choisit ; on préfère un bouton à un endroit prévisible.
      event.preventDefault();
      setPrompt(event as InstallEvent);
    };
    const onInstalled = () => {
      setInstalled(true);
      setPrompt(null);
    };

    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  if (installed) return null;
  if (!prompt && !ios) return null;

  return (
    <section className="mt-4 rounded-2xl border border-primary/30 bg-primary/5 p-4">
      <h2 className="flex items-center gap-2 text-base font-bold">
        <Download className="h-4 w-4 text-primary" /> {t("install.title")}
      </h2>
      <p className="mt-1 text-xs text-muted-foreground">{t("install.body")}</p>

      {prompt ? (
        <button
          type="button"
          onClick={() => {
            void prompt.prompt();
            void prompt.userChoice.finally(() => setPrompt(null));
          }}
          className="mt-3 w-full rounded-xl bg-gradient-brand py-2.5 text-sm font-bold text-background"
        >
          {t("install.action")}
        </button>
      ) : (
        <p className="mt-3 flex flex-wrap items-center gap-1.5 rounded-xl border border-border bg-surface-2 px-3 py-2.5 text-xs">
          <Share className="h-4 w-4 shrink-0 text-primary" />
          {t("install.ios.share")}
          <SquarePlus className="h-4 w-4 shrink-0 text-primary" />
          {t("install.ios.add")}
        </p>
      )}
    </section>
  );
}
