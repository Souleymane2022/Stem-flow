import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useI18n } from "@/lib/i18n";
import { useXpPopup } from "@/components/gamification/XpPopup";
import { AppShell } from "@/components/layout/AppShell";
import { FeedCard, type ContentRow } from "@/components/feed/FeedCard";
import { CommentsSheet } from "@/components/feed/CommentsSheet";
import { QuizModal } from "@/components/feed/QuizModal";
import { ArticleSheet } from "@/components/feed/ArticleSheet";
import type { YouTubePlayerLike } from "@/components/feed/VideoPlayer";
import { CATEGORIES } from "@/lib/categories";
import { XP_REWARDS } from "@/lib/xp";

export const Route = createFileRoute("/feed")({
  head: () => ({
    meta: [
      { title: "Le fil STEM — STEMFLOW" },
      {
        name: "description",
        content:
          "Scrolle un fil vertical de vidéos, d'articles et de quiz en sciences, technologie, ingénierie et maths.",
      },
      { property: "og:title", content: "Le fil STEM — STEMFLOW" },
      {
        property: "og:description",
        content: "Vidéos, articles et quiz STEM en français, un scroll à la fois.",
      },
    ],
  }),
  component: FeedPage,
});

/**
 * Nombre de slides de part et d'autre de la position courante dont l'iframe
 * YouTube reste montée. Le voisin est préchargé pour que le scroll suivant
 * démarre sans latence ; au-delà, seule la vignette est rendue.
 */
const PLAYER_WINDOW = 1;
/** Envoi de la progression d'une leçon regardée depuis le fil. */
const PROGRESS_TICK_MS = 5000;
/** Au-delà, l'écart vient d'un saut dans la vidéo, pas d'un visionnage réel. */
const MAX_REAL_DELTA = 10;

/** Sentinelle du filtre « tous contenus », distincte des noms de catégorie. */
const FOR_YOU = "__for_you__";

function FeedPage() {
  const navigate = useNavigate();
  const { session, profile, loading, awardXp } = useAuth();
  const pushXp = useXpPopup();
  const { t } = useI18n();

  const [items, setItems] = useState<ContentRow[]>([]);
  const [questionCounts, setQuestionCounts] = useState<Record<string, number>>({});
  const [likes, setLikes] = useState<Set<string>>(new Set());
  const [saves, setSaves] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState<string>(FOR_YOU);
  const [active, setActive] = useState(0);
  const [fetching, setFetching] = useState(true);
  const [commentsFor, setCommentsFor] = useState<string | null>(null);
  const [quizFor, setQuizFor] = useState<string | null>(null);
  const [articleFor, setArticleFor] = useState<ContentRow | null>(null);
  const [muted, setMuted] = useState(true);

  const players = useRef<Map<string, YouTubePlayerLike>>(new Map());
  const mutedRef = useRef(true);
  const activeIdRef = useRef<string | null>(null);
  const rewarded = useRef<Set<string>>(new Set());
  const containerRef = useRef<HTMLDivElement>(null);
  /** Dernière position connue par leçon, pour ne créditer que l'avancée réelle. */
  const lessonTimes = useRef<Map<string, number>>(new Map());

  useEffect(() => {
    if (loading) return;
    if (!session) navigate({ to: "/auth" });
    else if (profile && !profile.onboarding_completed) navigate({ to: "/onboarding" });
  }, [session, profile, loading, navigate]);

  // Fetch contents
  useEffect(() => {
    let alive = true;
    setFetching(true);
    const run = async () => {
      // Le cours d'origine est imbriqué : la carte affiche « Cours · … » sans
      // une requête de plus par vidéo.
      const build = (withCourse: boolean) => {
        const q = supabase
          .from("contents")
          .select(withCourse ? "*, course:courses!contents_source_course_id_fkey (id, title)" : "*")
          .order("created_at", { ascending: false })
          .limit(40);
        return filter !== FOR_YOU ? q.eq("category", filter) : q;
      };

      const first = await build(true);
      let data = first.data;
      // Tant que la migration `lessons_in_feed` n'est pas appliquée, la colonne
      // n'existe pas et PostgREST rejette toute la requête. Le fil ne doit pas
      // se vider pour autant : on retombe sur la sélection simple.
      if (first.error) {
        console.error("[fil] lecture enrichie impossible, repli", first.error);
        data = (await build(false)).data;
      }
      if (!alive) return;
      let rows = (data as unknown as ContentRow[]) ?? [];

      if (filter === FOR_YOU && profile?.interests?.length) {
        const liked = new Set(profile.interests);
        rows = [...rows].sort(
          (a, b) => Number(liked.has(b.category)) - Number(liked.has(a.category)),
        );
      }
      setItems(rows);
      setFetching(false);

      const quizIds = rows.filter((r) => r.content_type === "quiz").map((r) => r.id);
      if (quizIds.length) {
        const { data: qs } = await supabase
          .from("quiz_questions")
          .select("content_id")
          .in("content_id", quizIds);
        if (!alive) return;
        const counts: Record<string, number> = {};
        (qs ?? []).forEach((q) => {
          if (!q.content_id) return;
          counts[q.content_id] = (counts[q.content_id] ?? 0) + 1;
        });
        setQuestionCounts(counts);
      }
    };
    void run();
    return () => {
      alive = false;
    };
  }, [filter, profile?.interests]);

  // Fetch user interactions
  useEffect(() => {
    if (!session) return;
    let alive = true;
    void (async () => {
      const [{ data: l }, { data: s }] = await Promise.all([
        supabase.from("content_likes").select("content_id").eq("user_id", session.user.id),
        supabase.from("content_saves").select("content_id").eq("user_id", session.user.id),
      ]);
      if (!alive) return;
      setLikes(new Set((l ?? []).map((r) => r.content_id)));
      setSaves(new Set((s ?? []).map((r) => r.content_id)));
    })();
    return () => {
      alive = false;
    };
  }, [session]);

  // Une vidéo du fil issue d'un cours crédite la progression de ce cours.
  // Sans cela, la même leçon serait à revoir dans l'onglet Cours pour compter,
  // et le certificat resterait hors de portée de qui apprend dans le fil.
  useEffect(() => {
    if (!session) return;
    const timer = setInterval(() => {
      const id = activeIdRef.current;
      if (!id) return;
      const item = items.find((i) => i.id === id);
      const lessonId = item?.source_lesson_id;
      if (!lessonId) return;
      const player = players.current.get(id);
      if (!player?.getCurrentTime || !player.getDuration) return;
      const position = player.getCurrentTime();
      const duration = player.getDuration();
      if (!duration) return;

      const previous = lessonTimes.current.get(lessonId) ?? position;
      lessonTimes.current.set(lessonId, position);
      const delta = position - previous;
      // Un écart plus large vient d'un saut dans la barre, pas d'un visionnage.
      if (delta <= 0 || delta > MAX_REAL_DELTA) return;

      void supabase
        .rpc("record_lesson_progress", {
          p_lesson_id: lessonId,
          p_watched_delta: Math.round(delta),
          p_position: Math.round(position),
          p_duration: Math.round(duration),
        })
        .then(({ data, error }) => {
          if (error) {
            console.error("[fil] progression du cours non enregistrée", error);
            return;
          }
          const result = data as { certificate_serial: string | null } | null;
          if (result?.certificate_serial) toast.success(t("certificate.earned"));
        });
    }, PROGRESS_TICK_MS);
    return () => clearInterval(timer);
  }, [session, items, t]);

  // Autoplay via IntersectionObserver
  useEffect(() => {
    const root = containerRef.current;
    if (!root || items.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          const id = (entry.target as HTMLElement).dataset["contentId"];
          if (!id) return;
          const player = players.current.get(id);
          if (entry.isIntersecting && entry.intersectionRatio > 0.6) {
            const index = items.findIndex((i) => i.id === id);
            if (index >= 0) setActive(index);
            activeIdRef.current = id;
            if (mutedRef.current) player?.mute?.();
            else player?.unMute?.();
            player?.playVideo?.();
            if (!rewarded.current.has(id)) {
              rewarded.current.add(id);
              const item = items.find((i) => i.id === id);
              if (item?.content_type === "video") {
                void awardXp(XP_REWARDS.watchVideo);
                pushXp(XP_REWARDS.watchVideo);
              }
            }
          } else {
            player?.mute?.();
            player?.pauseVideo?.();
          }
        });
      },
      { root, threshold: [0, 0.6, 1] },
    );

    root.querySelectorAll("[data-content-id]").forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [items, awardXp, pushXp]);

  const toggleMute = useCallback(() => {
    setMuted((prev) => {
      const next = !prev;
      mutedRef.current = next;
      players.current.forEach((player, id) => {
        if (id === activeIdRef.current && !next) player.unMute?.();
        else player.mute?.();
      });
      return next;
    });
  }, []);

  const toggleLike = useCallback(
    async (content: ContentRow) => {
      if (!session) return;
      const isLiked = likes.has(content.id);
      setLikes((prev) => {
        const next = new Set(prev);
        if (isLiked) next.delete(content.id);
        else next.add(content.id);
        return next;
      });
      setItems((prev) =>
        prev.map((i) =>
          i.id === content.id ? { ...i, likes_count: i.likes_count + (isLiked ? -1 : 1) } : i,
        ),
      );

      if (isLiked) {
        await supabase
          .from("content_likes")
          .delete()
          .eq("content_id", content.id)
          .eq("user_id", session.user.id);
      } else {
        await supabase
          .from("content_likes")
          .insert({ content_id: content.id, user_id: session.user.id });
        await awardXp(XP_REWARDS.like);
        pushXp(XP_REWARDS.like);
      }
    },
    [likes, session, awardXp, pushXp],
  );

  const toggleSave = useCallback(
    async (content: ContentRow) => {
      if (!session) return;
      const isSaved = saves.has(content.id);
      setSaves((prev) => {
        const next = new Set(prev);
        if (isSaved) next.delete(content.id);
        else next.add(content.id);
        return next;
      });
      if (isSaved) {
        await supabase
          .from("content_saves")
          .delete()
          .eq("content_id", content.id)
          .eq("user_id", session.user.id);
      } else {
        await supabase
          .from("content_saves")
          .insert({ content_id: content.id, user_id: session.user.id });
        toast.success(t("feed.saved"));
      }
    },
    [saves, session, t],
  );

  const share = useCallback(
    async (content: ContentRow) => {
      const url = `${window.location.origin}/feed`;
      try {
        if (navigator.share) await navigator.share({ title: content.title, url });
        else {
          await navigator.clipboard.writeText(url);
          toast.success(t("feed.linkCopied"));
        }
      } catch {
        /* annulé par l'utilisateur */
      }
      setItems((prev) =>
        prev.map((i) => (i.id === content.id ? { ...i, shares_count: i.shares_count + 1 } : i)),
      );
      // Un UPDATE direct est refusé par la politique `contents_update_own` dès que
      // l'on partage le contenu d'autrui : on passe par une fonction dédiée.
      const { error } = await supabase.rpc("increment_shares", { content_id: content.id });
      if (error) {
        console.error("[feed] compteur de partages non incrémenté", error);
        setItems((prev) =>
          prev.map((i) =>
            i.id === content.id ? { ...i, shares_count: Math.max(0, i.shares_count - 1) } : i,
          ),
        );
      }
    },
    [t],
  );

  const filters = useMemo(() => [FOR_YOU, ...CATEGORIES], []);
  const activeItem = items[active];

  return (
    <AppShell>
      <div className="relative h-[calc(100dvh-7.75rem)] overflow-hidden md:h-screen">
        {/* Filter bar */}
        <div className="absolute inset-x-0 top-0 z-40 flex gap-2 overflow-x-auto px-4 pb-3 pt-4 no-scrollbar md:px-8">
          {filters.map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`shrink-0 rounded-full border px-3.5 py-1.5 text-xs font-bold backdrop-blur transition-colors ${
                filter === f
                  ? "border-primary bg-primary/20 text-primary"
                  : "border-border bg-background/60 text-muted-foreground"
              }`}
            >
              {f === FOR_YOU ? t("feed.forYou") : f}
            </button>
          ))}
        </div>

        <div ref={containerRef} className="snap-feed h-full">
          {fetching && (
            <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
              {t("feed.loading")}
            </div>
          )}

          {!fetching && items.length === 0 && (
            <div className="flex h-full flex-col items-center justify-center gap-3 px-8 text-center">
              <p className="text-4xl">🛰️</p>
              <p className="text-sm text-muted-foreground">{t("feed.empty")}</p>
            </div>
          )}

          {items.map((content, index) => (
            <section
              key={content.id}
              data-content-id={content.id}
              className="h-full w-full snap-start"
            >
              <FeedCard
                content={content}
                liked={likes.has(content.id)}
                saved={saves.has(content.id)}
                questionCount={questionCounts[content.id] ?? 0}
                muted={muted}
                mountPlayer={Math.abs(index - active) <= PLAYER_WINDOW}
                onToggleMute={toggleMute}
                onPlayerReady={(player) => {
                  players.current.set(content.id, player);
                  // Le lecteur peut arriver après le passage de l'observer : si ce
                  // contenu est déjà le contenu actif, on démarre la lecture ici.
                  if (activeIdRef.current !== content.id) return;
                  if (mutedRef.current) player.mute?.();
                  else player.unMute?.();
                  player.playVideo?.();
                }}
                onPlayerDestroy={() => players.current.delete(content.id)}
                onToggleLike={() => void toggleLike(content)}
                onToggleSave={() => void toggleSave(content)}
                onComments={() => setCommentsFor(content.id)}
                onShare={() => void share(content)}
                onOpenArticle={() => setArticleFor(content)}
                onOpenQuiz={() => setQuizFor(content.id)}
                onXp={() => toast.info(t("feed.xpHint", { count: content.xp_reward }))}
              />
            </section>
          ))}
        </div>

        {activeItem && (
          <div className="pointer-events-none absolute right-4 top-4 z-40 hidden text-right md:block">
            <p className="text-[11px] font-bold text-muted-foreground">
              {active + 1} / {items.length}
            </p>
          </div>
        )}
      </div>

      {commentsFor && (
        <CommentsSheet contentId={commentsFor} onClose={() => setCommentsFor(null)} />
      )}
      {quizFor && <QuizModal contentId={quizFor} onClose={() => setQuizFor(null)} />}
      {articleFor && (
        <ArticleSheet
          title={articleFor.title}
          category={articleFor.category}
          text={articleFor.text_content ?? articleFor.description ?? ""}
          imageUrl={articleFor.image_url}
          onClose={() => setArticleFor(null)}
        />
      )}
    </AppShell>
  );
}
