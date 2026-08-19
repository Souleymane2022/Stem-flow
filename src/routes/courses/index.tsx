import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { GraduationCap, Import, Loader2, PlayCircle } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useI18n } from "@/lib/i18n";
import { AppShell } from "@/components/layout/AppShell";
import { CATEGORIES, categoryMeta, difficultyLabel } from "@/lib/categories";
import { importYoutubePlaylist } from "@/lib/courses.functions";

export const Route = createFileRoute("/courses/")({
  head: () => ({
    meta: [
      { title: "Cours certifiants — STEMFLOW" },
      {
        name: "description",
        content:
          "Suis des playlists STEM de bout en bout et obtiens un certificat vérifiable à la fin du parcours.",
      },
      { property: "og:title", content: "Cours certifiants — STEMFLOW" },
      { property: "og:description", content: "Apprends en playlist, repars avec un certificat." },
    ],
  }),
  component: CoursesPage,
});

type Course = {
  id: string;
  title: string;
  description: string | null;
  category: string;
  difficulty: string;
  thumbnail_url: string | null;
  lesson_count: number;
  xp_reward: number;
};

function CoursesPage() {
  const { session } = useAuth();
  const { t } = useI18n();
  const runImport = useServerFn(importYoutubePlaylist);

  const [courses, setCourses] = useState<Course[]>([]);
  const [progress, setProgress] = useState<Record<string, number>>({});
  const [certificates, setCertificates] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [url, setUrl] = useState("");
  const [category, setCategory] = useState<string>(CATEGORIES[0]);
  const [difficulty, setDifficulty] = useState("debutant");
  const [importing, setImporting] = useState(false);

  const load = useCallback(async () => {
    const { data, error } = await supabase
      .from("courses")
      .select("id,title,description,category,difficulty,thumbnail_url,lesson_count,xp_reward")
      .eq("published", true)
      .order("created_at", { ascending: false });
    // Sans ce report, une table absente ou un refus de privilèges s'affichait
    // comme « aucun cours », ce qui envoie chercher le problème au mauvais endroit.
    if (error) {
      console.error("[cours] chargement impossible", error);
      setLoadError(error.message);
    } else {
      setLoadError(null);
      setCourses((data as Course[]) ?? []);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!session) return;
    let alive = true;
    void (async () => {
      const [{ data: enrollments }, { data: certs }] = await Promise.all([
        supabase
          .from("course_enrollments")
          .select("course_id,progress_percent")
          .eq("user_id", session.user.id),
        supabase.from("certificates").select("course_id,serial").eq("user_id", session.user.id),
      ]);
      if (!alive) return;
      setProgress(
        Object.fromEntries((enrollments ?? []).map((e) => [e.course_id, e.progress_percent])),
      );
      setCertificates(Object.fromEntries((certs ?? []).map((c) => [c.course_id, c.serial])));
    })();
    return () => {
      alive = false;
    };
  }, [session]);

  const submitImport = async () => {
    if (!url.trim()) return;
    setImporting(true);
    try {
      const result = await runImport({ data: { playlistUrl: url, category, difficulty } });
      toast.success(
        result.alreadyExisted
          ? t("courses.import.exists")
          : t("courses.import.done", { count: result.imported }),
      );
      setUrl("");
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Import impossible");
    } finally {
      setImporting(false);
    }
  };

  return (
    <AppShell>
      <div className="mx-auto max-w-3xl px-4 py-6 md:px-8 md:py-10">
        <h1 className="flex items-center gap-2 text-3xl">
          <GraduationCap className="h-7 w-7 text-primary" /> {t("courses.title")}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">{t("courses.subtitle")}</p>

        {session && (
          <div className="mt-6 rounded-2xl border border-border bg-surface p-4">
            <h2 className="flex items-center gap-2 text-base font-bold">
              <Import className="h-4 w-4 text-primary" /> {t("courses.import.title")}
            </h2>
            <input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder={t("courses.import.placeholder")}
              className="mt-3 w-full rounded-xl border border-border bg-surface-2 px-3 py-2.5 text-sm outline-none focus:border-primary"
            />
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
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
                {["debutant", "intermediaire", "avance"].map((d) => (
                  <option key={d} value={d}>
                    {difficultyLabel(d)}
                  </option>
                ))}
              </select>
            </div>
            <button
              type="button"
              onClick={() => void submitImport()}
              disabled={importing || !url.trim()}
              className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-brand py-2.5 text-sm font-bold text-background disabled:opacity-60"
            >
              {importing && <Loader2 className="h-4 w-4 animate-spin" />}
              {importing ? t("courses.import.busy") : t("courses.import.submit")}
            </button>
          </div>
        )}

        {loading && <p className="mt-6 text-sm text-muted-foreground">{t("courses.loading")}</p>}
        {!loading && loadError && (
          <p className="mt-6 rounded-xl border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
            {loadError}
          </p>
        )}
        {!loading && !loadError && courses.length === 0 && (
          <p className="mt-6 text-sm text-muted-foreground">{t("courses.empty")}</p>
        )}

        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          {courses.map((course) => {
            const meta = categoryMeta(course.category);
            const percent = progress[course.id] ?? 0;
            const serial = certificates[course.id];
            return (
              <Link
                key={course.id}
                to="/courses/$id"
                params={{ id: course.id }}
                className={`overflow-hidden rounded-2xl border ${meta.border} bg-surface transition-colors hover:bg-surface-2`}
              >
                {course.thumbnail_url && (
                  <img
                    src={course.thumbnail_url}
                    alt=""
                    loading="lazy"
                    className="h-32 w-full object-cover"
                  />
                )}
                <div className="p-4">
                  <span
                    className={`rounded-full ${meta.bg} px-2 py-0.5 text-[11px] font-bold ${meta.text}`}
                  >
                    {meta.emoji} {course.category}
                  </span>
                  <p className="mt-2 line-clamp-2 font-bold">{course.title}</p>
                  <div className="mt-2 flex items-center gap-3 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <PlayCircle className="h-3.5 w-3.5" />
                      {t("courses.lessons", { count: course.lesson_count })}
                    </span>
                    <span>{difficultyLabel(course.difficulty)}</span>
                    <span className="text-primary">+{course.xp_reward} XP</span>
                  </div>

                  {session && (
                    <>
                      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-surface-2">
                        <div
                          className="h-full bg-gradient-brand transition-all duration-500"
                          style={{ width: `${percent}%` }}
                        />
                      </div>
                      <p className="mt-1.5 text-[11px] font-bold text-muted-foreground">
                        {serial ? t("certificate.earned") : t("courses.progress", { percent })}
                      </p>
                    </>
                  )}
                </div>
              </Link>
            );
          })}
        </div>
      </div>
    </AppShell>
  );
}
