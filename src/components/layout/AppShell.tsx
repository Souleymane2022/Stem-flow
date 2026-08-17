import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { Home, Search, PlusCircle, Trophy, Users, User, Bell, Swords, LogOut } from "lucide-react";
import type { ReactNode } from "react";
import { InfinityGlyph, InfinityMark } from "@/components/brand/InfinityMark";
import { useAuth } from "@/hooks/useAuth";
import { getLevel, levelProgress } from "@/lib/xp";
import { supabase } from "@/integrations/supabase/client";

const NAV = [
  { to: "/feed", label: "Fil d'actualité", short: "Fil", icon: Home },
  { to: "/search", label: "Recherche", short: "Recherche", icon: Search },
  { to: "/create", label: "Créer", short: "Créer", icon: PlusCircle },
  { to: "/competitions", label: "Compétitions", short: "Défis", icon: Swords },
  { to: "/leaderboard", label: "Classement", short: "Classement", icon: Trophy },
  { to: "/rooms", label: "Salons", short: "Salons", icon: Users },
  { to: "/profile", label: "Profil", short: "Profil", icon: User },
] as const;

function useUnreadCount() {
  const { user } = useAuth();
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!user) return;
    let active = true;
    const load = async () => {
      const { count: c } = await supabase
        .from("notifications")
        .select("id", { count: "exact", head: true })
        .eq("user_id", user.id)
        .eq("read", false);
      if (active) setCount(c ?? 0);
    };
    void load();

    const channel = supabase
      .channel("notif-badge")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "notifications", filter: `user_id=eq.${user.id}` },
        () => void load(),
      )
      .subscribe();

    return () => {
      active = false;
      void supabase.removeChannel(channel);
    };
  }, [user]);

  return count;
}

function XpBar() {
  const { profile } = useAuth();
  if (!profile) return null;
  const { current, next, percent } = levelProgress(profile.xp);
  return (
    <div className="rounded-xl border border-border bg-surface-2 p-3">
      <div className="flex items-center gap-2 text-sm font-semibold">
        <span>{current.icon}</span>
        <span className="truncate">{profile.username}</span>
      </div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-background">
        <div
          className="h-full bg-gradient-brand transition-all duration-700"
          style={{ width: `${percent}%` }}
        />
      </div>
      <p className="mt-1.5 flex justify-between text-[11px] text-muted-foreground tabular">
        <span>{profile.xp} XP</span>
        <span>{next ? `${next.minXp} XP` : "Niveau max"}</span>
      </p>
    </div>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const unread = useUnreadCount();
  const path = useRouterState({ select: (s) => s.location.pathname });
  const { profile, session, signOut } = useAuth();
  const navigate = useNavigate();
  const level = getLevel(profile?.xp ?? 0);

  // Toutes les pages n'ont pas de garde de session : on renvoie explicitement
  // vers la connexion après déconnexion.
  const handleSignOut = useCallback(async () => {
    await signOut();
    await navigate({ to: "/auth" });
  }, [signOut, navigate]);

  const isActive = (to: string) => path === to || path.startsWith(`${to}/`);

  return (
    <div className="min-h-dvh bg-background text-foreground">
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-60 flex-col justify-between border-r border-border bg-surface px-4 py-6 md:flex">
        <div>
          <Link to="/feed" className="flex items-center gap-2">
            <InfinityMark className="h-9 w-9" glow />
            <span className="text-xl font-black tracking-[-0.04em]">STEMFLOW</span>
          </Link>
          <p className="mt-1 label-xs">Scroll. Learn. Level Up.</p>

          <nav className="mt-8 space-y-1">
            {NAV.map(({ to, label, icon: Icon }) => (
              <Link
                key={to}
                to={to}
                className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition-colors ${
                  isActive(to)
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:bg-surface-2 hover:text-foreground"
                }`}
              >
                <Icon className="h-5 w-5" />
                {label}
              </Link>
            ))}
            <Link
              to="/notifications"
              className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition-colors ${
                isActive("/notifications")
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:bg-surface-2 hover:text-foreground"
              }`}
            >
              <span className="relative">
                <Bell className="h-5 w-5" />
                {unread > 0 && (
                  <span className="absolute -right-1.5 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold text-foreground">
                    {unread > 9 ? "9+" : unread}
                  </span>
                )}
              </span>
              Notifications
            </Link>
          </nav>
        </div>

        <div className="space-y-3">
          <XpBar />
          {/* Toujours disponible : la déconnexion ne doit pas dépendre du
              chargement du profil, sinon un profil illisible piège l'utilisateur. */}
          {session && (
            <button
              onClick={() => void handleSignOut()}
              className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold text-muted-foreground transition-colors hover:bg-surface-2 hover:text-foreground"
            >
              <LogOut className="h-5 w-5" />
              Se déconnecter
            </button>
          )}
          <p className="text-[11px] text-muted-foreground">
            <Link to="/privacy" className="hover:text-foreground">
              Confidentialité
            </Link>
            {" · "}
            <Link to="/terms" className="hover:text-foreground">
              CGU
            </Link>
          </p>
        </div>
      </aside>

      {/* Mobile top bar */}
      <header className="sticky top-0 z-30 flex items-center justify-between border-b border-border bg-background/90 px-4 py-3 backdrop-blur md:hidden">
        <Link to="/feed" className="flex items-center gap-2">
          <InfinityMark className="h-7 w-7" />
          <span className="text-lg font-black tracking-[-0.04em]">STEMFLOW</span>
        </Link>
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1 rounded-full border border-border bg-surface-2 px-2.5 py-1 text-xs font-bold">
            <InfinityGlyph /> <span className="tabular">{profile?.xp ?? 0}</span>
          </span>
          <span className="text-lg" title={level.label}>
            {level.icon}
          </span>
          {session && (
            <button
              onClick={() => void handleSignOut()}
              aria-label="Se déconnecter"
              className="rounded-full border border-border bg-surface-2 p-1.5 text-muted-foreground"
            >
              <LogOut className="h-4 w-4" />
            </button>
          )}
        </div>
      </header>

      <main className="md:pl-60">
        <div className="pb-20 md:pb-0">{children}</div>
      </main>

      {/* Mobile bottom nav */}
      <nav className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-7 border-t border-border bg-surface/95 backdrop-blur md:hidden">
        {NAV.map(({ to, short, icon: Icon }) => {
          const active = isActive(to);
          const isCreate = to === "/create";
          return (
            <Link key={to} to={to} className="flex flex-col items-center gap-0.5 py-2.5">
              <Icon
                className={`h-5 w-5 ${isCreate ? "text-primary" : active ? "text-primary" : "text-muted-foreground"}`}
              />
              <span
                className={`text-[10px] font-semibold ${active ? "text-primary" : "text-muted-foreground"}`}
              >
                {short}
              </span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
