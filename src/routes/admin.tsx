import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Import, ListVideo, Loader2, ShieldCheck, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useI18n } from "@/lib/i18n";
import { AppShell } from "@/components/layout/AppShell";
import { CATEGORIES, categoryMeta, difficultyLabel } from "@/lib/categories";
import { isAdminEmail } from "@/lib/admins";
import { importYoutubePlaylist } from "@/lib/courses.functions";
import { addVideosToFeed } from "@/lib/feed.functions";
import { youtubeThumbnail } from "@/utils/youtube";

type FeedVideo = {
  id: string;
  title: string;
  category: string;
  video_id: string | null;
  author_name: string | null;
  created_at: string;
};

/** Assez pour retrouver ce qu'on vient de publier, sans charger tout le fil. */
const MODERATION_LIMIT = 40;

export const Route = createFileRoute("/admin")({
  head: () => ({
    meta: [
      { title: "Espace catalogue — STEMFLOW" },
      { name: "description", content: "Alimentation du catalogue STEMFLOW." },
      // Une page d'administration n'a rien à faire dans un index de recherche.
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AdminPage,
});

function AdminPage() {
  const { user, loading } = useAuth();
  const { t } = useI18n();
  const navigate = useNavigate();

  const runImport = useServerFn(importYoutubePlaylist);
  const runAddVideos = useServerFn(addVideosToFeed);

  const [url, setUrl] = useState("");
  const [category, setCategory] = useState<string>(CATEGORIES[0]);
  const [difficulty, setDifficulty] = useState("debutant");
  const [feedCount, setFeedCount] = useState(3);
  const [importing, setImporting] = useState(false);

  const [feedVideos, setFeedVideos] = useState<FeedVideo[]>([]);
  const [deleting, setDeleting] = useState<string | null>(null);

  const [videoUrls, setVideoUrls] = useState("");
  const [videoCategory, setVideoCategory] = useState<string>(CATEGORIES[0]);
  const [videoDifficulty, setVideoDifficulty] = useState("debutant");
  const [adding, setAdding] = useState(false);

  const loadFeedVideos = useCallback(async () => {
    const { data, error } = await supabase
      .from("contents")
      .select("id,title,category,video_id,author_name,created_at")
      .eq("content_type", "video")
      .order("created_at", { ascending: false })
      .limit(MODERATION_LIMIT);
    if (error) {
      console.error("[admin] liste des vidéos illisible", error);
      return;
    }
    setFeedVideos((data as FeedVideo[]) ?? []);
  }, []);

  useEffect(() => {
    if (isAdminEmail(user?.email)) void loadFeedVideos();
  }, [user?.email, loadFeedVideos]);

  const removeVideo = async (video: FeedVideo) => {
    if (!window.confirm(t("admin.delete.confirm"))) return;
    setDeleting(video.id);
    const { data, error } = await supabase.rpc("delete_content", { p_content_id: video.id });
    setDeleting(null);
    if (error) {
      console.error("[admin] suppression impossible", error);
      toast.error(t("admin.delete.failed", { message: error.message }));
      return;
    }
    setFeedVideos((prev) => prev.filter((v) => v.id !== video.id));
    toast.success(data ? t("admin.delete.done") : t("admin.delete.missing"));
  };

  const submitImport = async () => {
    if (!url.trim()) return;
    setImporting(true);
    try {
      const result = await runImport({
        data: { playlistUrl: url, category, difficulty, feedCount },
      });
      if (result.publishError) {
        // L'import a réussi, la mise en avant non : le dire, sinon on cherche
        // la cause dans le fil au lieu de la base.
        toast.error(t("courses.feed.failed", { message: result.publishError }));
      } else {
        toast.success(
          result.alreadyExisted
            ? t("courses.import.exists")
            : `${t("courses.import.done", { count: result.imported })} · ${t(
                "courses.import.published",
                { count: result.published },
              )}`,
        );
      }
      setUrl("");
      void navigate({ to: "/courses/$id", params: { id: result.courseId } });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Import impossible");
    } finally {
      setImporting(false);
    }
  };

  const submitVideos = async () => {
    if (!videoUrls.trim()) return;
    setAdding(true);
    try {
      const result = await runAddVideos({
        data: { urls: videoUrls, category: videoCategory, difficulty: videoDifficulty },
      });
      toast.success(
        t("admin.videos.done", {
          added: result.added,
          duplicates: result.duplicates,
          rejected: result.rejected,
        }),
      );
      setVideoUrls("");
      await loadFeedVideos();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Ajout impossible");
    } finally {
      setAdding(false);
    }
  };

  if (loading) {
    return (
      <AppShell>
        <div className="p-8 text-sm text-muted-foreground">{t("common.loading")}</div>
      </AppShell>
    );
  }

  // L'accès réel est vérifié en base et par les fonctions serveur ; cet écran
  // évite seulement de proposer une action qui serait refusée.
  if (!isAdminEmail(user?.email)) {
    return (
      <AppShell>
        <div className="mx-auto max-w-lg px-4 py-16 text-center md:px-8">
          <ShieldCheck className="mx-auto h-10 w-10 text-muted-foreground" />
          <h1 className="mt-4 text-2xl">{t("admin.denied.title")}</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {user ? t("admin.denied.body") : t("admin.denied.signIn")}
          </p>
          <Link
            to={user ? "/feed" : "/auth"}
            className="mt-6 inline-block rounded-full bg-gradient-brand px-5 py-2.5 text-sm font-black text-background"
          >
            {user ? t("nav.feed") : t("auth.signin")}
          </Link>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="mx-auto max-w-3xl px-4 py-6 md:px-8 md:py-10">
        <h1 className="flex items-center gap-2 text-3xl">
          <ShieldCheck className="h-7 w-7 text-primary" /> {t("admin.title")}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">{t("admin.subtitle")}</p>

        {/* ------------------------------------------------ playlists */}
        <section className="mt-6 rounded-2xl border border-border bg-surface p-4">
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
          <label className="mt-2 flex items-center justify-between gap-3 rounded-xl border border-border bg-surface-2 px-3 py-2.5">
            <span className="min-w-0 text-sm font-semibold">{t("courses.import.feedCount")}</span>
            <select
              value={feedCount}
              onChange={(e) => setFeedCount(Number(e.target.value))}
              className="shrink-0 rounded-lg border border-border bg-background px-2 py-1.5 text-sm outline-none focus:border-primary"
            >
              {[0, 3, 5, 10].map((n) => (
                <option key={n} value={n}>
                  {n === 0
                    ? t("courses.import.feedNone")
                    : t("courses.import.feedSome", { count: n })}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            onClick={() => void submitImport()}
            disabled={importing || !url.trim()}
            className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-brand py-2.5 text-sm font-bold text-background disabled:opacity-60"
          >
            {importing && <Loader2 className="h-4 w-4 animate-spin" />}
            {importing ? t("courses.import.busy") : t("courses.import.submit")}
          </button>
        </section>

        {/* ------------------------------------------- vidéos du fil */}
        <section className="mt-4 rounded-2xl border border-border bg-surface p-4">
          <h2 className="flex items-center gap-2 text-base font-bold">
            <ListVideo className="h-4 w-4 text-tech" /> {t("admin.videos.title")}
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">{t("admin.videos.hint")}</p>
          <textarea
            value={videoUrls}
            onChange={(e) => setVideoUrls(e.target.value)}
            rows={5}
            placeholder={"https://www.youtube.com/watch?v=…\nhttps://youtu.be/…"}
            className="mt-3 w-full rounded-xl border border-border bg-surface-2 px-3 py-2.5 font-mono text-xs outline-none focus:border-primary"
          />
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            <select
              value={videoCategory}
              onChange={(e) => setVideoCategory(e.target.value)}
              className="rounded-xl border border-border bg-surface-2 px-3 py-2.5 text-sm outline-none focus:border-primary"
            >
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {categoryMeta(c).emoji} {c}
                </option>
              ))}
            </select>
            <select
              value={videoDifficulty}
              onChange={(e) => setVideoDifficulty(e.target.value)}
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
            onClick={() => void submitVideos()}
            disabled={adding || !videoUrls.trim()}
            className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-brand py-2.5 text-sm font-bold text-background disabled:opacity-60"
          >
            {adding && <Loader2 className="h-4 w-4 animate-spin" />}
            {adding ? t("admin.videos.busy") : t("admin.videos.submit")}
          </button>
        </section>

        {/* --------------------------------------------- modération */}
        <section className="mt-4 rounded-2xl border border-border bg-surface p-4">
          <h2 className="flex items-center gap-2 text-base font-bold">
            <Trash2 className="h-4 w-4 text-destructive" /> {t("admin.delete.title")}
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">{t("admin.delete.hint")}</p>

          {feedVideos.length === 0 ? (
            <p className="mt-3 text-sm text-muted-foreground">{t("admin.delete.empty")}</p>
          ) : (
            <ul className="mt-3 space-y-2">
              {feedVideos.map((video) => (
                <li
                  key={video.id}
                  className="flex items-center gap-3 rounded-xl border border-border bg-surface-2 p-2"
                >
                  {video.video_id ? (
                    <img
                      src={youtubeThumbnail(video.video_id)}
                      alt=""
                      aria-hidden="true"
                      loading="lazy"
                      className="h-11 w-20 shrink-0 rounded-lg object-cover"
                    />
                  ) : (
                    <span className="h-11 w-20 shrink-0 rounded-lg bg-background" />
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold">{video.title}</span>
                    <span className="block truncate text-[11px] text-muted-foreground">
                      {video.category} · @{video.author_name ?? "stemflow"} ·{" "}
                      {new Date(video.created_at).toLocaleDateString()}
                    </span>
                  </span>
                  <button
                    type="button"
                    onClick={() => void removeVideo(video)}
                    disabled={deleting === video.id}
                    aria-label={t("admin.delete.action")}
                    title={t("admin.delete.action")}
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-destructive/40 bg-destructive/10 text-destructive transition-colors hover:bg-destructive/20 disabled:opacity-50"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </AppShell>
  );
}
