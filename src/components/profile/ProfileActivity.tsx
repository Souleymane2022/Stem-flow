import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Award, BookOpen, Clock, HelpCircle, Medal, Video } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { CATEGORIES, CATEGORY_META, categoryMeta } from "@/lib/categories";
import { useI18n } from "@/lib/i18n";

/**
 * S·T·E·M : la lettre vient du domaine, pas de l'initiale du libellé français
 * — « Ingénierie » donnerait un I, et le sigle ne serait plus reconnaissable.
 */
const STEM_LETTER: Record<string, string> = {
  science: "S",
  tech: "T",
  engineering: "E",
  maths: "M",
};

type EnrolledCourse = {
  id: string;
  title: string;
  category: string;
  lessonCount: number;
  completedLessons: number;
  percent: number;
};

type Certificate = {
  serial: string;
  course_title: string;
  issued_at: string;
};

type History = {
  videos: number;
  seconds: number;
  quizzes: number;
  averageScore: number | null;
  badges: number;
};

/**
 * Ce qu'une personne fait sur STEMFLOW : ses centres d'intérêt S·T·E·M, les
 * cours qu'elle suit, ses certificats, et — sur son propre profil — son
 * historique de jeu.
 *
 * Les lectures suivent les politiques RLS : la progression d'autrui n'est
 * visible qu'avec son consentement (`share_progress`), et l'historique détaillé
 * (vidéos vues, quiz) reste strictement personnel. `own` ne fait donc que
 * refléter ce que la base autorise déjà, il n'ouvre aucun accès.
 */
export function ProfileActivity({
  userId,
  own,
  interests,
  canSeeProgress = true,
}: {
  userId: string;
  own: boolean;
  interests: string[] | null;
  canSeeProgress?: boolean;
}) {
  const { t, locale } = useI18n();
  const [courses, setCourses] = useState<EnrolledCourse[]>([]);
  const [certificates, setCertificates] = useState<Certificate[]>([]);
  const [history, setHistory] = useState<History | null>(null);

  useEffect(() => {
    let alive = true;
    void (async () => {
      const [{ data: enrollments }, { data: certs }] = await Promise.all([
        supabase
          .from("course_enrollments")
          .select("course_id,progress_percent,completed_lessons")
          .eq("user_id", userId),
        supabase
          .from("certificates")
          .select("serial,course_title,issued_at")
          .eq("user_id", userId)
          .order("issued_at", { ascending: false }),
      ]);
      if (!alive) return;
      setCertificates((certs as Certificate[]) ?? []);

      const rows = enrollments ?? [];
      if (rows.length > 0) {
        // Deux requêtes plutôt qu'une jointure imbriquée : le cache de schéma
        // de PostgREST doit connaître la relation pour l'imbrication, et il a
        // déjà fait défaut après une migration.
        const { data: found } = await supabase
          .from("courses")
          .select("id,title,category,lesson_count")
          .in(
            "id",
            rows.map((r) => r.course_id),
          );
        if (!alive) return;
        const byId = new Map((found ?? []).map((c) => [c.id, c]));
        setCourses(
          rows
            .map((r) => {
              const course = byId.get(r.course_id);
              if (!course) return null;
              return {
                id: course.id,
                title: course.title,
                category: course.category,
                lessonCount: course.lesson_count,
                completedLessons: r.completed_lessons,
                percent: r.progress_percent,
              };
            })
            .filter((c): c is EnrolledCourse => c !== null)
            .sort((a, b) => b.percent - a.percent),
        );
      } else {
        setCourses([]);
      }

      if (!own) return;
      const [{ data: watched }, { data: attempts }, { count: badgeCount }, { data: lessons }] =
        await Promise.all([
          supabase.from("video_engagements").select("watch_time_seconds").eq("user_id", userId),
          supabase.from("quiz_attempts").select("score,total_questions").eq("user_id", userId),
          supabase
            .from("user_badges")
            .select("badge_id", { count: "exact", head: true })
            .eq("user_id", userId),
          supabase.from("lesson_progress").select("watched_seconds").eq("user_id", userId),
        ]);
      if (!alive) return;

      const scored = (attempts ?? []).filter(
        (a) => a.score !== null && a.total_questions !== null && a.total_questions > 0,
      );
      const ratio =
        scored.length > 0
          ? scored.reduce((sum, a) => sum + (a.score ?? 0) / (a.total_questions ?? 1), 0) /
            scored.length
          : null;

      setHistory({
        videos: (watched ?? []).length,
        seconds:
          (watched ?? []).reduce((sum, v) => sum + (v.watch_time_seconds ?? 0), 0) +
          (lessons ?? []).reduce((sum, l) => sum + (l.watched_seconds ?? 0), 0),
        quizzes: (attempts ?? []).length,
        averageScore: ratio === null ? null : Math.round(ratio * 100),
        badges: badgeCount ?? 0,
      });
    })();
    return () => {
      alive = false;
    };
  }, [userId, own]);

  const chosen = new Set((interests ?? []).map((i) => i.toLowerCase()));

  return (
    <>
      <Block title={t("activity.passions")}>
        {chosen.size === 0 ? (
          <p className="text-sm text-muted-foreground">{t("activity.passions.empty")}</p>
        ) : (
          <div className="grid grid-cols-4 gap-2 sm:gap-3">
            {CATEGORIES.map((category) => {
              const meta = CATEGORY_META[category];
              const active = chosen.has(category.toLowerCase());
              return (
                <div
                  key={category}
                  title={category}
                  className={`flex flex-col items-center gap-1 rounded-2xl border p-3 text-center transition-opacity ${
                    active
                      ? `${meta.bg} ${meta.border} ${meta.text}`
                      : "border-border bg-surface-2 text-muted-foreground opacity-40"
                  }`}
                >
                  <span className="text-2xl font-black leading-none">
                    {STEM_LETTER[meta.token] ?? category.charAt(0)}
                  </span>
                  <span className="text-[10px] font-bold leading-tight">
                    {meta.emoji} {category}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </Block>

      <Block title={t("activity.courses")} icon={<BookOpen className="h-4 w-4" />}>
        {courses.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {canSeeProgress ? t("activity.courses.empty") : t("activity.private")}
          </p>
        ) : (
          <div className="space-y-2">
            {courses.map((course) => {
              const meta = categoryMeta(course.category);
              return (
                <Link
                  key={course.id}
                  to="/courses/$id"
                  params={{ id: course.id }}
                  className="block rounded-2xl border border-border bg-surface-2 p-4 hover:border-primary/40"
                >
                  <div className="flex items-center gap-2">
                    <span className="text-lg">{meta.emoji}</span>
                    <span className="min-w-0 flex-1 truncate text-sm font-bold">
                      {course.title}
                    </span>
                    <span className="text-[11px] font-bold text-primary tabular">
                      {course.percent}%
                    </span>
                  </div>
                  <div className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-background">
                    <div
                      className="h-full bg-gradient-brand"
                      style={{ width: `${Math.min(100, Math.max(0, course.percent))}%` }}
                    />
                  </div>
                  <p className="mt-1.5 text-[11px] text-muted-foreground">
                    {t("activity.lessonsDone", {
                      count: course.completedLessons,
                      total: course.lessonCount,
                    })}
                  </p>
                </Link>
              );
            })}
          </div>
        )}
      </Block>

      <Block title={t("activity.certificates")} icon={<Award className="h-4 w-4" />}>
        {certificates.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("activity.certificates.empty")}</p>
        ) : (
          <div className="space-y-2">
            {certificates.map((certificate) => (
              <Link
                key={certificate.serial}
                to="/certificates/$serial"
                params={{ serial: certificate.serial }}
                className="flex items-center gap-3 rounded-2xl border border-primary/40 bg-primary/10 p-3.5 hover:border-primary"
              >
                <Medal className="h-5 w-5 shrink-0 text-primary" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-bold">
                    {certificate.course_title}
                  </span>
                  <span className="block text-[11px] text-muted-foreground">
                    {t("activity.certificate.issued", {
                      date: new Date(certificate.issued_at).toLocaleDateString(locale),
                    })}
                  </span>
                </span>
              </Link>
            ))}
          </div>
        )}
      </Block>

      {own && history && (
        <Block title={t("activity.history")} icon={<Clock className="h-4 w-4" />}>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            <Stat
              icon={<Video className="h-4 w-4" />}
              label={t("activity.videosWatched")}
              value={String(history.videos)}
            />
            <Stat
              icon={<Clock className="h-4 w-4" />}
              label={t("activity.watchTime")}
              value={formatDuration(history.seconds)}
            />
            <Stat
              icon={<HelpCircle className="h-4 w-4" />}
              label={t("activity.quizzes")}
              value={String(history.quizzes)}
            />
            {history.averageScore !== null && (
              <Stat
                icon={<Award className="h-4 w-4" />}
                label={t("activity.avgScore")}
                value={`${history.averageScore}%`}
              />
            )}
            <Stat
              icon={<Medal className="h-4 w-4" />}
              label={t("activity.badgesEarned")}
              value={String(history.badges)}
            />
          </div>
        </Block>
      )}
    </>
  );
}

/** `1 h 05` plutôt que `3900 s` : la durée cumulée doit rester lisible. */
function formatDuration(seconds: number) {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (hours === 0) return `${minutes} min`;
  return `${hours} h ${String(minutes).padStart(2, "0")}`;
}

function Stat({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-border bg-surface-2 p-4">
      <span className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
        {icon}
        {label}
      </span>
      <p className="mt-1.5 text-xl font-black tabular">{value}</p>
    </div>
  );
}

function Block({
  title,
  icon,
  children,
}: {
  title: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-8">
      <h2 className="mb-3 flex items-center gap-2 text-sm font-black uppercase tracking-wider text-muted-foreground">
        {icon}
        {title}
      </h2>
      {children}
    </section>
  );
}
