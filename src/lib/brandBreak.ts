/**
 * Cadence de l'ouverture de marque dans le fil.
 *
 * Elle précédait chaque vidéo. Cinq secondes toutes les vidéos, sur un fil
 * qu'on parcourt par dizaines, transforme l'annonce en péage : elle finit par
 * être perçue comme une gêne, exactement l'inverse de ce qu'on cherche. Une
 * vidéo sur dix suffit à installer la marque sans peser sur le parcours.
 *
 * La décision est mémorisée par contenu : le fil démonte les lecteurs
 * éloignés, et sans cette mémoire, revenir en arrière rejouerait l'annonce et
 * fausserait le décompte.
 */
const VIDEOS_BETWEEN_BREAKS = 10;

const decided = new Map<string, boolean>();
let counter = 0;

/**
 * Cette vidéo doit-elle être précédée de l'annonce ? Vrai pour la première
 * vidéo de la visite, puis toutes les dix.
 */
export function shouldShowBrandBreak(contentId: string): boolean {
  const known = decided.get(contentId);
  if (known !== undefined) return known;
  const show = counter % VIDEOS_BETWEEN_BREAKS === 0;
  counter += 1;
  decided.set(contentId, show);
  return show;
}

/**
 * L'annonce a été jouée devant cette vidéo. Revenir en arrière ne doit pas la
 * rejouer : le fil démonte les slides éloignées, et sans cette marque la
 * décision mémorisée relancerait l'annonce à chaque retour.
 */
export function markBrandBreakShown(contentId: string): void {
  decided.set(contentId, false);
}

/** Réinitialise le décompte. Utilisé par les tests. */
export function resetBrandBreaks(): void {
  decided.clear();
  counter = 0;
}
