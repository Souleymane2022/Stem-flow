import type { Translate } from "@/lib/i18n";

/**
 * Traduit une erreur PostgREST en phrase actionnable.
 *
 * Quand une migration n'a pas été appliquée, la base répond « function
 * public.is_app_admin() does not exist » ou « column … does not exist ». Le
 * message est exact mais ne dit pas quoi faire, et il s'affiche à quelqu'un
 * qui cherchera la cause dans l'application plutôt que dans le SQL Editor.
 */
type DbError = { code?: string; message: string };

/** 42883 : fonction absente. 42P01 : table absente. 42703 : colonne absente. */
const MISSING_OBJECT = new Set(["42883", "42P01", "42703", "PGRST202", "PGRST204"]);

export function explainDbError(error: DbError, t: Translate): string {
  if (error.code && MISSING_OBJECT.has(error.code)) return t("db.updateNeeded");
  // Certaines réponses n'ont pas de code : le texte reste reconnaissable.
  if (/does not exist|schema cache/i.test(error.message)) return t("db.updateNeeded");
  return error.message;
}
