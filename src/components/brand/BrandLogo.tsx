/**
 * Le logo officiel, en verrouillage complet (symbole + mot) ou symbole seul.
 *
 * Le fichier d'origine était un carré JPEG : le logo y occupait un tiers de
 * l'image, posé sur un dégradé gris. Affiché tel quel, il paraissait petit et
 * traînait une plaque grise derrière lui. Les fichiers servis ici sont
 * détourés et recadrés sur le tracé, donc `h-8` donne bien huit unités de
 * logo.
 *
 * Deux teintes, parce que le mot « STEM » est anthracite dans le logo
 * d'origine : illisible sur le fond sombre de l'application. La variante
 * `dark` le passe en blanc et ne touche ni au symbole ni au bleu de « FLOW ».
 */
type Tone = "dark" | "light";

const SOURCES: Record<Tone, string> = {
  dark: "/logo-dark.png",
  light: "/logo-light.png",
};

export function BrandLogo({
  className = "h-10",
  tone = "dark",
}: {
  className?: string;
  tone?: Tone;
}) {
  return (
    <img
      src={SOURCES[tone]}
      alt="STEMFLOW"
      width={800}
      height={224}
      className={`${className} w-auto object-contain`}
    />
  );
}

/** Symbole seul : en dessous de ~40 px de haut, le mot n'est plus lisible. */
export function BrandMark({ className = "h-8" }: { className?: string }) {
  return (
    <img
      src="/logo-mark.png"
      alt=""
      aria-hidden="true"
      width={220}
      height={116}
      className={`${className} w-auto object-contain`}
    />
  );
}
