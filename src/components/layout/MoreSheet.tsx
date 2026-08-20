import { AnimatePresence, motion } from "framer-motion";
import { Link } from "@tanstack/react-router";
import { Bell, LogOut, ShieldCheck, Swords, Trophy, Users, X } from "lucide-react";

import { useAuth } from "@/hooks/useAuth";
import { useI18n } from "@/lib/i18n";
import { isAdminEmail } from "@/lib/admins";

/**
 * Tiroir « Plus » de la barre du bas.
 *
 * Il recueille ce qui ne tient pas dans les cinq places de la barre, et les
 * notifications, qui n'avaient aucune entrée sur téléphone : le badge de la
 * barre latérale ne s'affiche qu'à partir d'un écran d'ordinateur.
 */
const ENTRIES = [
  { to: "/competitions", label: "nav.competitions", icon: Swords },
  { to: "/leaderboard", label: "nav.leaderboard", icon: Trophy },
  { to: "/rooms", label: "nav.rooms", icon: Users },
] as const;

export function MoreSheet({
  open,
  onClose,
  unread,
}: {
  open: boolean;
  onClose: () => void;
  unread: number;
}) {
  const { t } = useI18n();
  const { session, user, signOut } = useAuth();

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 flex flex-col justify-end md:hidden"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <button
            type="button"
            aria-label={t("common.close")}
            onClick={onClose}
            className="absolute inset-0 bg-background/70 backdrop-blur-sm"
          />

          <motion.div
            className="relative rounded-t-3xl border-t border-border bg-surface pb-[env(safe-area-inset-bottom)]"
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", stiffness: 320, damping: 34 }}
          >
            {/* Poignée : la même que celle des feuilles du système, elle dit
                que le panneau se referme vers le bas. */}
            <span className="mx-auto mt-3 block h-1 w-10 rounded-full bg-border" />

            <div className="flex items-center justify-between px-5 pb-1 pt-3">
              <h2 className="text-lg font-bold">{t("nav.more")}</h2>
              <button
                type="button"
                onClick={onClose}
                aria-label={t("common.close")}
                className="rounded-full border border-border bg-surface-2 p-2 text-muted-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <nav className="px-3 pb-4">
              <Link
                to="/notifications"
                onClick={onClose}
                className="flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-semibold text-foreground"
              >
                <span className="relative">
                  <Bell className="h-5 w-5" />
                  {unread > 0 && (
                    <span className="absolute -end-1.5 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold">
                      {unread > 9 ? "9+" : unread}
                    </span>
                  )}
                </span>
                {t("nav.notifications")}
              </Link>

              {ENTRIES.map(({ to, label, icon: Icon }) => (
                <Link
                  key={to}
                  to={to}
                  onClick={onClose}
                  className="flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-semibold text-foreground"
                >
                  <Icon className="h-5 w-5" />
                  {t(label)}
                </Link>
              ))}

              {isAdminEmail(user?.email) && (
                <Link
                  to="/admin"
                  onClick={onClose}
                  className="flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-semibold text-foreground"
                >
                  <ShieldCheck className="h-5 w-5" />
                  {t("admin.open")}
                </Link>
              )}

              {session && (
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    void signOut();
                  }}
                  className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-sm font-semibold text-muted-foreground"
                >
                  <LogOut className="h-5 w-5" />
                  {t("nav.signOut")}
                </button>
              )}
            </nav>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
