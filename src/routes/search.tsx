import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Search as SearchIcon } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/layout/AppShell";
import { CATEGORIES, categoryMeta, difficultyLabel } from "@/lib/categories";

export const Route = createFileRoute("/search")({
  head: () => ({
    meta: [
      { title: "Explorer les contenus STEM — STEMFLOW" },
      {
        name: "description",
        content:
          "Recherche des vidéos, articles et quiz par mot-clé, catégorie ou niveau de difficulté.",
      },
      { property: "og:title", content: "Explorer les contenus STEM — STEMFLOW" },
      { property: "og:description", content: "Trouve le contenu STEM qui te correspond." },
    ],
  }),
  component: SearchPage,
});

type Row = {
  id: string;
  title: string;
  description: string | null;
  category: string;
  difficulty: string;
  content_type: string;
  xp_reward: number;
  likes_count: number;
};

function SearchPage() {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<string>("Tout");
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    const timer = setTimeout(async () => {
      let q = supabase
        .from("contents")
        .select("id,title,description,category,difficulty,content_type,xp_reward,likes_count")
        .order("likes_count", { ascending: false })
        .limit(50);
      if (category !== "Tout") q = q.eq("category", category);
      if (query.trim()) q = q.ilike("title", `%${query.trim()}%`);
      const { data } = await q;
      if (!alive) return;
      setRows((data as Row[]) ?? []);
      setLoading(false);
    }, 250);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [query, category]);

  const chips = useMemo(() => ["Tout", ...CATEGORIES], []);

  return (
    <AppShell>
      <div className="mx-auto max-w-3xl px-4 py-6 md:px-8 md:py-10">
        <h1 className="text-3xl">Explorer</h1>
        <p className="mt-1 text-sm text-muted-foreground">Trouve un sujet, un quiz ou une vidéo.</p>

        <div className="relative mt-5">
          <SearchIcon className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Rechercher un contenu…"
            className="w-full rounded-full border border-border bg-surface-2 py-3 pl-11 pr-4 text-sm outline-none focus:border-primary/60"
          />
        </div>

        <div className="mt-4 flex gap-2 overflow-x-auto no-scrollbar">
          {chips.map((c) => (
            <button
              key={c}
              onClick={() => setCategory(c)}
              className={`shrink-0 rounded-full border px-3.5 py-1.5 text-xs font-bold ${
                category === c
                  ? "border-primary bg-primary/15 text-primary"
                  : "border-border bg-surface-2 text-muted-foreground"
              }`}
            >
              {c}
            </button>
          ))}
        </div>

        <div className="mt-6 space-y-2.5">
          {loading && <p className="text-sm text-muted-foreground">Recherche…</p>}
          {!loading && rows.length === 0 && (
            <p className="py-12 text-center text-sm text-muted-foreground">Aucun résultat.</p>
          )}
          {rows.map((row) => {
            const meta = categoryMeta(row.category);
            return (
              <Link
                key={row.id}
                to="/feed"
                className="flex items-start gap-3 rounded-2xl border border-border bg-surface-2 p-4 transition-colors hover:border-primary/40"
              >
                <span className="text-2xl">{meta.emoji}</span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold">{row.title}</p>
                  <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                    {row.description}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-1.5 text-[10px] font-bold">
                    <span
                      className={`rounded-full border px-2 py-0.5 ${meta.bg} ${meta.border} ${meta.text}`}
                    >
                      {row.category}
                    </span>
                    <span className="rounded-full border border-border px-2 py-0.5 text-muted-foreground">
                      {difficultyLabel(row.difficulty)}
                    </span>
                    <span className="rounded-full border border-primary/40 bg-primary/10 px-2 py-0.5 text-primary">
                      +{row.xp_reward} XP
                    </span>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      </div>
    </AppShell>
  );
}
