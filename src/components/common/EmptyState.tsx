import type { ReactNode } from "react";

/**
 * Écran vide expliqué.
 *
 * Une phrase seule au milieu d'un écran noir ressemble à une panne. Un
 * pictogramme, un titre et une phrase d'aide disent la même chose en donnant
 * la mesure : il n'y a rien ici, et voilà ce qu'on peut y faire.
 */
export function EmptyState({
  icon,
  title,
  hint,
  action,
}: {
  icon: ReactNode;
  title: string;
  hint?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center px-6 py-14 text-center">
      <span className="flex h-14 w-14 items-center justify-center rounded-2xl border border-border bg-surface-2 text-muted-foreground">
        {icon}
      </span>
      <p className="mt-4 text-base font-bold">{title}</p>
      {hint && <p className="mt-1.5 max-w-xs text-sm text-muted-foreground">{hint}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}
