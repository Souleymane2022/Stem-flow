import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  useRouterState,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";
import { Toaster } from "sonner";

import appCss from "../styles.css?url";
import { reportLovableError } from "../lib/lovable-error-reporting";
import { AuthProvider } from "@/hooks/useAuth";
import { I18nProvider } from "@/lib/i18n";
import { XpPopupProvider } from "@/components/gamification/XpPopup";

function NotFoundComponent() {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl text-gradient-brand">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Page introuvable</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Cette page n'existe pas ou a été déplacée.
        </p>
        <div className="mt-6">
          <Link
            to="/feed"
            className="inline-flex items-center justify-center rounded-full bg-gradient-brand px-5 py-2.5 text-sm font-black text-primary-foreground"
          >
            Retour au fil
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();
  const path = useRouterState({ select: (s) => s.location.pathname });
  useEffect(() => {
    reportLovableError(error, { boundary: "tanstack_root_error_component" });
  }, [error]);

  return (
    <div className="flex min-h-dvh items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          Une erreur est survenue
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">Veuillez réessayer.</p>

        {/* Le message était masqué : il fallait ouvrir la console du navigateur
            pour savoir quoi que ce soit. L'afficher rend la panne diagnosticable
            depuis un téléphone, où la console n'est pas accessible. */}
        <p className="mt-4 break-words rounded-xl border border-destructive/40 bg-destructive/10 px-3 py-2 text-start text-xs text-destructive">
          <span className="font-bold">{path}</span>
          {" — "}
          {error.message || error.name || "erreur sans message"}
        </p>
        {error.stack && (
          <details className="mt-2 text-start">
            <summary className="cursor-pointer text-[11px] text-muted-foreground">
              Détail technique
            </summary>
            <pre className="mt-1 max-h-48 overflow-auto whitespace-pre-wrap rounded-lg bg-surface-2 p-2 text-[10px] leading-snug text-muted-foreground">
              {error.stack}
            </pre>
          </details>
        )}

        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex items-center justify-center rounded-full bg-gradient-brand px-5 py-2.5 text-sm font-black text-primary-foreground"
          >
            Réessayer
          </button>
          <a
            href="/"
            className="inline-flex items-center justify-center rounded-full border border-border bg-surface-2 px-5 py-2.5 text-sm font-semibold text-foreground"
          >
            Accueil
          </a>
        </div>
      </div>
    </div>
  );
}

/**
 * Racine absolue du site, pour l'aperçu partagé sur les réseaux : leurs robots
 * n'acceptent pas toujours un chemin relatif. Vide en développement, où
 * l'aperçu n'a pas d'intérêt ; à renseigner dans Vercel via VITE_SITE_URL.
 */
const SITE_URL = (import.meta.env["VITE_SITE_URL"] ?? "").replace(/\/$/, "");

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1, viewport-fit=cover" },
      { title: "STEMFLOW — Apprends les sciences en scrollant" },
      {
        name: "description",
        content:
          "Rejoins STEMFLOW : un fil vertical de vidéos, d'articles et de quiz STEM en français, avec XP, badges et salons de discussion.",
      },
      { name: "theme-color", content: "#050A0E" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { property: "og:title", content: "STEMFLOW — Apprends les sciences en scrollant" },
      { name: "twitter:title", content: "STEMFLOW — Apprends les sciences en scrollant" },
      {
        property: "og:description",
        content:
          "Rejoins STEMFLOW : un fil vertical de vidéos, d'articles et de quiz STEM en français, avec XP, badges et salons de discussion.",
      },
      {
        name: "twitter:description",
        content:
          "Rejoins STEMFLOW : un fil vertical de vidéos, d'articles et de quiz STEM en français, avec XP, badges et salons de discussion.",
      },
      { property: "og:image", content: `${SITE_URL}/og-card.jpg` },
      { property: "og:image:width", content: "1200" },
      { property: "og:image:height", content: "630" },
      { property: "og:image:alt", content: "STEMFLOW" },
      { name: "twitter:image", content: `${SITE_URL}/og-card.jpg` },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap",
      },
      { rel: "icon", href: "/favicon.ico", type: "image/x-icon" },
      { rel: "icon", href: "/apple-touch-icon.png", type: "image/png", sizes: "180x180" },
      { rel: "apple-touch-icon", href: "/apple-touch-icon.png" },
      // Le fil monte des lecteurs YouTube : ouvrir les connexions au plus tôt
      // évite un aller-retour DNS/TLS au moment de la première lecture.
      { rel: "preconnect", href: "https://www.youtube.com" },
      { rel: "preconnect", href: "https://i.ytimg.com" },
      // Hôte du lecteur lui-même : sans lui, la première vidéo attend une
      // résolution DNS et une poignée de main TLS de plus.
      { rel: "preconnect", href: "https://s.ytimg.com" },
      { rel: "dns-prefetch", href: "https://googlevideo.com" },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="fr" className="dark">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();

  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <I18nProvider>
          <XpPopupProvider>
            {/* Required: nested routes render here. */}
            <Outlet />
            <Toaster theme="dark" position="top-center" richColors />
          </XpPopupProvider>
        </I18nProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}
