import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Flame, LogOut, Settings } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { LOCALES, useI18n } from "@/lib/i18n";
import { AppShell } from "@/components/layout/AppShell";
import { AvatarPicker } from "@/components/profile/AvatarPicker";
import { ProfileActivity } from "@/components/profile/ProfileActivity";
import { InstallApp } from "@/components/pwa/InstallApp";
import { PushToggle } from "@/components/pwa/PushToggle";
import { getLevel, levelBgClass, levelProgress } from "@/lib/xp";
import { categoryMeta } from "@/lib/categories";

export const Route = createFileRoute("/profile/")({
  head: () => ({
    meta: [
      { title: "Mon profil — STEMFLOW" },
      {
        name: "description",
        content:
          "Suis ta progression : XP, niveau, série de connexions, badges et missions quotidiennes.",
      },
      { property: "og:title", content: "Mon profil — STEMFLOW" },
      { property: "og:description", content: "Ton tableau de bord d'apprentissage STEM." },
    ],
  }),
  component: ProfilePage,
});

type Mission = {
  id: string;
  title: string;
  description: string | null;
  target_value: number;
  current_progress: number;
  xp_reward: number;
  completed: boolean;
};

type Badge = { id: string; name: string; icon: string; description: string | null };

function ProfilePage() {
  const { profile, session, loading, refreshProfile, profileError, signOut } = useAuth();
  const navigate = useNavigate();
  const { t, locale, setLocale } = useI18n();
  const [missions, setMissions] = useState<Mission[]>([]);
  const [badges, setBadges] = useState<Badge[]>([]);
  const [earned, setEarned] = useState<Set<string>>(new Set());
  const [saved, setSaved] = useState<{ id: string; title: string; category: string }[]>([]);

  useEffect(() => {
    if (!profile) return;
    let alive = true;
    void (async () => {
      const today = new Date().toISOString().slice(0, 10);
      const [{ data: m }, { data: b }, { data: ub }, { data: sv }] = await Promise.all([
        supabase
          .from("missions")
          .select("id,title,description,target_value,current_progress,xp_reward,completed")
          .eq("user_id", profile.id)
          .gte("created_at", `${today}T00:00:00Z`),
        supabase.from("badges").select("id,name,icon,description").order("xp_required"),
        supabase.from("user_badges").select("badge_id").eq("user_id", profile.id),
        supabase
          .from("content_saves")
          .select("content_id, contents(id,title,category)")
          .eq("user_id", profile.id)
          .limit(20),
      ]);
      if (!alive) return;
      setMissions((m as Mission[]) ?? []);
      setBadges((b as Badge[]) ?? []);
      setEarned(new Set((ub ?? []).map((r) => r.badge_id)));
      setSaved(
        (
          (sv ?? []) as unknown as {
            contents: { id: string; title: string; category: string } | null;
          }[]
        )
          .map((r) => r.contents)
          .filter((c): c is { id: string; title: string; category: string } => !!c),
      );
    })();
    return () => {
      alive = false;
    };
  }, [profile]);

  // Sans session, on repart vers la page de connexion plutôt que de rester
  // indéfiniment sur un écran de chargement.
  useEffect(() => {
    if (!loading && !session) navigate({ to: "/auth" });
  }, [loading, session, navigate]);

  if (loading || (!profile && !session)) {
    return (
      <AppShell>
        <div className="flex h-[60vh] items-center justify-center text-sm text-muted-foreground">
          {t("common.loading")}
        </div>
      </AppShell>
    );
  }

  // Session valide mais aucune ligne `profiles` correspondante : l'écran de
  // chargement seul enfermait l'utilisateur, le bouton de déconnexion étant
  // rendu plus bas. On propose ici les deux issues.
  if (!profile) {
    return (
      <AppShell>
        <div className="mx-auto flex h-[60vh] max-w-sm flex-col items-center justify-center gap-4 px-6 text-center">
          <p className="text-4xl">🛰️</p>
          <h1 className="text-lg font-bold">{t("profile.notFound")}</h1>
          <p className="text-sm text-muted-foreground">{t("profile.notFound.description")}</p>
          {/* Le motif technique évite d'avoir à ouvrir la console pour le connaître. */}
          {profileError && (
            <p className="rounded-xl border border-border bg-surface-2 px-3 py-2 text-xs text-muted-foreground">
              {profileError}
            </p>
          )}
          <div className="flex flex-wrap justify-center gap-2">
            <button
              onClick={() => void refreshProfile()}
              className="rounded-full bg-gradient-brand px-5 py-2.5 text-sm font-black text-primary-foreground"
            >
              {t("profile.retry")}
            </button>
            <button
              onClick={() => void signOut()}
              className="flex items-center gap-2 rounded-full border border-border bg-surface-2 px-5 py-2.5 text-sm font-semibold"
            >
              <LogOut className="h-4 w-4" />
              {t("nav.signOut")}
            </button>
          </div>
        </div>
      </AppShell>
    );
  }

  const level = getLevel(profile.xp);
  const { next, percent, remaining } = levelProgress(profile.xp);

  return (
    <AppShell>
      <div className="mx-auto max-w-3xl px-4 py-6 md:px-8 md:py-10">
        <header className="flex items-start gap-4">
          <AvatarPicker profile={profile} onUpdated={refreshProfile} />
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-2xl">@{profile.username}</h1>
            <span
              className={`mt-1.5 inline-block rounded-full border px-2.5 py-1 text-[11px] font-bold ${levelBgClass[level.token]}`}
            >
              {level.icon} {level.label}
            </span>
            <div className="mt-3 flex gap-4 text-xs">
              <span className="font-bold text-primary tabular">{profile.xp} XP</span>
              <span className="flex items-center gap-1 font-bold text-engineering">
                <Flame className="h-3.5 w-3.5" /> {t("profile.days", { count: profile.streak })}
              </span>
            </div>
          </div>
          <button
            onClick={() => void signOut()}
            aria-label={t("nav.signOut")}
            className="rounded-xl border border-border bg-surface-2 p-2.5 text-muted-foreground hover:text-foreground"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </header>

        <section className="mt-6 rounded-2xl border border-border bg-surface-2 p-5">
          <div className="flex items-center justify-between text-xs font-bold">
            <span>{level.label}</span>
            <span className="text-muted-foreground">
              {next
                ? t("profile.toNextLevel", { count: remaining, level: next.label })
                : t("profile.maxLevel")}
            </span>
          </div>
          <div className="mt-2.5 h-2 overflow-hidden rounded-full bg-background">
            <div
              className="h-full bg-gradient-brand transition-all duration-700"
              style={{ width: `${percent}%` }}
            />
          </div>
        </section>

        {/* Placés avant l'historique : celui-ci fait plusieurs écrans sur
            téléphone, et l'installation y devenait introuvable. */}
        <InstallApp />

        <PushToggle />

        <ProfileActivity userId={profile.id} own interests={profile.interests} />

        <Section title={t("profile.missions")} icon={<Settings className="h-4 w-4" />}>
          {missions.length === 0 && (
            <p className="text-sm text-muted-foreground">{t("profile.missions.empty")}</p>
          )}
          <div className="space-y-2">
            {missions.map((m) => (
              <div key={m.id} className="rounded-2xl border border-border bg-surface-2 p-4">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-bold">{m.title}</p>
                  <span className="text-[11px] font-bold text-primary">+{m.xp_reward} XP</span>
                </div>
                <p className="mt-0.5 text-xs text-muted-foreground">{m.description}</p>
                <div className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-background">
                  <div
                    className="h-full bg-gradient-brand"
                    style={{
                      width: `${Math.min(100, (m.current_progress / m.target_value) * 100)}%`,
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        </Section>

        <Section title={t("profile.shareProgress")}>
          <label className="flex items-start gap-3 rounded-2xl border border-border bg-surface-2 p-4">
            <input
              type="checkbox"
              checked={profile.share_progress}
              onChange={async (e) => {
                const next = e.target.checked;
                const { error } = await supabase
                  .from("profiles")
                  .update({ share_progress: next })
                  .eq("id", profile.id);
                if (error) {
                  console.error("[profil] partage non enregistré", error);
                  return;
                }
                await refreshProfile();
              }}
              className="mt-0.5 h-4 w-4 shrink-0 accent-current text-primary"
            />
            <span className="text-sm">
              <span className="font-bold">{t("profile.shareProgress")}</span>
              <span className="mt-1 block text-xs text-muted-foreground">
                {t("profile.shareProgress.hint")}
              </span>
            </span>
          </label>
        </Section>

        <Section title={t("profile.language")}>
          <div className="flex flex-wrap gap-2">
            {LOCALES.map((l) => (
              <button
                key={l.value}
                onClick={() => setLocale(l.value)}
                lang={l.value}
                className={`flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-bold transition-colors ${
                  locale === l.value
                    ? "border-primary bg-primary/15 text-primary"
                    : "border-border bg-surface-2 text-muted-foreground hover:border-primary/40"
                }`}
              >
                <span className="text-base">{l.flag}</span>
                {l.label}
              </button>
            ))}
          </div>
        </Section>

        <Section title={t("profile.badges")}>
          <div className="grid grid-cols-4 gap-3 sm:grid-cols-6">
            {badges.map((b) => {
              const has = earned.has(b.id);
              return (
                <div
                  key={b.id}
                  title={b.description ?? b.name}
                  className={`flex flex-col items-center gap-1 rounded-2xl border p-3 text-center ${
                    has
                      ? "border-primary/50 bg-primary/10"
                      : "border-border bg-surface-2 opacity-40"
                  }`}
                >
                  <span className="text-2xl">{b.icon}</span>
                  <span className="text-[10px] font-bold leading-tight">{b.name}</span>
                </div>
              );
            })}
          </div>
        </Section>

        <Section title={t("profile.saved")}>
          {saved.length === 0 && (
            <p className="text-sm text-muted-foreground">{t("profile.saved.empty")}</p>
          )}
          <div className="space-y-2">
            {saved.map((c) => (
              <Link
                key={c.id}
                to="/feed"
                className="flex items-center gap-3 rounded-2xl border border-border bg-surface-2 p-3.5 hover:border-primary/40"
              >
                <span className="text-xl">{categoryMeta(c.category).emoji}</span>
                <span className="truncate text-sm font-semibold">{c.title}</span>
              </Link>
            ))}
          </div>
        </Section>
      </div>
    </AppShell>
  );
}

function Section({
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
