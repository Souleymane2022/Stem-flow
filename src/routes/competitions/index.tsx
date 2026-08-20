import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { Swords, Users, Clock, Sparkles } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/layout/AppShell";
import { SkeletonList } from "@/components/common/Skeleton";
import { PageHeader } from "@/components/common/PageHeader";
import { useI18n, useLabels, type Key } from "@/lib/i18n";
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

/** Cours dans lequel l'utilisateur a déjà de la progression. */
type FollowedCourse = {
  course_id: string;
  progress_percent: number;
  completed_lessons: number;
  courses: { title: string; category: string; difficulty: string } | null;
};

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

const LEVELS = ["debutant", "intermediaire", "avance"] as const;

/** Exemples de notions, traduits : ils partent tels quels à l'IA. */
const SUGGESTION_KEYS: Key[] = [
  "competitions.suggestion.1",
  "competitions.suggestion.2",
  "competitions.suggestion.3",
  "competitions.suggestion.4",
  "competitions.suggestion.5",
  "competitions.suggestion.6",
];

/** Traduits au rendu : les dictionnaires ne sont pas lisibles hors composant. */
const STATUS_KEY: Record<string, Key> = {
  lobby: "competitions.status.open",
  running: "competitions.status.live",
  finished: "competitions.status.done",
};

function CompetitionsPage() {
  const { user, profile, loading: authLoading, refreshProfile, profileError } = useAuth();
  const { t } = useI18n();
  const { categoryLabel, difficultyLabel } = useLabels();
  const navigate = useNavigate();
  const [items, setItems] = useState<Competition[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);

  const [followed, setFollowed] = useState<FollowedCourse[]>([]);
  const [sourceCourseId, setSourceCourseId] = useState<string | null>(null);
  const [topic, setTopic] = useState("");
  const [category, setCategory] = useState<string>(CATEGORIES[0]);
  const [difficulty, setDifficulty] = useState("debutant");
  const [questionCount, setQuestionCount] = useState(5);
  const [mode, setMode] = useState<"solo" | "duel" | "open">("open");

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

  // Cours déjà entamés : ce sont les seuls dont l'IA peut tirer un défi ancré
  // dans ce que l'utilisateur a réellement regardé.
  useEffect(() => {
    if (!user) return;
    let alive = true;
    void (async () => {
      const { data } = await supabase
        .from("course_enrollments")
        .select("course_id,progress_percent,completed_lessons,courses(title,category,difficulty)")
        .eq("user_id", user.id)
        .order("progress_percent", { ascending: false });
      if (alive) setFollowed((data as unknown as FollowedCourse[]) ?? []);
    })();
    return () => {
      alive = false;
    };
  }, [user]);

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
    // Le message ne portait que sur la connexion, mais la garde testait aussi
    // `profile`. Un utilisateur connecté dont la fiche n'était pas encore
    // chargée se voyait donc demander de se connecter alors qu'il l'était.
    if (!user) {
      toast.error(t("competitions.create.signin"));
      return;
    }
    const clean = topic.trim();
    if (clean.length < 3) {
      toast.error(t("competitions.create.required"));
      return;
    }
    setCreating(true);

    // `competitions.host_id` référence `profiles(id)` : la fiche doit exister en
    // base, même si elle n'est pas encore dans l'état React. refreshProfile la
    // recharge et la recrée au besoin.
    const me = profile ?? (await refreshProfile());
    if (!me) {
      setCreating(false);
      toast.error(
        profileError
          ? `Profil indisponible — ${profileError}`
          : "Ton profil n'a pas pu être chargé. Réessaie dans un instant.",
      );
      return;
    }

    const { data, error } = await supabase
      .from("competitions")
      .insert({
        host_id: user.id,
        host_name: me.username,
        topic: clean,
        category,
        difficulty,
        question_count: questionCount,
        xp_reward: 60,
        source_course_id: sourceCourseId,
        mode,
      })
      .select("id")
      .single();
    if (error || !data) {
      setCreating(false);
      console.error("[competitions] création impossible", error);
      toast.error(`Impossible de créer le défi : ${error?.message ?? "réponse vide"}`);
      return;
    }
    const { error: joinError } = await supabase.from("competition_participants").insert({
      competition_id: data.id,
      user_id: user.id,
      username: me.username,
      avatar_url: me.profile_image_url,
    });
    if (joinError) console.error("[competitions] inscription de l'hôte impossible", joinError);
    setCreating(false);
    setTopic("");
    setSourceCourseId(null);
    void navigate({ to: "/competitions/$id", params: { id: data.id } });
  };

  return (
    <AppShell>
      <div className="mx-auto max-w-3xl px-4 py-6 md:px-8 md:py-10">
        <PageHeader
          icon={<Swords className="h-6 w-6 text-primary" />}
          title={t("nav.competitions")}
          subtitle={t("competitions.subtitle")}
        />
        {/* Création */}
        <div className="mt-6 rounded-2xl border border-border bg-surface p-4">
          <h2 className="flex items-center gap-2 text-base font-bold">
            <Sparkles className="h-4 w-4 text-primary" /> {t("competitions.create.heading")}
          </h2>
          {followed.length > 0 && (
            <div className="mt-3">
              <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                Depuis un cours que tu suis
              </p>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {followed.map((f) => {
                  const active = sourceCourseId === f.course_id;
                  return (
                    <button
                      key={f.course_id}
                      type="button"
                      onClick={() => {
                        if (active) {
                          setSourceCourseId(null);
                          return;
                        }
                        setSourceCourseId(f.course_id);
                        // Le sujet reste modifiable : il sert de titre au défi,
                        // tandis que les questions viennent des leçons.
                        if (f.courses) {
                          setTopic(f.courses.title);
                          setCategory(f.courses.category);
                          setDifficulty(f.courses.difficulty);
                        }
                      }}
                      className={`max-w-full truncate rounded-full border px-3 py-1.5 text-xs font-bold ${
                        active
                          ? "border-primary bg-primary/15 text-primary"
                          : "border-border bg-surface-2 text-muted-foreground hover:border-primary/40"
                      }`}
                    >
                      🎓 {f.courses?.title ?? "Cours"} · {f.progress_percent} %
                    </button>
                  );
                })}
              </div>
              {sourceCourseId && (
                <p className="mt-2 rounded-xl border border-primary/30 bg-primary/10 px-3 py-2 text-[11px] text-primary">
                  Les questions seront tirées des leçons de ce cours, en priorité celles que tu as
                  terminées.
                </p>
              )}
            </div>
          )}

          <input
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            placeholder={t("competitions.create.placeholder")}
            className="mt-3 w-full rounded-xl border border-border bg-surface-2 px-3 py-2.5 text-sm outline-none focus:border-primary"
          />
          <div className="mt-2 flex flex-wrap gap-1.5">
            {!sourceCourseId &&
              SUGGESTION_KEYS.map((key) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setTopic(t(key))}
                  className="rounded-full border border-border bg-surface-2 px-2.5 py-1 text-[11px] text-muted-foreground hover:border-primary hover:text-foreground"
                >
                  {t(key)}
                </button>
              ))}
          </div>

          {/* Le mode conditionne qui peut rejoindre : il est appliqué par les
              politiques RLS, pas seulement affiché. */}
          <div className="mt-3">
            <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
              {t("competitions.mode.label")}
            </p>
            <div className="mt-1.5 grid grid-cols-3 gap-1.5">
              {(
                [
                  {
                    value: "open",
                    label: `🚪 ${t("competitions.mode.open")}`,
                    hint: t("competitions.mode.open.hint"),
                  },
                  { value: "duel", label: "⚔️ Duel", hint: t("competitions.private.badge") },
                  {
                    value: "solo",
                    label: `🎯 ${t("competitions.mode.solo")}`,
                    hint: t("competitions.mode.solo.hint"),
                  },
                ] as const
              ).map((m) => (
                <button
                  key={m.value}
                  type="button"
                  onClick={() => setMode(m.value)}
                  className={`rounded-xl border px-2 py-2 text-xs font-bold ${
                    mode === m.value
                      ? "border-primary bg-primary/15 text-primary"
                      : "border-border bg-surface-2 text-muted-foreground"
                  }`}
                >
                  {m.label}
                </button>
              ))}
            </div>
            <p className="mt-1 text-[11px] text-muted-foreground">
              {mode === "open"
                ? t("competitions.mode.open.hint")
                : mode === "duel"
                  ? t("competitions.private.hint")
                  : t("competitions.mode.solo.hint")}
            </p>
          </div>

          <div className="mt-3 grid gap-2 sm:grid-cols-3">
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="rounded-xl border border-border bg-surface-2 px-3 py-2.5 text-sm outline-none focus:border-primary"
            >
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {categoryMeta(c).emoji} {categoryLabel(c)}
                </option>
              ))}
            </select>
            <select
              value={difficulty}
              onChange={(e) => setDifficulty(e.target.value)}
              className="rounded-xl border border-border bg-surface-2 px-3 py-2.5 text-sm outline-none focus:border-primary"
            >
              {LEVELS.map((level) => (
                <option key={level} value={level}>
                  {difficultyLabel(level)}
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
            disabled={creating || authLoading}
            className="mt-3 w-full rounded-xl bg-gradient-brand py-2.5 text-sm font-bold text-background disabled:opacity-60"
          >
            {creating ? t("competitions.create.busy") : t("competitions.create.submit")}
          </button>
          {!authLoading && !user && (
            <p className="mt-2 text-center text-xs text-muted-foreground">
              <Link to="/auth" className="text-primary">
                {t("competitions.create.signin")}
              </Link>
            </p>
          )}
        </div>

        {/* Liste */}
        <h2 className="mt-8 text-base font-bold">{t("competitions.list.title")}</h2>
        {loading && (
          <div className="mt-3">
            <SkeletonList rows={4} />
          </div>
        )}
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
                    {STATUS_KEY[c.status] ? t(STATUS_KEY[c.status]!) : c.status}
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
