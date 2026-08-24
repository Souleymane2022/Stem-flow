/**
 * Compteurs lisibles d'un coup d'œil.
 *
 * « 1234 » demande un effort de lecture que « 1,2 k » n'exige pas, et sur la
 * colonne d'actions du fil, un nombre à quatre chiffres déborde de sa pastille.
 * En dessous de mille, la valeur exacte reste plus parlante.
 */
export function formatCount(value: number, locale: string): string {
  if (!Number.isFinite(value)) return "0";
  if (Math.abs(value) < 1000) return new Intl.NumberFormat(locale).format(value);
  return new Intl.NumberFormat(locale, {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value);
}
