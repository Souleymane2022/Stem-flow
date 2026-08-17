import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/layout/AppShell";

export const Route = createFileRoute("/privacy")({
  head: () => ({
    meta: [
      { title: "Politique de confidentialité — STEMFLOW" },
      {
        name: "description",
        content: "Comment STEMFLOW collecte, utilise et protège les données de ses membres.",
      },
      { property: "og:title", content: "Politique de confidentialité — STEMFLOW" },
      {
        property: "og:description",
        content: "Transparence sur le traitement de tes données STEMFLOW.",
      },
    ],
  }),
  component: PrivacyPage,
});

function PrivacyPage() {
  return (
    <AppShell>
      <article className="mx-auto max-w-2xl px-4 py-6 md:px-8 md:py-10">
        <h1 className="text-3xl">Politique de confidentialité</h1>
        <div className="mt-6 space-y-5 text-sm leading-relaxed text-foreground/85">
          <p>
            STEMFLOW collecte uniquement les informations nécessaires au fonctionnement de la
            plateforme : adresse e-mail, nom d'utilisateur, préférences d'apprentissage et activité
            pédagogique (XP, quiz, contenus enregistrés).
          </p>
          <h2 className="text-lg font-extrabold">Utilisation des données</h2>
          <p>
            Tes données servent à personnaliser ton fil, calculer ta progression et afficher le
            classement communautaire. Elles ne sont jamais vendues à des tiers.
          </p>
          <h2 className="text-lg font-extrabold">Contenus tiers</h2>
          <p>
            Les vidéos sont lues via le lecteur YouTube intégré. YouTube peut déposer ses propres
            cookies, soumis à la politique de confidentialité de Google.
          </p>
          <h2 className="text-lg font-extrabold">Tes droits</h2>
          <p>
            Tu peux demander à tout moment l'export ou la suppression de ton compte et de tes
            données depuis ton profil.
          </p>
        </div>
      </article>
    </AppShell>
  );
}
