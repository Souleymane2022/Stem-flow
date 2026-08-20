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
import { isAdminEmail } from "@/lib/admins";
import { explainDbError } from "@/lib/db-errors";
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
/** Au-delà, une même matière s'enchaîne assez pour donner l'impression d'un fil unique. */
const MAX_SAME_CATEGORY_RUN = 2;
/** Envoi de la progression d'une leçon regardée depuis le fil. */
const PROGRESS_TICK_MS = 5000;
/** Au-delà, l'écart vient d'un saut dans la vidéo, pas d'un visionnage réel. */
const MAX_REAL_DELTA = 10;
/** Secondes de visionnage cumulées avant d'être envoyées au classement. */
const ENGAGEMENT_FLUSH_S = 15;
/**
 * Le cours d'origine est imbriqué dans la requête : la carte affiche
 * « Cours · … » sans une requête de plus par vidéo.
 */
const EMBED = "*, course:courses!contents_source_course_id_fkey (id, title)";
/** Distance de la fin à partir de laquelle on va chercher la suite. */
const PREFETCH_FROM_END = 3;

/** Sentinelle du filtre « tous contenus », distincte des noms de catégorie. */
const FOR_YOU = "__for_you__";

/**
 * Évite qu'une même matière s'enchaîne trop longtemps.
 *
 * Le classement peut légitimement placer six vidéos de technologie d'affilée
 * si c'est ce que la personne regarde ; le fil paraît alors monotone, et
 * l'occasion de découvrir autre chose disparaît. On repousse la vidéo de trop
 * derrière la première d'une autre matière, sans rien retirer ni retrier.
 */
function spreadCategories(rows: ContentRow[]): ContentRow[] {
  const remaining = [...rows];
  const out: ContentRow[] = [];

  while (remaining.length > 0) {
    let pick = 0;
    const tail = out.slice(-MAX_SAME_CATEGORY_RUN);
    if (
      tail.length === MAX_SAME_CATEGORY_RUN &&
      tail.every((r) => r.category === tail[0]!.category)
    ) {
      // Deux fois la même matière : on va chercher la mieux classée d'une
      // autre. S'il n'y en a plus, la suite se déroule telle quelle.
      const other = remaining.findIndex((r) => r.category !== tail[0]!.category);
      if (other >= 0) pick = other;
    }
    out.push(remaining.splice(pick, 1)[0]!);
  }
  return out;
}

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
  /** Dernière position connue par vidéo, pour ne créditer que l'avancée réelle. */
  const watchTimes = useRef<Map<string, number>>(new Map());
  /** Secondes regardées pas encore envoyées, par vidéo. */
  const pendingWatch = useRef<Map<string, number>>(new Map());
  /** Tirée une fois par visite : elle fixe la part de hasard du classement. */
  const seed = useRef<number | null>(null);
  /** Une seule demande de suite à la fois. */
  const extending = useRef(false);

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
      // La graine ne change qu'entre deux visites : l'ordre doit rester stable
      // pendant qu'on fait défiler, sinon une vidéo déjà passée reviendrait au
      // rechargement de la page suivante.
      seed.current ??= Math.random();

      const ranked = await supabase
        .rpc("feed_for_me", {
          p_limit: 40,
          p_category: filter === FOR_YOU ? null : filter,
          p_seed: seed.current,
        })
        .select(EMBED);

      let rows: ContentRow[] = [];
      if (!ranked.error) {
        rows = (ranked.data as unknown as ContentRow[]) ?? [];
      } else {
        // Repli tant que la migration de classement n'est pas appliquée : un
        // fil moins fin vaut mieux qu'un fil vide.
        console.error("[fil] classement indisponible, repli", ranked.error);
        const build = (withCourse: boolean) => {
          const q = supabase
            .from("contents")
            .select(withCourse ? EMBED : "*")
            .order("created_at", { ascending: false })
            .limit(40);
          return filter !== FOR_YOU ? q.eq("category", filter) : q;
        };
        const first = await build(true);
        const data = first.error ? (await build(false)).data : first.data;
        rows = (data as unknown as ContentRow[]) ?? [];
        if (filter === FOR_YOU && profile?.interests?.length) {
          const liked = new Set(profile.interests);
          rows = [...rows].sort(
            (a, b) => Number(liked.has(b.category)) - Number(liked.has(a.category)),
          );
        }
      }
      if (!alive) return;
      rows = spreadCategories(rows);
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

  // Le fil ne doit pas buter sur une fin. À l'approche de la dernière vidéo,
  // on redemande un classement avec une autre graine : les vidéos déjà vues
  // étant repoussées, la suite apporte autre chose. Quand le catalogue est
  // épuisé, rien n'est ajouté — plutôt que de reboucler sur les mêmes clés.
  useEffect(() => {
    if (!session || items.length === 0) return;
    if (active < items.length - PREFETCH_FROM_END) return;
    if (extending.current) return;
    extending.current = true;

    void (async () => {
      seed.current = Math.random();
      const { data, error } = await supabase
        .rpc("feed_for_me", {
          p_limit: 40,
          p_category: filter === FOR_YOU ? null : filter,
          p_seed: seed.current,
        })
        .select(EMBED);
      if (error) {
        console.error("[fil] suite indisponible", error);
        extending.current = false;
        return;
      }
      const known = new Set(items.map((i) => i.id));
      const fresh = ((data as unknown as ContentRow[]) ?? []).filter((r) => !known.has(r.id));
      if (fresh.length > 0) setItems((prev) => [...prev, ...spreadCategories(fresh)]);
      extending.current = false;
    })();
  }, [active, items, session, filter]);

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

  /**
   * Retire une vidéo du fil. Réservé aux comptes autorisés : la politique
   * `contents_delete_own` ne permet de supprimer que ses propres publications,
   * la fonction en base vérifie la liste blanche avant d'effacer.
   */
  const removeContent = useCallback(
    async (id: string) => {
      if (!window.confirm(t("admin.delete.confirm"))) return;
      const { data, error } = await supabase.rpc("delete_content", { p_content_id: id });
      if (error) {
        console.error("[fil] suppression impossible", error);
        toast.error(t("admin.delete.failed", { message: explainDbError(error, t) }));
        return;
      }
      // La ligne part de l'écran dans les deux cas : si elle avait déjà
      // disparu, la garder afficherait un contenu qui n'existe plus.
      setItems((prev) => prev.filter((item) => item.id !== id));
      players.current.delete(id);
      toast.success(data ? t("admin.delete.done") : t("admin.delete.missing"));
    },
    [t],
  );

  // Mesure du visionnage : elle nourrit le classement du fil, et crédite la
  // progression du cours quand la vidéo est une leçon. Sans cette dernière
  // part, la même leçon serait à revoir dans l'onglet Cours pour compter, et
  // le certificat resterait hors de portée de qui apprend dans le fil.
  useEffect(() => {
    if (!session) return;
    const timer = setInterval(() => {
      const id = activeIdRef.current;
      if (!id) return;
      const item = items.find((i) => i.id === id);
      if (!item) return;
      const player = players.current.get(id);
      if (!player?.getCurrentTime || !player.getDuration) return;
      const position = player.getCurrentTime();
      const duration = player.getDuration();
      if (!duration) return;

      const previous = watchTimes.current.get(id) ?? position;
      watchTimes.current.set(id, position);
      const delta = position - previous;
      // Un écart plus large vient d'un saut dans la barre, pas d'un visionnage.
      if (delta <= 0 || delta > MAX_REAL_DELTA) return;

      // Ce que le classement observera à la prochaine visite. Les secondes
      // sont cumulées puis envoyées par paquets : un appel toutes les cinq
      // secondes par personne n'apporterait rien de plus au classement.
      const pending = (pendingWatch.current.get(id) ?? 0) + delta;
      if (pending >= ENGAGEMENT_FLUSH_S) {
        pendingWatch.current.set(id, 0);
        void supabase
          .rpc("record_video_engagement", {
            p_content_id: id,
            p_watch_delta: Math.round(pending),
            p_completion: Math.min(1, position / duration),
          })
          .then(({ error }) => {
            if (error) console.error("[fil] visionnage non enregistré", error);
          });
      } else {
        pendingWatch.current.set(id, pending);
      }

      const lessonId = item.source_lesson_id;
      if (!lessonId) return;

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
                active={index === active}
                onToggleMute={toggleMute}
                onDelete={
                  isAdminEmail(session?.user.email)
                    ? () => void removeContent(content.id)
                    : undefined
                }
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
