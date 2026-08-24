import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Heart,
  MessageCircle,
  Share2,
  Bookmark,
  Play,
  FileText,
  HelpCircle,
  Volume2,
  VolumeX,
  GraduationCap,
  Trash2,
} from "lucide-react";
import { Link } from "@tanstack/react-router";
import { VideoPlayer, type YouTubePlayerLike } from "./VideoPlayer";
import { categoryMeta } from "@/lib/categories";
import { InfinityGlyph } from "@/components/brand/InfinityGlyph";
import { youtubeThumbnail } from "@/utils/youtube";
import { BrandSplash } from "@/components/brand/BrandSplash";
import { markBrandBreakShown, shouldShowBrandBreak } from "@/lib/brandBreak";
import { useI18n, useLabels } from "@/lib/i18n";
import { formatCount } from "@/lib/numbers";

export type ContentRow = {
  id: string;
  content_type: string;
  title: string;
  description: string | null;
  video_id: string | null;
  text_content: string | null;
  image_url: string | null;
  category: string;
  difficulty: string;
  xp_reward: number;
  author_id: string | null;
  author_name: string | null;
  likes_count: number;
  comments_count: number;
  shares_count: number;
  created_at: string;
  /** Renseignés quand la vidéo est une leçon d'un cours publiée dans le fil. */
  source_course_id: string | null;
  source_lesson_id: string | null;
  /** Cours d'origine, imbriqué par la requête du fil. */
  course?: { id: string; title: string } | null;
};

type Props = {
  content: ContentRow;
  liked: boolean;
  saved: boolean;
  questionCount?: number;
  muted?: boolean;
  /**
   * Ne monte l'iframe YouTube que pour les slides proches de la position courante.
   * Les autres n'affichent qu'une vignette : une iframe par contenu saturait le fil.
   */
  mountPlayer?: boolean;
  /** Slide occupant l'écran. L'ouverture de marque n'a de sens que là. */
  active?: boolean;
  onToggleMute?: () => void;
  /** Fourni aux seuls comptes autorisés : retire la vidéo du fil. */
  onDelete?: (() => void) | undefined;
  onPlayerReady?: (player: YouTubePlayerLike) => void;
  onPlayerDestroy?: () => void;
  onToggleLike: () => void;
  onToggleSave: () => void;
  onComments: () => void;
  onShare: () => void;
  onOpenArticle: () => void;
  onOpenQuiz: () => void;
  onXp: () => void;
};

type Burst = { id: number; x: number; y: number };

/** Amorce muette accordée à la vidéo cachée sous l'annonce. */
const PREBUFFER_MS = 900;

export function FeedCard({
  content,
  liked,
  saved,
  questionCount,
  muted = true,
  mountPlayer = false,
  active = false,
  onToggleMute,
  onDelete,
  onPlayerReady,
  onPlayerDestroy,
  onToggleLike,
  onToggleSave,
  onComments,
  onShare,
  onOpenArticle,
  onOpenQuiz,
  onXp,
}: Props) {
  const { t, locale } = useI18n();
  const { categoryLabel, difficultyLabel } = useLabels();
  const meta = categoryMeta(content.category);
  // Décidé au montage, comme la lecture : le fil monte la slide suivante à
  // l'avance, et attendre qu'elle soit à l'écran ferait apparaître l'annonce
  // après le début de la vidéo.
  const [needsSplash] = useState(() =>
    content.content_type === "video" ? shouldShowBrandBreak(content.id) : false,
  );
  const [splashDone, setSplashDone] = useState(false);
  const showSplash = needsSplash && !splashDone;
  /**
   * Lecteur prêt pendant l'annonce. Il n'est confié au fil qu'à la fin de
   * celle-ci : sinon le fil, voyant la slide active, lancerait la vidéo
   * derrière le voile.
   */
  const waitingPlayer = useRef<YouTubePlayerLike | null>(null);
  const lastTap = useRef(0);
  const [bursts, setBursts] = useState<Burst[]>([]);

  useEffect(() => {
    if (bursts.length === 0) return;
    const id = setTimeout(() => setBursts([]), 1000);
    return () => clearTimeout(id);
  }, [bursts]);

  const handleTap = (e: React.MouseEvent<HTMLDivElement>) => {
    const now = Date.now();
    if (now - lastTap.current < 300) {
      const rect = e.currentTarget.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      setBursts(Array.from({ length: 7 }, (_, i) => ({ id: now + i, x, y })));
      if (!liked) onToggleLike();
    }
    lastTap.current = now;
  };

  return (
    <div className="relative h-full w-full overflow-hidden bg-background" onClick={handleTap}>
      {/* Media layer */}
      {content.content_type === "video" && content.video_id ? (
        <div className="absolute inset-0">
          {/* Le lecteur est monté même sous l'annonce : il remplit sa mémoire
              tampon pendant les cinq secondes, et la vidéo démarre sans attente
              quand le voile se lève. */}
          {mountPlayer ? (
            <VideoPlayer
              videoId={content.video_id}
              onPlayerReady={(player) => {
                if (showSplash) {
                  player.mute();
                  player.playVideo();
                  window.setTimeout(() => {
                    player.pauseVideo();
                    player.seekTo?.(0, true);
                  }, PREBUFFER_MS);
                  waitingPlayer.current = player;
                  return;
                }
                onPlayerReady?.(player);
              }}
              onPlayerDestroy={onPlayerDestroy}
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center bg-black">
              <img
                src={youtubeThumbnail(content.video_id)}
                alt=""
                aria-hidden="true"
                loading="lazy"
                decoding="async"
                className="absolute inset-0 h-full w-full object-cover opacity-70"
              />
              <span className="relative flex h-16 w-16 items-center justify-center rounded-full bg-background/70 backdrop-blur">
                <Play className="h-7 w-7 fill-current text-primary" />
              </span>
            </div>
          )}
        </div>
      ) : content.content_type === "quiz" ? (
        <div
          className={`absolute inset-0 flex flex-col items-center justify-center bg-gradient-to-br ${meta.gradient}`}
        >
          <HelpCircle className={`h-14 w-14 ${meta.text}`} />
          <h2 className="mt-5 max-w-md px-8 text-center text-3xl">{content.title}</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            {t("feed.questions", { count: questionCount ?? 0 })} ·{" "}
            {difficultyLabel(content.difficulty)}
          </p>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onOpenQuiz();
            }}
            className="mt-6 rounded-full bg-gradient-brand px-6 py-3 text-sm font-black text-primary-foreground"
          >
            {t("feed.startQuiz")}
          </button>
        </div>
      ) : (
        <div
          className={`absolute inset-0 flex flex-col justify-center bg-gradient-to-br ${meta.gradient} px-8`}
        >
          {content.image_url && (
            <img
              src={content.image_url}
              alt=""
              loading="lazy"
              className="absolute inset-0 h-full w-full object-cover opacity-25"
            />
          )}
          <div className="relative max-w-xl">
            <FileText className={`h-9 w-9 ${meta.text}`} />
            <h2 className="mt-4 text-3xl">{content.title}</h2>
            <p className="mt-3 line-clamp-4 text-sm text-foreground/80">
              {(content.text_content ?? content.description ?? "").slice(0, 150)}…
            </p>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onOpenArticle();
              }}
              className="mt-5 rounded-full bg-gradient-brand px-5 py-2.5 text-sm font-black text-primary-foreground"
            >
              {t("feed.readArticle")}
            </button>
          </div>
        </div>
      )}

      {/* L'annonce ne démarre que sur la slide affichée : montée en avance,
          elle se serait déroulée hors écran et personne ne l'aurait vue. */}
      {content.content_type === "video" &&
        content.video_id &&
        mountPlayer &&
        showSplash &&
        active && (
          <BrandSplash
            onDone={() => {
              markBrandBreakShown(content.id);
              setSplashDone(true);
              const player = waitingPlayer.current;
              waitingPlayer.current = null;
              if (player) onPlayerReady?.(player);
            }}
          />
        )}

      {/* Heart bursts */}
      <AnimatePresence>
        {bursts.map((b, i) => (
          <motion.span
            key={b.id}
            className="pointer-events-none absolute z-30 text-3xl"
            initial={{ x: b.x, y: b.y, opacity: 1, scale: 0.6 }}
            animate={{
              x: b.x + (i - 3) * 26,
              y: b.y - 140 - i * 12,
              opacity: 0,
              scale: 1.3,
              rotate: (i - 3) * 18,
            }}
            transition={{ duration: 0.9, ease: "easeOut" }}
          >
            ❤️
          </motion.span>
        ))}
      </AnimatePresence>

      {/* Bottom overlay */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 feed-veil px-4 pb-8 pt-24 md:px-8">
        <div className="pointer-events-auto max-w-[calc(100%-4.5rem)]">
          <div className="flex items-center gap-2.5">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-brand text-sm font-black text-primary-foreground">
              {(content.author_name ?? "S").charAt(0).toUpperCase()}
            </div>
            {content.author_id ? (
              <Link
                to="/profile/$id"
                params={{ id: content.author_id }}
                className="text-sm font-bold hover:text-primary"
                onClick={(e) => e.stopPropagation()}
              >
                @{content.author_name ?? "stemflow"}
              </Link>
            ) : (
              <span className="text-sm font-bold">@{content.author_name ?? "stemflow"}</span>
            )}
          </div>

          <h3 className="mt-3 text-base font-bold leading-snug md:text-lg">{content.title}</h3>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span
              className={`rounded-full border px-2.5 py-1 text-[11px] font-bold ${meta.bg} ${meta.border} ${meta.text}`}
            >
              {meta.emoji} {categoryLabel(content.category)}
            </span>
            <span className="rounded-full border border-border bg-surface-2 px-2.5 py-1 text-[11px] font-bold text-muted-foreground">
              {difficultyLabel(content.difficulty)}
            </span>
            <span className="rounded-full border border-primary/40 bg-primary/10 px-2.5 py-1 text-[11px] font-bold text-primary">
              +{content.xp_reward} XP
            </span>
          </div>
        </div>
      </div>

      {/* Right action rail */}
      <div className="absolute bottom-28 end-3 z-30 flex flex-col items-center gap-5 md:bottom-32 md:end-6">
        <ActionButton
          label={formatCount(content.likes_count, locale)}
          onClick={onToggleLike}
          active={liked}
          activeClass="text-destructive"
        >
          <Heart className={`h-6 w-6 ${liked ? "fill-current" : ""}`} />
        </ActionButton>
        <ActionButton label={formatCount(content.comments_count, locale)} onClick={onComments}>
          <MessageCircle className="h-6 w-6" />
        </ActionButton>
        <ActionButton label={formatCount(content.shares_count, locale)} onClick={onShare}>
          <Share2 className="h-6 w-6" />
        </ActionButton>
        <ActionButton label="" onClick={onToggleSave} active={saved} activeClass="text-engineering">
          <Bookmark className={`h-6 w-6 ${saved ? "fill-current" : ""}`} />
        </ActionButton>
        <ActionButton label="XP" onClick={onXp} activeClass="text-primary" active>
          <InfinityGlyph className="text-2xl" />
        </ActionButton>
      </div>

      {onDelete && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
          aria-label={t("admin.delete.action")}
          title={t("admin.delete.action")}
          className="absolute end-16 top-4 z-40 flex h-11 w-11 items-center justify-center rounded-full bg-background/70 text-destructive backdrop-blur transition-transform active:scale-90 md:end-20"
        >
          <Trash2 className="h-5 w-5" />
        </button>
      )}

      {content.content_type === "video" && onToggleMute && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onToggleMute();
          }}
          aria-label={muted ? t("feed.unmute") : t("feed.mute")}
          className="absolute end-3 top-4 z-40 flex h-11 w-11 items-center justify-center rounded-full bg-background/70 text-foreground backdrop-blur transition-transform active:scale-90 md:end-6"
        >
          {muted ? <VolumeX className="h-5 w-5" /> : <Volume2 className="h-5 w-5 text-primary" />}
        </button>
      )}

      {content.content_type === "video" && (
        <span className="pointer-events-none absolute start-4 top-4 z-20 flex items-center gap-1 rounded-full bg-background/70 px-2.5 py-1 text-[11px] font-bold text-muted-foreground md:start-8">
          <Play className="h-3 w-3" /> {t("feed.video")}
        </span>
      )}

      {/* Extrait de cours : le lien ramène au parcours complet, et le temps
          regardé ici compte déjà dans sa progression. */}
      {content.course && (
        <Link
          to="/courses/$id"
          params={{ id: content.course.id }}
          onClick={(e) => e.stopPropagation()}
          className="absolute start-4 top-14 z-30 flex max-w-[70%] items-center gap-1.5 rounded-full border border-tech/40 bg-background/80 px-2.5 py-1 text-[11px] font-bold text-tech backdrop-blur md:start-8"
        >
          <GraduationCap className="h-3.5 w-3.5 shrink-0" />
          <span className="truncate">{t("feed.fromCourse", { title: content.course.title })}</span>
        </Link>
      )}
    </div>
  );
}

function ActionButton({
  children,
  label,
  onClick,
  active,
  activeClass = "text-primary",
}: {
  children: React.ReactNode;
  label: string;
  onClick: () => void;
  active?: boolean;
  activeClass?: string;
}) {
  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className={`flex flex-col items-center gap-1 transition-transform active:scale-90 ${
        active ? activeClass : "text-foreground"
      }`}
    >
      <span className="flex h-11 w-11 items-center justify-center rounded-full bg-background/55 backdrop-blur">
        {children}
      </span>
      {label && <span className="text-[11px] font-bold tabular">{label}</span>}
    </button>
  );
}
