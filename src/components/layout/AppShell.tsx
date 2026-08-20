import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import {
  Home,
  Search,
  PlusCircle,
  Trophy,
  Users,
  User,
  Bell,
  Swords,
  GraduationCap,
  LogOut,
  MoreHorizontal,
  ShieldCheck,
} from "lucide-react";
import type { ReactNode } from "react";
import { InfinityGlyph } from "@/components/brand/InfinityGlyph";
import { BrandLogo } from "@/components/brand/BrandLogo";
import { MoreSheet } from "@/components/layout/MoreSheet";
import { useAuth } from "@/hooks/useAuth";
import { isAdminEmail } from "@/lib/admins";
import { InstallLink } from "@/components/pwa/InstallApp";
import { useI18n } from "@/lib/i18n";
import { getLevel, levelProgress } from "@/lib/xp";
import { supabase } from "@/integrations/supabase/client";

/**
 * Entrées de la barre du bas, sur téléphone.
 *
 * Les huit entrées de la barre latérale n'y tenaient pas : à 390 px, chaque
 * libellé recevait quarante pixels et finissait coupé — « Cours… », « Ranki… ».
 * Cinq entrées tiennent, les autres passent dans le tiroir « Plus », qui
 * accueille au passage les notifications, jusque-là inaccessibles depuis un
 * téléphone.
 */
const MOBILE_NAV = ["/feed", "/search", "/create", "/courses", "/profile"] as const;

const NAV = [
  { to: "/feed", label: "nav.feed", short: "nav.feed.short", icon: Home },
  { to: "/search", label: "nav.search", short: "nav.search.short", icon: Search },
  { to: "/create", label: "nav.create", short: "nav.create.short", icon: PlusCircle },
  { to: "/courses", label: "nav.courses", short: "nav.courses.short", icon: GraduationCap },
  { to: "/competitions", label: "nav.competitions", short: "nav.competitions.short", icon: Swords },
  { to: "/leaderboard", label: "nav.leaderboard", short: "nav.leaderboard.short", icon: Trophy },
  { to: "/rooms", label: "nav.rooms", short: "nav.rooms.short", icon: Users },
  { to: "/profile", label: "nav.profile", short: "nav.profile.short", icon: User },
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
  const { t } = useI18n();
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
        <span>{next ? `${next.minXp} XP` : t("profile.maxLevel")}</span>
      </p>
    </div>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const unread = useUnreadCount();
  const path = useRouterState({ select: (s) => s.location.pathname });
  const { profile, session, signOut, user } = useAuth();
  const [moreOpen, setMoreOpen] = useState(false);
  const navigate = useNavigate();
  const { t } = useI18n();
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
      {/* La hauteur est contrainte par inset-y-0. Sans zone défilante, huit liens
          plus le bloc du bas dépassaient et se chevauchaient sur un écran peu
          haut : la navigation défile, le pied de page reste ancré. */}
      <aside className="fixed inset-y-0 start-0 z-40 hidden w-60 flex-col border-e border-border bg-surface md:flex">
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-6">
          <Link to="/feed" className="flex items-center gap-2">
            <BrandLogo className="h-10" />
          </Link>
          <p className="mt-1 label-xs">{t("brand.tagline")}</p>

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
                <Icon className="h-5 w-5 shrink-0" />
                <span className="truncate">{t(label)}</span>
              </Link>
            ))}
            {/* Réservée : ce lien ne s'affiche que pour les comptes autorisés.
                Le contrôle qui protège l'action est en base, pas ici. */}
            {isAdminEmail(user?.email) && (
              <Link
                to="/admin"
                className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition-colors ${
                  isActive("/admin")
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:bg-surface-2 hover:text-foreground"
                }`}
              >
                <ShieldCheck className="h-5 w-5 shrink-0" />
                <span className="truncate">{t("admin.open")}</span>
              </Link>
            )}
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
                  <span className="absolute -end-1.5 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold text-foreground">
                    {unread > 9 ? "9+" : unread}
                  </span>
                )}
              </span>
              <span className="truncate">{t("nav.notifications")}</span>
            </Link>
          </nav>
        </div>

        <div className="shrink-0 space-y-3 border-t border-border px-4 py-4">
          <InstallLink />
          <XpBar />
          {/* Toujours disponible : la déconnexion ne doit pas dépendre du
              chargement du profil, sinon un profil illisible piège l'utilisateur. */}
          {session && (
            <button
              onClick={() => void handleSignOut()}
              className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold text-muted-foreground transition-colors hover:bg-surface-2 hover:text-foreground"
            >
              <LogOut className="h-5 w-5 shrink-0" />
              <span className="truncate">{t("nav.signOut")}</span>
            </button>
          )}
          <p className="text-[11px] text-muted-foreground">
            <Link to="/privacy" className="hover:text-foreground">
              {t("nav.privacy")}
            </Link>
            {" · "}
            <Link to="/terms" className="hover:text-foreground">
              {t("nav.terms")}
            </Link>
            {" · "}
            {/* Permet de constater d'un coup d'œil quelle version est en ligne. */}
            <span title={t("nav.build")} className="tabular">
              {__BUILD_ID__}
            </span>
          </p>
        </div>
      </aside>

      {/* Mobile top bar */}
      <header className="sticky top-0 z-30 flex items-center justify-between border-b border-border bg-background/90 px-4 py-3 backdrop-blur md:hidden">
        <Link to="/feed" className="flex min-w-0 items-center gap-2">
          <BrandLogo className="h-7 shrink-0" />
        </Link>
        <div className="flex shrink-0 items-center gap-2">
          <span className="flex items-center gap-1 rounded-full border border-border bg-surface-2 px-2.5 py-1 text-xs font-bold">
            <InfinityGlyph /> <span className="tabular">{profile?.xp ?? 0}</span>
          </span>
          <span className="text-lg" title={level.label}>
            {level.icon}
          </span>
          {session && (
            <button
              onClick={() => void handleSignOut()}
              aria-label={t("nav.signOut")}
              className="rounded-full border border-border bg-surface-2 p-1.5 text-muted-foreground"
            >
              <LogOut className="h-4 w-4" />
            </button>
          )}
        </div>
      </header>

      <main className="md:ps-60">
        <div className="pb-20 md:pb-0">{children}</div>
      </main>

      {/* Mobile bottom nav */}
      <nav
        className="fixed inset-x-0 bottom-0 z-40 grid border-t border-border bg-surface/95 backdrop-blur md:hidden"
        style={{ gridTemplateColumns: `repeat(${MOBILE_NAV.length + 1}, minmax(0, 1fr))` }}
      >
        {NAV.filter((item) => (MOBILE_NAV as readonly string[]).includes(item.to)).map(
          ({ to, short, icon: Icon }) => {
            const active = isActive(to);
            const isCreate = to === "/create";
            return (
              <Link
                key={to}
                to={to}
                className="flex min-w-0 flex-col items-center gap-0.5 px-0.5 py-2.5"
              >
                <Icon
                  className={`h-5 w-5 ${isCreate ? "text-primary" : active ? "text-primary" : "text-muted-foreground"}`}
                />
                <span
                  className={`w-full truncate text-center text-[10px] font-semibold ${
                    active ? "text-primary" : "text-muted-foreground"
                  }`}
                >
                  {t(short)}
                </span>
              </Link>
            );
          },
        )}

        <button
          type="button"
          onClick={() => setMoreOpen(true)}
          aria-label={t("nav.more")}
          className="relative flex min-w-0 flex-col items-center gap-0.5 px-0.5 py-2.5"
        >
          <MoreHorizontal className="h-5 w-5 text-muted-foreground" />
          {unread > 0 && (
            <span className="absolute end-1/4 top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold text-foreground">
              {unread > 9 ? "9+" : unread}
            </span>
          )}
          <span className="w-full truncate text-center text-[10px] font-semibold text-muted-foreground">
            {t("nav.more")}
          </span>
        </button>
      </nav>

      <MoreSheet open={moreOpen} onClose={() => setMoreOpen(false)} unread={unread} />
    </div>
  );
}
