import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/layout/AppShell";

export const Route = createFileRoute("/terms")({
  head: () => ({
    meta: [
      { title: "Conditions d'utilisation — STEMFLOW" },
      {
        name: "description",
        content:
          "Les règles de la communauté STEMFLOW : publication, respect, propriété intellectuelle.",
      },
      { property: "og:title", content: "Conditions d'utilisation — STEMFLOW" },
      { property: "og:description", content: "Les règles de vie de la communauté STEMFLOW." },
    ],
  }),
  component: TermsPage,
});

function TermsPage() {
  return (
    <AppShell>
      <article className="mx-auto max-w-2xl px-4 py-6 md:px-8 md:py-10">
        <h1 className="text-3xl">Conditions d'utilisation</h1>
        <div className="mt-6 space-y-5 text-sm leading-relaxed text-foreground/85">
          <h2 className="text-lg font-extrabold">1. Objet</h2>
          <p>
            STEMFLOW est une plateforme sociale éducative dédiée aux sciences, à la technologie, à
            l'ingénierie et aux mathématiques, destinée principalement à la jeunesse africaine
            francophone.
          </p>
          <h2 className="text-lg font-extrabold">2. Compte</h2>
          <p>
            Tu es responsable de la confidentialité de tes identifiants et de toute activité
            effectuée depuis ton compte.
          </p>
          <h2 className="text-lg font-extrabold">3. Contenus publiés</h2>
          <p>
            Les contenus doivent rester pédagogiques, respectueux et libres de droits ou
            correctement attribués. Tout contenu haineux, trompeur ou hors sujet peut être retiré.
          </p>
          <h2 className="text-lg font-extrabold">4. Gamification</h2>
          <p>
            L'XP, les niveaux et les badges sont purement symboliques et n'ont aucune valeur
            monétaire. Toute tentative de manipulation du système peut entraîner la suspension du
            compte.
          </p>
        </div>
      </article>
    </AppShell>
  );
}
