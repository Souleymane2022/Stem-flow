/**
 * Le logo officiel, en verrouillage complet (symbole + mot).
 *
 * Il est dessiné sur un fond clair : posé tel quel sur l'interface sombre, le
 * ruban anthracite du symbole disparaîtrait. On lui donne donc toujours sa
 * carte blanche, ce qui fait aussi office de cartouche de marque.
 */
export function BrandLogo({
  className = "h-16",
  padding = "px-5 py-4",
}: {
  className?: string;
  padding?: string;
}) {
  return (
    <div className={`inline-flex rounded-3xl bg-white shadow-2xl ${padding}`}>
      <img
        src="/logo-512.png"
        alt="STEMFLOW"
        width={512}
        height={512}
        className={`${className} w-auto object-contain`}
      />
    </div>
  );
}
