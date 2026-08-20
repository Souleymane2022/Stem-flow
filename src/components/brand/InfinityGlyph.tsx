/** Le ∞ de la marque, utilisé comme pictogramme d'XP. */
export function InfinityGlyph({ className = "" }: { className?: string }) {
  return (
    <span className={`text-gradient-brand font-black leading-none ${className}`} aria-hidden="true">
      ∞
    </span>
  );
}
