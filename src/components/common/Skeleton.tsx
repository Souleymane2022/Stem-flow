/**
 * Formes grises affichées pendant un chargement.
 *
 * « Chargement… » sur un écran vide ne dit rien de ce qui arrive : l'attente
 * paraît plus longue, et rien ne laisse deviner si la page tiendra en trois
 * lignes ou en trente. Une esquisse de la mise en page à venir occupe l'espace
 * et rend l'attente lisible.
 */
export function Skeleton({ className = "" }: { className?: string }) {
  return <span className={`block animate-pulse rounded-lg bg-border/60 ${className}`} />;
}

/** Esquisse d'une liste de lignes : vignette ou pastille, titre, sous-titre. */
export function SkeletonList({ rows = 4, thumb = false }: { rows?: number; thumb?: boolean }) {
  return (
    <ul className="space-y-2.5" aria-hidden="true">
      {Array.from({ length: rows }, (_, i) => (
        <li
          key={i}
          className="flex items-center gap-3 rounded-2xl border border-border bg-surface-2 p-3"
          // L'esquisse s'estompe vers le bas : l'œil comprend que la liste
          // continue, au lieu de croire à des lignes restées vides.
          style={{ opacity: Math.max(0.4, 1 - i * 0.13) }}
        >
          <Skeleton className={thumb ? "h-12 w-20 shrink-0" : "h-10 w-10 shrink-0 rounded-full"} />
          <span className="min-w-0 flex-1 space-y-2">
            <Skeleton className="h-3.5 w-2/3" />
            <Skeleton className="h-3 w-1/3" />
          </span>
        </li>
      ))}
    </ul>
  );
}

/** Esquisse d'une grille de cartes, pour les cours. */
export function SkeletonCards({ cards = 4 }: { cards?: number }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2" aria-hidden="true">
      {Array.from({ length: cards }, (_, i) => (
        <div
          key={i}
          className="overflow-hidden rounded-2xl border border-border bg-surface"
          style={{ opacity: Math.max(0.4, 1 - i * 0.13) }}
        >
          <Skeleton className="aspect-video w-full rounded-none" />
          <div className="space-y-2 p-4">
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-3 w-1/2" />
          </div>
        </div>
      ))}
    </div>
  );
}
