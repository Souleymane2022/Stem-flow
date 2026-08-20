import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { Award, Check, ChevronLeft, PlayCircle, Radio, Swords, Users } from "lucide-react";
import { toast } from "sonner";

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
  created_by: string | null;
};
type Lesson = {
  id: string;
  video_id: string;
  title: string;
  duration_seconds: number;
  sort_order: number;
};
type ProgressRow = { lesson_id: string; completed: boolean; watched_seconds: number };
/** Autre apprenant du cours, tel que les politiques RLS le laissent voir. */
type Peer = {
  user_id: string;
  progress_percent: number;
  completed_lessons: number;
  profiles: { username: string } | null;
};

/** Intervalle d'envoi de la progression. Le serveur plafonne à 30 s par appel. */
const TICK_MS = 5000;
/** Au-delà, l'écart vient d'un saut dans la vidéo, pas d'un visionnage réel. */
const MAX_REAL_DELTA = 10;

function CoursePage() {
  const { id } = Route.useParams();
  const { session, profile } = useAuth();
  const { t } = useI18n();
  const navigate = useNavigate();

  const [course, setCourse] = useState<Course | null>(null);
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [done, setDone] = useState<Set<string>>(new Set());
  const [current, setCurrent] = useState<Lesson | null>(null);
  const [percent, setPercent] = useState(0);
  const [serial, setSerial] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [peers, setPeers] = useState<Peer[]>([]);
  const [visibility, setVisibility] = useState<"public" | "private">("public");
  const [duelling, setDuelling] = useState<string | null>(null);
  /** Leçons déjà visibles dans le fil. */
  const [inFeed, setInFeed] = useState<Set<string>>(new Set());
  const [switching, setSwitching] = useState<string | null>(null);

  const player = useRef<YouTubePlayerLike | null>(null);
  const lastTime = useRef(0);

  useEffect(() => {
    let alive = true;
    void (async () => {
      const [{ data: c }, { data: l }, { data: feedRows }] = await Promise.all([
        supabase
          .from("courses")
          .select("id,title,description,category,lesson_count,passing_ratio,xp_reward,created_by")
          .eq("id", id)
          .maybeSingle(),
        supabase
          .from("course_lessons")
          .select("id,video_id,title,duration_seconds,sort_order")
          .eq("course_id", id)
          .order("sort_order"),
        supabase.from("contents").select("source_lesson_id").eq("source_course_id", id),
      ]);
      if (!alive) return;
      setCourse((c as Course) ?? null);
      setLessons((l as Lesson[]) ?? []);
      setInFeed(
        new Set(
          (feedRows ?? [])
            .map((r) => r.source_lesson_id)
            .filter((v): v is string => typeof v === "string"),
        ),
      );
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

  // Les autres apprenants du cours. La politique RLS ne renvoie que ceux qui
  // ont accepté de partager leur progression : aucun filtrage à faire ici.
  const loadPeers = useCallback(async () => {
    const { data, error } = await supabase
      .from("course_enrollments")
      .select("user_id,progress_percent,completed_lessons,profiles(username)")
      .eq("course_id", id)
      .order("progress_percent", { ascending: false })
      .limit(50);
    if (error) {
      console.error("[cours] apprenants illisibles", error);
      return;
    }
    setPeers((data as unknown as Peer[]) ?? []);
  }, [id]);

  useEffect(() => {
    if (session) void loadPeers();
  }, [session, loadPeers]);

  const challenge = useCallback(
    async (opponentId: string) => {
      setDuelling(opponentId);
      const { data, error } = await supabase.rpc("create_course_duel", {
        p_course_id: id,
        p_opponent_id: opponentId,
        p_visibility: visibility,
        p_question_count: 5,
      });
      setDuelling(null);
      if (error || !data) {
        console.error("[cours] duel impossible", error);
        toast.error(t("peers.duelFailed", { message: error?.message ?? "réponse vide" }));
        return;
      }
      toast.success(t("peers.duelCreated"));
      void navigate({ to: "/competitions/$id", params: { id: data as string } });
    },
    [id, visibility, navigate, t],
  );

  /**
   * Met une leçon dans le fil, ou l'en retire. L'insertion passe par une
   * fonction SECURITY DEFINER : la politique `contents_insert_own` laisserait
   * sinon n'importe qui publier une leçon sous un titre et une catégorie
   * choisis, alors que le fil doit refléter la playlist telle quelle.
   */
  const toggleFeed = useCallback(
    async (lessonId: string, next: boolean) => {
      setSwitching(lessonId);
      const { error } = await supabase.rpc("set_lesson_in_feed", {
        p_lesson_id: lessonId,
        p_in_feed: next,
      });
      setSwitching(null);
      if (error) {
        console.error("[cours] publication impossible", error);
        toast.error(t("courses.feed.failed", { message: error.message }));
        return;
      }
      setInFeed((prev) => {
        const copy = new Set(prev);
        if (next) copy.add(lessonId);
        else copy.delete(lessonId);
        return copy;
      });
      toast.success(next ? t("courses.feed.added") : t("courses.feed.removed"));
    },
    [t],
  );

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
  // Les cours livrés avec l'application n'ont pas d'auteur : sans cette
  // ouverture, leur catalogue ne pourrait jamais rejoindre le fil.
  const canPublish = Boolean(
    session && (!course.created_by || course.created_by === session.user.id),
  );

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

        {session && (
          <section className="mt-8">
            <h2 className="flex items-center gap-2 text-base font-bold">
              <Users className="h-4 w-4 text-primary" /> {t("peers.title")}
            </h2>

            {/* Le choix s'applique au prochain défi lancé. */}
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                {t("peers.visibility")}
              </span>
              {(["public", "private"] as const).map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setVisibility(v)}
                  className={`rounded-full border px-3 py-1 text-xs font-bold ${
                    visibility === v
                      ? "border-primary bg-primary/15 text-primary"
                      : "border-border bg-surface-2 text-muted-foreground"
                  }`}
                >
                  {v === "public" ? t("peers.public") : t("peers.private")}
                </button>
              ))}
            </div>
            <p className="mt-1 text-[11px] text-muted-foreground">
              {visibility === "public" ? t("peers.publicHint") : t("peers.privateHint")}
            </p>

            {peers.length <= 1 && (
              <p className="mt-3 text-sm text-muted-foreground">{t("peers.empty")}</p>
            )}

            <ul className="mt-3 space-y-2">
              {peers.map((p) => {
                const isMe = p.user_id === session.user.id;
                return (
                  <li
                    key={p.user_id}
                    className="flex items-center gap-3 rounded-xl border border-border bg-surface-2 px-3 py-2.5"
                  >
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-brand text-xs font-black text-primary-foreground">
                      {(p.profiles?.username ?? "?").charAt(0).toUpperCase()}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold">
                        @{p.profiles?.username ?? "membre"}
                        {isMe && ` (${t("peers.you")})`}
                      </span>
                      <span className="mt-1 block h-1.5 overflow-hidden rounded-full bg-background">
                        <span
                          className="block h-full bg-gradient-brand"
                          style={{ width: `${p.progress_percent}%` }}
                        />
                      </span>
                    </span>
                    <span className="shrink-0 text-xs font-bold tabular text-muted-foreground">
                      {p.progress_percent} %
                    </span>
                    {!isMe && (
                      <button
                        type="button"
                        onClick={() => void challenge(p.user_id)}
                        disabled={duelling !== null}
                        className="flex shrink-0 items-center gap-1 rounded-full bg-gradient-brand px-3 py-1.5 text-xs font-black text-background disabled:opacity-50"
                      >
                        <Swords className="h-3.5 w-3.5" />
                        {t("peers.challenge")}
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>

            {profile && !profile.share_progress && (
              <p className="mt-3 rounded-xl border border-border bg-surface-2 px-3 py-2 text-[11px] text-muted-foreground">
                {t("peers.hidden")}
              </p>
            )}
          </section>
        )}

        {canPublish && (
          <p className="mt-8 rounded-xl border border-border bg-surface-2 px-3 py-2 text-[11px] text-muted-foreground">
            {t("courses.feed.hint")}
          </p>
        )}

        <ol className="mt-3 space-y-2">
          {lessons.map((lesson, index) => {
            const isDone = done.has(lesson.id);
            const isCurrent = current?.id === lesson.id;
            const shown = inFeed.has(lesson.id);
            return (
              <li
                key={lesson.id}
                className={`flex items-center gap-2 rounded-xl border pe-2 transition-colors ${
                  isCurrent
                    ? "border-primary bg-primary/10"
                    : "border-border bg-surface-2 hover:border-primary/40"
                }`}
              >
                {/* Le bouton de publication ne peut pas être imbriqué dans
                    celui de la leçon : la rangée porte donc les deux côte à côte. */}
                <button
                  type="button"
                  onClick={() => setCurrent(lesson)}
                  className="flex min-w-0 flex-1 items-center gap-3 px-4 py-3 text-start"
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
                    <span className="flex flex-wrap items-center gap-2">
                      {isDone && (
                        <span className="text-[11px] font-bold text-primary">
                          {t("courses.lessonDone")}
                        </span>
                      )}
                      {shown && (
                        <span className="text-[11px] font-bold text-tech">
                          {t("courses.feed.badge")}
                        </span>
                      )}
                    </span>
                  </span>
                  {isCurrent && <PlayCircle className="h-4 w-4 shrink-0 text-primary" />}
                </button>

                {canPublish && (
                  <button
                    type="button"
                    onClick={() => void toggleFeed(lesson.id, !shown)}
                    disabled={switching === lesson.id}
                    title={shown ? t("courses.feed.remove") : t("courses.feed.add")}
                    aria-label={shown ? t("courses.feed.remove") : t("courses.feed.add")}
                    aria-pressed={shown}
                    className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full border transition-colors disabled:opacity-50 ${
                      shown
                        ? "border-tech/50 bg-tech/15 text-tech"
                        : "border-border bg-background text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    <Radio className="h-4 w-4" />
                  </button>
                )}
              </li>
            );
          })}
        </ol>
      </div>
    </AppShell>
  );
}
