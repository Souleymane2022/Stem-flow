import { supabaseAdmin } from "@/integrations/supabase/client.server";

/**
 * Vérifie que l'appelant fait partie des comptes autorisés à alimenter le
 * catalogue, et renvoie son courriel.
 *
 * Le courriel est lu auprès du service d'authentification, jamais dans
 * `profiles` : la politique `profiles_update_own` laisse chacun modifier sa
 * propre fiche, courriel compris, donc s'y fier reviendrait à laisser
 * n'importe qui se déclarer administrateur en changeant un champ.
 *
 * Masquer les formulaires côté navigateur ne suffit pas : une fonction serveur
 * reste appelable directement, avec un jeton valide et n'importe quel corps de
 * requête. Ce contrôle-ci est celui qui protège réellement le catalogue.
 */
export async function requireAdmin(userId: string): Promise<string> {
  const { data: account, error } = await supabaseAdmin.auth.admin.getUserById(userId);
  const email = account?.user?.email?.trim().toLowerCase();
  if (error || !email) {
    throw new Error("Compte introuvable : impossible de vérifier l'autorisation.");
  }

  const { data: admins, error: listError } = await supabaseAdmin.from("app_admins").select("email");
  if (listError) {
    // Sans la liste, on refuse : une panne de lecture ne doit pas ouvrir l'accès.
    throw new Error(`Liste des comptes autorisés illisible : ${listError.message}`);
  }

  const allowed = (admins ?? []).some((row) => row.email.trim().toLowerCase() === email);
  if (!allowed) {
    throw new Error("Cette action est réservée aux comptes autorisés.");
  }
  return email;
}
