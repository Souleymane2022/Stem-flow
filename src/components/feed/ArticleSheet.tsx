import { X } from "lucide-react";
import { categoryMeta } from "@/lib/categories";

type Props = {
  title: string;
  category: string;
  text: string;
  imageUrl?: string | null;
  onClose: () => void;
};

export function ArticleSheet({ title, category, text, imageUrl, onClose }: Props) {
  const meta = categoryMeta(category);
  return (
    <div
      className="fixed inset-0 z-[70] flex items-end justify-center bg-black/80 md:items-center"
      onClick={onClose}
    >
      <article
        className="h-[85dvh] w-full max-w-2xl overflow-y-auto rounded-t-3xl border border-border bg-elevated md:h-[85vh] md:rounded-3xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className={`relative bg-gradient-to-br ${meta.gradient} px-6 py-8`}>
          <button
            onClick={onClose}
            aria-label="Fermer"
            className="absolute right-4 top-4 rounded-full bg-background/60 p-2 text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
          <span
            className={`rounded-full border px-3 py-1 text-[11px] font-bold ${meta.bg} ${meta.border} ${meta.text}`}
          >
            {meta.emoji} {category}
          </span>
          <h1 className="mt-3 text-3xl">{title}</h1>
        </div>
        {imageUrl && (
          <img src={imageUrl} alt={title} loading="lazy" className="max-h-72 w-full object-cover" />
        )}
        <div className="space-y-4 px-6 py-6 text-[15px] leading-relaxed text-foreground/90">
          {text
            .split("\n")
            .filter(Boolean)
            .map((paragraph, i) => (
              <p key={i}>{paragraph}</p>
            ))}
        </div>
      </article>
    </div>
  );
}
