import type { ReactNode } from "react";

/**
 * En-tête de page : même taille, même rythme, même place partout.
 *
 * Chaque écran composait le sien, avec des tailles et des marges différentes ;
 * l'application donnait l'impression d'avoir été assemblée page par page. Le
 * titre reste large sur ordinateur et se resserre sur téléphone, où trois
 * lignes de titre repoussaient le contenu sous la ligne de flottaison.
 */
export function PageHeader({
  icon,
  title,
  subtitle,
  action,
}: {
  icon?: ReactNode;
  title: string;
  subtitle?: string;
  action?: ReactNode;
}) {
  return (
    <header className="flex items-start justify-between gap-4">
      <div className="min-w-0">
        <h1 className="flex items-center gap-2 text-2xl md:text-3xl">
          {icon}
          <span className="min-w-0 truncate">{title}</span>
        </h1>
        {subtitle && <p className="mt-1 text-sm leading-snug text-muted-foreground">{subtitle}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </header>
  );
}
