import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { AppShell } from "@/components/layout/AppShell";
import { useI18n } from "@/lib/i18n";
import { ProfileActivity } from "@/components/profile/ProfileActivity";
import { getLevel, levelBgClass } from "@/lib/xp";
import { categoryMeta } from "@/lib/categories";

export const Route = createFileRoute("/profile/$id")({
  head: () => ({
    meta: [
      { title: "Profil membre — STEMFLOW" },
      {
        name: "description",
        content: "Consulte le profil d'un membre STEMFLOW : niveau, XP, série et contenus publiés.",
      },
      { property: "og:title", content: "Profil membre — STEMFLOW" },
      { property: "og:description", content: "Découvre les créateurs de la communauté STEMFLOW." },
    ],
  }),
  component: PublicProfilePage,
});

type PublicProfile = {
  id: string;
  username: string;
  bio: string | null;
  xp: number;
  streak: number;
  interests: string[] | null;
  profile_image_url: string | null;
  share_progress: boolean;
};

function PublicProfilePage() {
  const { id } = Route.useParams();
  const { session } = useAuth();
  const { t } = useI18n();
  const [person, setPerson] = useState<PublicProfile | null>(null);
  const [contents, setContents] = useState<{ id: string; title: string; category: string }[]>([]);
  const [following, setFollowing] = useState(false);
  const [followers, setFollowers] = useState(0);

  useEffect(() => {
    let alive = true;
    void (async () => {
      const [{ data: p }, { data: c }, { count }] = await Promise.all([
        supabase
          .from("profiles")
          .select("id,username,bio,xp,streak,interests,profile_image_url,share_progress")
          .eq("id", id)
          .maybeSingle(),
        supabase.from("contents").select("id,title,category").eq("author_id", id).limit(20),
        supabase
          .from("follows")
          .select("follower_id", { count: "exact", head: true })
          .eq("following_id", id),
      ]);
      if (!alive) return;
      setPerson((p as PublicProfile) ?? null);
      setContents((c as { id: string; title: string; category: string }[]) ?? []);
      setFollowers(count ?? 0);
    })();
    return () => {
      alive = false;
    };
  }, [id]);

  useEffect(() => {
    if (!session) return;
    let alive = true;
    void (async () => {
      const { data } = await supabase
        .from("follows")
        .select("follower_id")
        .eq("follower_id", session.user.id)
        .eq("following_id", id)
        .maybeSingle();
      if (alive) setFollowing(!!data);
    })();
    return () => {
      alive = false;
    };
  }, [id, session]);

  const toggleFollow = async () => {
    if (!session || session.user.id === id) return;
    if (following) {
      await supabase
        .from("follows")
        .delete()
        .eq("follower_id", session.user.id)
        .eq("following_id", id);
      setFollowing(false);
      setFollowers((f) => Math.max(0, f - 1));
    } else {
      await supabase.from("follows").insert({ follower_id: session.user.id, following_id: id });
      setFollowing(true);
      setFollowers((f) => f + 1);
      toast.success(t("person.followed"));
    }
  };

  if (!person) {
    return (
      <AppShell>
        <div className="flex h-[60vh] items-center justify-center text-sm text-muted-foreground">
          {t("common.loading")}
        </div>
      </AppShell>
    );
  }

  const level = getLevel(person.xp);

  return (
    <AppShell>
      <div className="mx-auto max-w-3xl px-4 py-6 md:px-8 md:py-10">
        <header className="flex items-start gap-4">
          {person.profile_image_url ? (
            <img
              src={person.profile_image_url}
              alt=""
              className="h-20 w-20 shrink-0 rounded-2xl object-cover"
            />
          ) : (
            <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-2xl bg-gradient-brand text-3xl font-black text-primary-foreground">
              {person.username.charAt(0).toUpperCase()}
            </div>
          )}
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-2xl">@{person.username}</h1>
            <span
              className={`mt-1.5 inline-block rounded-full border px-2.5 py-1 text-[11px] font-bold ${levelBgClass[level.token]}`}
            >
              {level.icon} {level.label}
            </span>
            <div className="mt-3 flex gap-4 text-xs font-bold">
              <span className="text-primary tabular">{person.xp} XP</span>
              <span className="text-muted-foreground tabular">
                {t("person.followers", { count: followers })}
              </span>
              <span className="text-engineering">🔥 {person.streak} j</span>
            </div>
          </div>
          {session?.user.id !== person.id && (
            <button
              onClick={toggleFollow}
              className={`rounded-full px-4 py-2 text-xs font-bold ${
                following
                  ? "border border-border bg-surface-2 text-muted-foreground"
                  : "bg-gradient-brand text-primary-foreground"
              }`}
            >
              {following ? t("person.following") : t("person.follow")}
            </button>
          )}
        </header>

        {person.bio && <p className="mt-5 text-sm text-muted-foreground">{person.bio}</p>}

        <ProfileActivity
          userId={person.id}
          own={session?.user.id === person.id}
          interests={person.interests}
          canSeeProgress={person.share_progress || session?.user.id === person.id}
        />

        <h2 className="mt-8 text-sm font-black uppercase tracking-wider text-muted-foreground">
          {t("person.posts")}
        </h2>
        <div className="mt-3 space-y-2">
          {contents.length === 0 && (
            <p className="text-sm text-muted-foreground">{t("person.posts.empty")}</p>
          )}
          {contents.map((c) => (
            <div
              key={c.id}
              className="flex items-center gap-3 rounded-2xl border border-border bg-surface-2 p-3.5"
            >
              <span className="text-xl">{categoryMeta(c.category).emoji}</span>
              <span className="truncate text-sm font-semibold">{c.title}</span>
            </div>
          ))}
        </div>
      </div>
    </AppShell>
  );
}
