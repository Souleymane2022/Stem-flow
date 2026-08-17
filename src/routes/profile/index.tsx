import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Flame, LogOut, Settings } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { AppShell } from "@/components/layout/AppShell";
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
  const { profile, session, loading, refreshProfile, signOut } = useAuth();
  const navigate = useNavigate();
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
          Chargement…
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
          <h1 className="text-lg font-bold">Profil introuvable</h1>
          <p className="text-sm text-muted-foreground">
            Ton compte existe, mais sa fiche de profil n'a pas pu être chargée.
          </p>
          <div className="flex flex-wrap justify-center gap-2">
            <button
              onClick={() => void refreshProfile()}
              className="rounded-full bg-gradient-brand px-5 py-2.5 text-sm font-black text-primary-foreground"
            >
              Réessayer
            </button>
            <button
              onClick={() => void signOut()}
              className="flex items-center gap-2 rounded-full border border-border bg-surface-2 px-5 py-2.5 text-sm font-semibold"
            >
              <LogOut className="h-4 w-4" />
              Se déconnecter
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
          <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-gradient-brand text-3xl font-black text-primary-foreground">
            {profile.username.charAt(0).toUpperCase()}
          </div>
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
                <Flame className="h-3.5 w-3.5" /> {profile.streak} jours
              </span>
            </div>
          </div>
          <button
            onClick={() => void signOut()}
            aria-label="Se déconnecter"
            className="rounded-xl border border-border bg-surface-2 p-2.5 text-muted-foreground hover:text-foreground"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </header>

        <section className="mt-6 rounded-2xl border border-border bg-surface-2 p-5">
          <div className="flex items-center justify-between text-xs font-bold">
            <span>{level.label}</span>
            <span className="text-muted-foreground">
              {next ? `${remaining} XP → ${next.label}` : "Niveau max"}
            </span>
          </div>
          <div className="mt-2.5 h-2 overflow-hidden rounded-full bg-background">
            <div
              className="h-full bg-gradient-brand transition-all duration-700"
              style={{ width: `${percent}%` }}
            />
          </div>
        </section>

        <Section title="Missions du jour" icon={<Settings className="h-4 w-4" />}>
          {missions.length === 0 && (
            <p className="text-sm text-muted-foreground">Aucune mission aujourd'hui.</p>
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

        <Section title="Badges">
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

        <Section title="Contenus enregistrés">
          {saved.length === 0 && (
            <p className="text-sm text-muted-foreground">Rien d'enregistré pour l'instant.</p>
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
