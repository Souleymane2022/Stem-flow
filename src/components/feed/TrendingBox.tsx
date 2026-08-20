import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Eye, Flame } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { useI18n } from "@/lib/i18n";
import { categoryMeta } from "@/lib/categories";
import { youtubeThumbnail } from "@/utils/youtube";

type Trending = {
  id: string;
  title: string;
  category: string;
  video_id: string | null;
  views_count: number;
  likes_count: number;
};

/** Huit vignettes : de quoi remplir une bande sans la transformer en catalogue. */
const HOW_MANY = 8;

/**
 * Les vidéos les plus regardées.
 *
 * Le compteur de vues vient de `record_video_engagement`, alimenté par le fil :
 * il compte les personnes qui ont réellement lancé la vidéo, pas les cartes qui
 * ont défilé devant elles. Les vues d'avant la mise en place du compteur sont
 * donc à zéro — la bande se remplit à l'usage, et c'est voulu : un classement
 * bâti sur des chiffres inventés ne dirait rien.
 */
export function TrendingBox() {
  const { t } = useI18n();
  const [rows, setRows] = useState<Trending[]>([]);

  useEffect(() => {
    let alive = true;
    void (async () => {
      const { data, error } = await supabase
        .from("contents")
        .select("id,title,category,video_id,views_count,likes_count")
        .eq("content_type", "video")
        .order("views_count", { ascending: false })
        .order("likes_count", { ascending: false })
        .limit(HOW_MANY);
      if (!alive) return;
      if (error) {
        console.error("[tendances] lecture impossible", error);
        return;
      }
      setRows((data as Trending[]) ?? []);
    })();
    return () => {
      alive = false;
    };
  }, []);

  if (rows.length === 0) return null;

  return (
    <section className="mt-6">
      <h2 className="flex items-center gap-2 text-base font-bold">
        <Flame className="h-4 w-4 text-destructive" /> {t("trending.title")}
      </h2>
      <p className="mt-1 text-xs text-muted-foreground">{t("trending.subtitle")}</p>

      {/* Bande défilante : sur téléphone, une grille prendrait tout l'écran
          avant même la barre de recherche. */}
      <div className="-mx-4 mt-3 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-2 md:-mx-8 md:px-8">
        {rows.map((row, index) => {
          const meta = categoryMeta(row.category);
          return (
            <Link
              key={row.id}
              to="/feed"
              search={{ start: row.id }}
              className="group w-40 shrink-0 snap-start overflow-hidden rounded-2xl border border-border bg-surface-2 transition-colors hover:border-primary/40 md:w-48"
            >
              <span className="relative block aspect-video w-full bg-black">
                {row.video_id && (
                  <img
                    src={youtubeThumbnail(row.video_id)}
                    alt=""
                    aria-hidden="true"
                    loading="lazy"
                    decoding="async"
                    className="h-full w-full object-cover opacity-85 transition-opacity group-hover:opacity-100"
                  />
                )}
                <span className="absolute start-1.5 top-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-background/85 text-[11px] font-black text-primary">
                  {index + 1}
                </span>
                <span className="absolute bottom-1.5 end-1.5 flex items-center gap-1 rounded-full bg-background/85 px-2 py-0.5 text-[10px] font-bold">
                  <Eye className="h-3 w-3" /> {row.views_count}
                </span>
              </span>
              <span className="block p-2.5">
                <span className="line-clamp-2 text-xs font-bold leading-snug">{row.title}</span>
                <span className={`mt-1.5 block text-[10px] font-bold ${meta.text}`}>
                  {meta.emoji} {row.category}
                </span>
              </span>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
