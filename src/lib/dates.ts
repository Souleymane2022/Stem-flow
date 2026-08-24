/**
 * Repères de temps lisibles.
 *
 * « Le vendredi 22 août 2026 à 18:30 » répond à « quand », mais pas à « c'est
 * dans combien de temps ». Devant une séance annoncée, c'est pourtant la
 * seconde question qu'on se pose, et la seule qui décide si on reste.
 */
const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

export function relativeTime(target: string | Date, locale: string): string {
  const date = typeof target === "string" ? new Date(target) : target;
  const diff = date.getTime() - Date.now();
  const abs = Math.abs(diff);
  const format = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });

  if (abs < HOUR) return format.format(Math.round(diff / MINUTE), "minute");
  if (abs < DAY) return format.format(Math.round(diff / HOUR), "hour");
  if (abs < 30 * DAY) return format.format(Math.round(diff / DAY), "day");
  return format.format(Math.round(diff / (30 * DAY)), "month");
}

/** « 90 » minutes se lit mal ; « 1 h 30 » se lit d'un coup d'œil. */
export function durationLabel(minutes: number, locale: string): string {
  if (minutes < 60) return new Intl.NumberFormat(locale).format(minutes) + " min";
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  const h = locale.startsWith("ar") ? "س" : "h";
  return rest === 0 ? `${hours} ${h}` : `${hours} ${h} ${String(rest).padStart(2, "0")}`;
}
