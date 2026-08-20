/**
 * Comptes autorisés à alimenter le catalogue.
 *
 * Cette liste ne sert qu'à l'affichage : masquer un bouton n'est pas un
 * contrôle d'accès, puisque les fonctions serveur restent appelables
 * directement. L'autorisation qui compte est en base, dans `app_admins`,
 * vérifiée par `is_app_admin()` et par les fonctions serveur.
 *
 * Les deux listes doivent rester alignées. Ajouter quelqu'un se fait en base
 * (une ligne dans `app_admins`, sans déploiement) ; le reporter ici ne sert
 * qu'à lui montrer l'entrée de menu.
 */
const ADMIN_EMAILS = [
  "souleymanemahamatsaleh2000@gmail.com",
  "attioukotchole@gmail.com",
  "ciramamys@gmail.com",
];

export function isAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return ADMIN_EMAILS.includes(email.trim().toLowerCase());
}
