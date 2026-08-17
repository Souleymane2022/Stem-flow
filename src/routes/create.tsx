import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useXpPopup } from "@/components/gamification/XpPopup";
import { AppShell } from "@/components/layout/AppShell";
import { CATEGORIES, DIFFICULTIES } from "@/lib/categories";
import { XP_REWARDS } from "@/lib/xp";
import { extractYouTubeId } from "@/utils/youtube";

export const Route = createFileRoute("/create")({
  head: () => ({
    meta: [
      { title: "Publier un contenu — STEMFLOW" },
      {
        name: "description",
        content:
          "Partage une vidéo YouTube ou un article STEM avec la communauté STEMFLOW et gagne de l'XP.",
      },
      { property: "og:title", content: "Publier un contenu — STEMFLOW" },
      { property: "og:description", content: "Deviens créateur STEM sur STEMFLOW." },
    ],
  }),
  component: CreatePage,
});

function CreatePage() {
  const navigate = useNavigate();
  const { session, profile, awardXp } = useAuth();
  const pushXp = useXpPopup();

  const [type, setType] = useState<"video" | "text">("video");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [videoUrl, setVideoUrl] = useState("");
  const [textContent, setTextContent] = useState("");
  const [category, setCategory] = useState<string>(CATEGORIES[0]);
  const [difficulty, setDifficulty] = useState<string>("debutant");
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!session || !profile) {
      toast.error("Connecte-toi pour publier.");
      return;
    }
    const videoId = type === "video" ? extractYouTubeId(videoUrl) : null;
    if (type === "video" && !videoId) {
      toast.error("Lien YouTube invalide.");
      return;
    }

    setBusy(true);
    const { error } = await supabase.from("contents").insert({
      content_type: type,
      title,
      description,
      video_url: type === "video" ? videoUrl : null,
      video_id: videoId,
      text_content: type === "text" ? textContent : null,
      category,
      difficulty,
      xp_reward: 10,
      author_id: session.user.id,
      author_name: profile.username,
      author_avatar: profile.profile_image_url,
    });
    setBusy(false);

    if (error) {
      toast.error("Publication impossible.");
      return;
    }
    await awardXp(XP_REWARDS.publish);
    pushXp(XP_REWARDS.publish);
    toast.success("Contenu publié 🎉");
    navigate({ to: "/feed" });
  };

  return (
    <AppShell>
      <div className="mx-auto max-w-2xl px-4 py-6 md:px-8 md:py-10">
        <h1 className="text-3xl">Créer</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Partage une ressource STEM et gagne +{XP_REWARDS.publish} XP.
        </p>

        <div className="mt-6 grid grid-cols-2 gap-2">
          {(
            [
              { value: "video", label: "🎬 Vidéo YouTube" },
              { value: "text", label: "📝 Article" },
            ] as const
          ).map((t) => (
            <button
              key={t.value}
              onClick={() => setType(t.value)}
              className={`rounded-xl border py-3 text-sm font-bold transition-colors ${
                type === t.value
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border bg-surface-2"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        <form onSubmit={submit} className="mt-5 space-y-4">
          <label className="block">
            <span className="label-xs">Titre</span>
            <input
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Pourquoi le ciel est bleu ?"
              className="mt-1.5 w-full rounded-xl border border-border bg-surface-2 px-4 py-3 text-sm outline-none focus:border-primary/60"
            />
          </label>

          <label className="block">
            <span className="label-xs">Description</span>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              className="mt-1.5 w-full resize-none rounded-xl border border-border bg-surface-2 px-4 py-3 text-sm outline-none focus:border-primary/60"
            />
          </label>

          {type === "video" ? (
            <label className="block">
              <span className="label-xs">Lien YouTube</span>
              <input
                required
                value={videoUrl}
                onChange={(e) => setVideoUrl(e.target.value)}
                placeholder="https://www.youtube.com/watch?v=..."
                className="mt-1.5 w-full rounded-xl border border-border bg-surface-2 px-4 py-3 text-sm outline-none focus:border-primary/60"
              />
            </label>
          ) : (
            <label className="block">
              <span className="label-xs">Contenu de l'article</span>
              <textarea
                required
                value={textContent}
                onChange={(e) => setTextContent(e.target.value)}
                rows={8}
                className="mt-1.5 w-full resize-none rounded-xl border border-border bg-surface-2 px-4 py-3 text-sm leading-relaxed outline-none focus:border-primary/60"
              />
            </label>
          )}

          <div>
            <span className="label-xs">Catégorie</span>
            <div className="mt-1.5 flex flex-wrap gap-2">
              {CATEGORIES.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setCategory(c)}
                  className={`rounded-full border px-3.5 py-1.5 text-xs font-bold ${
                    category === c
                      ? "border-primary bg-primary/15 text-primary"
                      : "border-border bg-surface-2 text-muted-foreground"
                  }`}
                >
                  {c}
                </button>
              ))}
            </div>
          </div>

          <div>
            <span className="label-xs">Difficulté</span>
            <div className="mt-1.5 flex flex-wrap gap-2">
              {DIFFICULTIES.map((d) => (
                <button
                  key={d.value}
                  type="button"
                  onClick={() => setDifficulty(d.value)}
                  className={`rounded-full border px-3.5 py-1.5 text-xs font-bold ${
                    difficulty === d.value
                      ? "border-primary bg-primary/15 text-primary"
                      : "border-border bg-surface-2 text-muted-foreground"
                  }`}
                >
                  {d.label}
                </button>
              ))}
            </div>
          </div>

          <button
            type="submit"
            disabled={busy}
            className="w-full rounded-xl bg-gradient-brand py-3.5 text-sm font-black text-primary-foreground disabled:opacity-50"
          >
            {busy ? "Publication…" : "Publier"}
          </button>
        </form>
      </div>
    </AppShell>
  );
}
