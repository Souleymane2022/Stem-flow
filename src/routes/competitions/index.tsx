import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { Swords, Users, Clock, Sparkles } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/layout/AppShell";
import { CATEGORIES, categoryMeta } from "@/lib/categories";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";

export const Route = createFileRoute("/competitions/")({
  head: () => ({
    meta: [
      { title: "Compétitions STEM — STEMFLOW" },
      {
        name: "description",
        content:
          "Défie d'autres membres sur la notion de ton choix : maths, physique, code, robotique. Questions générées à la demande.",
      },
      { property: "og:title", content: "Compétitions STEM — STEMFLOW" },
      {
        property: "og:description",
        content: "Crée un défi sur une notion et affronte la communauté en direct.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: CompetitionsPage,
});

type Competition = {
  id: string;
  topic: string;
  category: string;
  difficulty: string;
  question_count: number;
  status: string;
  host_name: string | null;
  created_at: string;
};

const DIFFICULTIES = [
  { value: "debutant", label: "Débutant" },
  { value: "intermediaire", label: "Intermédiaire" },
  { value: "avance", label: "Avancé" },
];

const SUGGESTIONS = [
  "Théorème de Pythagore",
  "Les lois de Newton",
  "La photosynthèse",
  "Les bases de Python",
  "Les capteurs d'un robot",
  "Les fonctions affines",
];

const STATUS_LABEL: Record<string, string> = {
  lobby: "Ouvert",
  running: "En cours",
  finished: "Terminé",
};

function CompetitionsPage() {
  const { user, profile } = useAuth();
  const navigate = useNavigate();
  const [items, setItems] = useState<Competition[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);

  const [topic, setTopic] = useState("");
  const [category, setCategory] = useState<string>(CATEGORIES[0]);
  const [difficulty, setDifficulty] = useState("debutant");
  const [questionCount, setQuestionCount] = useState(5);

  const load = useCallback(async () => {
    const { data } = await supabase
      .from("competitions")
      .select("id,topic,category,difficulty,question_count,status,host_name,created_at")
      .order("created_at", { ascending: false })
      .limit(50);
    const list = (data as Competition[]) ?? [];
    setItems(list);
    if (list.length) {
      const { data: parts } = await supabase
        .from("competition_participants")
        .select("competition_id")
        .in(
          "competition_id",
          list.map((c) => c.id),
        );
      const map: Record<string, number> = {};
      for (const row of (parts as { competition_id: string }[]) ?? []) {
        map[row.competition_id] = (map[row.competition_id] ?? 0) + 1;
      }
      setCounts(map);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
    const channel = supabase
      .channel("competitions-list")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "competitions" },
        () => void load(),
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [load]);

  const createCompetition = async () => {
    if (!user || !profile) {
      toast.error("Connecte-toi pour lancer un défi");
      return;
    }
    const clean = topic.trim();
    if (clean.length < 3) {
      toast.error("Précise la notion du défi");
      return;
    }
    setCreating(true);
    const { data, error } = await supabase
      .from("competitions")
      .insert({
        host_id: user.id,
        host_name: profile.username,
        topic: clean,
        category,
        difficulty,
        question_count: questionCount,
        xp_reward: 60,
      })
      .select("id")
      .single();
    if (error || !data) {
      setCreating(false);
      toast.error("Impossible de créer le défi");
      return;
    }
    await supabase.from("competition_participants").insert({
      competition_id: data.id,
      user_id: user.id,
      username: profile.username,
      avatar_url: profile.profile_image_url,
    });
    setCreating(false);
    setTopic("");
    void navigate({ to: "/competitions/$id", params: { id: data.id } });
  };

  return (
    <AppShell>
      <div className="mx-auto max-w-3xl px-4 py-6 md:px-8 md:py-10">
        <h1 className="flex items-center gap-2 text-3xl">
          <Swords className="h-7 w-7 text-primary" /> Compétitions
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Choisis une notion, invite la communauté, et affronte les autres en direct.
        </p>

        {/* Création */}
        <div className="mt-6 rounded-2xl border border-border bg-surface p-4">
          <h2 className="flex items-center gap-2 text-base font-bold">
            <Sparkles className="h-4 w-4 text-primary" /> Lancer un défi
          </h2>
          <input
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            placeholder="La notion : ex. « Théorème de Thalès »"
            className="mt-3 w-full rounded-xl border border-border bg-surface-2 px-3 py-2.5 text-sm outline-none focus:border-primary"
          />
          <div className="mt-2 flex flex-wrap gap-1.5">
            {SUGGESTIONS.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setTopic(s)}
                className="rounded-full border border-border bg-surface-2 px-2.5 py-1 text-[11px] text-muted-foreground hover:border-primary hover:text-foreground"
              >
                {s}
              </button>
            ))}
          </div>

          <div className="mt-3 grid gap-2 sm:grid-cols-3">
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="rounded-xl border border-border bg-surface-2 px-3 py-2.5 text-sm outline-none focus:border-primary"
            >
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {categoryMeta(c).emoji} {c}
                </option>
              ))}
            </select>
            <select
              value={difficulty}
              onChange={(e) => setDifficulty(e.target.value)}
              className="rounded-xl border border-border bg-surface-2 px-3 py-2.5 text-sm outline-none focus:border-primary"
            >
              {DIFFICULTIES.map((d) => (
                <option key={d.value} value={d.value}>
                  {d.label}
                </option>
              ))}
            </select>
            <select
              value={questionCount}
              onChange={(e) => setQuestionCount(Number(e.target.value))}
              className="rounded-xl border border-border bg-surface-2 px-3 py-2.5 text-sm outline-none focus:border-primary"
            >
              {[3, 5, 8, 10].map((n) => (
                <option key={n} value={n}>
                  {n} questions
                </option>
              ))}
            </select>
          </div>

          <button
            type="button"
            onClick={() => void createCompetition()}
            disabled={creating}
            className="mt-3 w-full rounded-xl bg-gradient-brand py-2.5 text-sm font-bold text-background disabled:opacity-60"
          >
            {creating ? "Création…" : "Créer le défi"}
          </button>
          {!user && (
            <p className="mt-2 text-center text-xs text-muted-foreground">
              <Link to="/auth" className="text-primary">
                Connecte-toi
              </Link>{" "}
              pour créer ou rejoindre un défi.
            </p>
          )}
        </div>

        {/* Liste */}
        <h2 className="mt-8 text-base font-bold">Défis de la communauté</h2>
        {loading && <p className="mt-3 text-sm text-muted-foreground">Chargement…</p>}
        {!loading && items.length === 0 && (
          <p className="mt-3 text-sm text-muted-foreground">
            Aucun défi pour l'instant. Sois le premier !
          </p>
        )}

        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          {items.map((c) => {
            const meta = categoryMeta(c.category);
            return (
              <Link
                key={c.id}
                to="/competitions/$id"
                params={{ id: c.id }}
                className={`rounded-2xl border ${meta.border} bg-surface p-4 transition-colors hover:bg-surface-2`}
              >
                <div className="flex items-center justify-between">
                  <span
                    className={`rounded-full ${meta.bg} px-2 py-0.5 text-[11px] font-bold ${meta.text}`}
                  >
                    {meta.emoji} {c.category}
                  </span>
                  <span className="rounded-full border border-border px-2 py-0.5 text-[10px] font-bold uppercase text-muted-foreground">
                    {STATUS_LABEL[c.status] ?? c.status}
                  </span>
                </div>
                <p className="mt-2 line-clamp-2 font-bold">{c.topic}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  par {c.host_name ?? "un membre"}
                </p>
                <div className="mt-3 flex items-center gap-4 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <Users className="h-3.5 w-3.5" /> {counts[c.id] ?? 0}
                  </span>
                  <span className="flex items-center gap-1">
                    <Clock className="h-3.5 w-3.5" /> {c.question_count} questions
                  </span>
                </div>
              </Link>
            );
          })}
        </div>
      </div>
    </AppShell>
  );
}
