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
} from "lucide-react";
import { Link } from "@tanstack/react-router";
import { VideoPlayer, type YouTubePlayerLike } from "./VideoPlayer";
import { categoryMeta, difficultyLabel } from "@/lib/categories";
import { InfinityGlyph } from "@/components/brand/InfinityMark";
import { youtubeThumbnail } from "@/utils/youtube";
import { useI18n } from "@/lib/i18n";

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
  onToggleMute?: () => void;
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

export function FeedCard({
  content,
  liked,
  saved,
  questionCount,
  muted = true,
  mountPlayer = false,
  onToggleMute,
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
  const { t } = useI18n();
  const meta = categoryMeta(content.category);
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
          {mountPlayer ? (
            <VideoPlayer
              videoId={content.video_id}
              onPlayerReady={onPlayerReady}
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
              {meta.emoji} {content.category}
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
          label={String(content.likes_count)}
          onClick={onToggleLike}
          active={liked}
          activeClass="text-destructive"
        >
          <Heart className={`h-6 w-6 ${liked ? "fill-current" : ""}`} />
        </ActionButton>
        <ActionButton label={String(content.comments_count)} onClick={onComments}>
          <MessageCircle className="h-6 w-6" />
        </ActionButton>
        <ActionButton label={String(content.shares_count)} onClick={onShare}>
          <Share2 className="h-6 w-6" />
        </ActionButton>
        <ActionButton label="" onClick={onToggleSave} active={saved} activeClass="text-engineering">
          <Bookmark className={`h-6 w-6 ${saved ? "fill-current" : ""}`} />
        </ActionButton>
        <ActionButton label="XP" onClick={onXp} activeClass="text-primary" active>
          <InfinityGlyph className="text-2xl" />
        </ActionButton>
      </div>

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
