/**
 * Toutes les formes sous lesquelles YouTube donne l'adresse d'une vidéo.
 *
 * `/live/` manquait, et c'est précisément celle que YouTube propose pour un
 * direct : l'identifiant n'était pas reconnu, l'adresse entière se retrouvait
 * enregistrée à sa place, et la vignette comme le lecteur ne pouvaient plus
 * rien en faire — d'où le rectangle gris.
 */
const PATTERNS = [
  /youtu\.be\/([\w-]{11})/,
  /youtube\.com\/live\/([\w-]{11})/,
  /youtube\.com\/shorts\/([\w-]{11})/,
  /youtube\.com\/embed\/([\w-]{11})/,
  /youtube\.com\/v\/([\w-]{11})/,
  // `watch?v=`, mais aussi `watch?feature=…&v=…` : le paramètre n'est pas
  // toujours le premier.
  /[?&]v=([\w-]{11})/,
];

/** Un identifiant YouTube fait onze caractères, lettres, chiffres, `-` et `_`. */
export function isYouTubeId(value: string): boolean {
  return /^[\w-]{11}$/.test(value);
}

/**
 * Renvoie l'identifiant, jamais autre chose.
 *
 * Accepte une adresse complète ou l'identifiant seul. Rendre `null` plutôt que
 * le texte d'origine évite d'enregistrer une adresse entière dans un champ qui
 * attend un identifiant — l'erreur est alors visible tout de suite, au lieu de
 * n'apparaître qu'à la lecture.
 */
export function extractYouTubeId(input: string): string | null {
  const trimmed = (input ?? "").trim();
  if (!trimmed) return null;
  if (isYouTubeId(trimmed)) return trimmed;
  for (const pattern of PATTERNS) {
    const match = trimmed.match(pattern);
    if (match?.[1]) return match[1];
  }
  return null;
}

export function youtubeThumbnail(videoId: string) {
  return `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
}
