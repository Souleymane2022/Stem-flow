import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { Award, Check, ChevronLeft, PlayCircle } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useI18n } from "@/lib/i18n";
import { AppShell } from "@/components/layout/AppShell";
import { VideoPlayer, type YouTubePlayerLike } from "@/components/feed/VideoPlayer";
import { categoryMeta } from "@/lib/categories";

export const Route = createFileRoute("/courses/$id")({
  head: () => ({
    meta: [
      { title: "Cours — STEMFLOW" },
      {
        name: "description",
        content: "Suis ce cours vidéo de bout en bout et obtiens un certificat vérifiable.",
      },
    ],
  }),
  component: CoursePage,
});

type Course = {
  id: string;
  title: string;
  description: string | null;
  category: string;
  lesson_count: number;
  passing_ratio: number;
  xp_reward: number;
};
type Lesson = {
  id: string;
  video_id: string;
  title: string;
  duration_seconds: number;
  sort_order: number;
};
type ProgressRow = { lesson_id: string; completed: boolean; watched_seconds: number };

/** Intervalle d'envoi de la progression. Le serveur plafonne à 30 s par appel. */
const TICK_MS = 5000;
/** Au-delà, l'écart vient d'un saut dans la vidéo, pas d'un visionnage réel. */
const MAX_REAL_DELTA = 10;

function CoursePage() {
  const { id } = Route.useParams();
  const { session } = useAuth();
  const { t } = useI18n();
  const navigate = useNavigate();

  const [course, setCourse] = useState<Course | null>(null);
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [done, setDone] = useState<Set<string>>(new Set());
  const [current, setCurrent] = useState<Lesson | null>(null);
  const [percent, setPercent] = useState(0);
  const [serial, setSerial] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const player = useRef<YouTubePlayerLike | null>(null);
  const lastTime = useRef(0);

  useEffect(() => {
    let alive = true;
    void (async () => {
      const [{ data: c }, { data: l }] = await Promise.all([
        supabase
          .from("courses")
          .select("id,title,description,category,lesson_count,passing_ratio,xp_reward")
          .eq("id", id)
          .maybeSingle(),
        supabase
          .from("course_lessons")
          .select("id,video_id,title,duration_seconds,sort_order")
          .eq("course_id", id)
          .order("sort_order"),
      ]);
      if (!alive) return;
      setCourse((c as Course) ?? null);
      setLessons((l as Lesson[]) ?? []);
      setLoading(false);
    })();
    return () => {
      alive = false;
    };
  }, [id]);

  // Progression et certificat de l'utilisateur
  useEffect(() => {
    if (!session || lessons.length === 0) return;
    let alive = true;
    void (async () => {
      const [{ data: rows }, { data: enrollment }, { data: cert }] = await Promise.all([
        supabase
          .from("lesson_progress")
          .select("lesson_id,completed,watched_seconds")
          .in(
            "lesson_id",
            lessons.map((l) => l.id),
          ),
        supabase
          .from("course_enrollments")
          .select("progress_percent")
          .eq("course_id", id)
          .eq("user_id", session.user.id)
          .maybeSingle(),
        supabase
          .from("certificates")
          .select("serial")
          .eq("course_id", id)
          .eq("user_id", session.user.id)
          .maybeSingle(),
      ]);
      if (!alive) return;
      const completed = new Set(
        ((rows as ProgressRow[]) ?? []).filter((r) => r.completed).map((r) => r.lesson_id),
      );
      setDone(completed);
      setPercent(enrollment?.progress_percent ?? 0);
      setSerial(cert?.serial ?? null);
      // On reprend à la première leçon non validée.
      setCurrent((prev) => prev ?? lessons.find((l) => !completed.has(l.id)) ?? lessons[0] ?? null);
    })();
    return () => {
      alive = false;
    };
  }, [session, lessons, id]);

  useEffect(() => {
    if (!session && lessons.length > 0) setCurrent((prev) => prev ?? lessons[0] ?? null);
  }, [session, lessons]);

  const push = useCallback(
    async (lessonId: string, delta: number, position: number, duration: number) => {
      const { data, error } = await supabase.rpc("record_lesson_progress", {
        p_lesson_id: lessonId,
        p_watched_delta: Math.round(delta),
        p_position: Math.round(position),
        p_duration: Math.round(duration),
      });
      if (error) {
        console.error("[cours] progression non enregistrée", error);
        return;
      }
      const result = data as {
        lesson_completed: boolean;
        course_percent: number;
        certificate_serial: string | null;
      };
      setPercent(result.course_percent);
      if (result.lesson_completed) setDone((prev) => new Set(prev).add(lessonId));
      if (result.certificate_serial) setSerial(result.certificate_serial);
    },
    [],
  );

  // Mesure du temps réellement visionné : on ne crédite que l'avancée continue
  // de la tête de lecture, ce qui neutralise les sauts dans la barre.
  useEffect(() => {
    if (!session || !current) return;
    lastTime.current = 0;
    const timer = setInterval(() => {
      const p = player.current;
      if (!p?.getCurrentTime || !p.getDuration) return;
      const now = p.getCurrentTime();
      const duration = p.getDuration();
      if (!duration) return;
      const delta = now - lastTime.current;
      lastTime.current = now;
      const credited = delta > 0 && delta <= MAX_REAL_DELTA ? delta : 0;
      if (credited <= 0) return;
      void push(current.id, credited, now, duration);
    }, TICK_MS);
    return () => clearInterval(timer);
  }, [session, current, push]);

  if (loading) {
    return (
      <AppShell>
        <div className="p-8 text-sm text-muted-foreground">{t("common.loading")}</div>
      </AppShell>
    );
  }

  if (!course) {
    return (
      <AppShell>
        <div className="p-8">
          <p className="text-sm text-muted-foreground">{t("courses.notFound")}</p>
          <Link to="/courses" className="mt-3 inline-block text-sm text-primary">
            {t("courses.title")}
          </Link>
        </div>
      </AppShell>
    );
  }

  const meta = categoryMeta(course.category);
  const threshold = Math.round(course.passing_ratio * 100);

  return (
    <AppShell>
      <div className="mx-auto max-w-3xl px-4 py-6 md:px-8 md:py-10">
        <button
          type="button"
          onClick={() => void navigate({ to: "/courses" })}
          className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ChevronLeft className="h-4 w-4" /> {t("courses.title")}
        </button>

        <div
          className={`mt-4 rounded-2xl border ${meta.border} bg-gradient-to-br ${meta.gradient} p-5`}
        >
          <span
            className={`rounded-full ${meta.bg} px-2 py-0.5 text-[11px] font-bold ${meta.text}`}
          >
            {meta.emoji} {course.category}
          </span>
          <h1 className="mt-2 text-2xl font-black leading-tight">{course.title}</h1>
          <p className="mt-1 text-xs text-muted-foreground">
            {t("courses.lessons", { count: course.lesson_count })} · +{course.xp_reward} XP
          </p>
        </div>

        {current && (
          <div className="mt-5 overflow-hidden rounded-2xl border border-border bg-black">
            <div className="aspect-video w-full">
              <VideoPlayer
                videoId={current.video_id}
                onPlayerReady={(p) => {
                  player.current = p;
                  p.unMute?.();
                }}
                onPlayerDestroy={() => {
                  player.current = null;
                }}
              />
            </div>
          </div>
        )}

        {current && (
          <p className="mt-2 text-xs text-muted-foreground">
            {t("courses.watchToValidate", { percent: threshold })}
          </p>
        )}

        {!session && (
          <p className="mt-4 rounded-xl border border-border bg-surface-2 p-3 text-sm text-muted-foreground">
            <Link to="/auth" className="text-primary">
              {t("courses.signInPrompt")}
            </Link>
          </p>
        )}

        {session && (
          <section className="mt-6">
            <div className="flex items-center justify-between text-xs font-bold">
              <span>{t("courses.myProgress")}</span>
              <span className="text-muted-foreground">{t("courses.progress", { percent })}</span>
            </div>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-surface-2">
              <div
                className="h-full bg-gradient-brand transition-all duration-700"
                style={{ width: `${percent}%` }}
              />
            </div>
            {serial && (
              <Link
                to="/certificates/$serial"
                params={{ serial }}
                className="mt-3 flex items-center justify-center gap-2 rounded-xl bg-gradient-brand py-2.5 text-sm font-black text-background"
              >
                <Award className="h-4 w-4" /> {t("certificate.view")}
              </Link>
            )}
          </section>
        )}

        <ol className="mt-6 space-y-2">
          {lessons.map((lesson, index) => {
            const isDone = done.has(lesson.id);
            const isCurrent = current?.id === lesson.id;
            return (
              <li key={lesson.id}>
                <button
                  type="button"
                  onClick={() => setCurrent(lesson)}
                  className={`flex w-full items-center gap-3 rounded-xl border px-4 py-3 text-start transition-colors ${
                    isCurrent
                      ? "border-primary bg-primary/10"
                      : "border-border bg-surface-2 hover:border-primary/40"
                  }`}
                >
                  <span
                    className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-black ${
                      isDone
                        ? "bg-primary text-primary-foreground"
                        : "bg-background text-muted-foreground"
                    }`}
                  >
                    {isDone ? <Check className="h-4 w-4" /> : index + 1}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold">{lesson.title}</span>
                    {isDone && (
                      <span className="text-[11px] font-bold text-primary">
                        {t("courses.lessonDone")}
                      </span>
                    )}
                  </span>
                  {isCurrent && <PlayCircle className="h-4 w-4 shrink-0 text-primary" />}
                </button>
              </li>
            );
          })}
        </ol>
      </div>
    </AppShell>
  );
}
