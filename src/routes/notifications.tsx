import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Bell, CheckCheck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { AppShell } from "@/components/layout/AppShell";

export const Route = createFileRoute("/notifications")({
  head: () => ({
    meta: [
      { title: "Notifications — STEMFLOW" },
      {
        name: "description",
        content:
          "Retrouve tes badges débloqués, tes nouveaux abonnés et les réactions à tes publications.",
      },
      { property: "og:title", content: "Notifications — STEMFLOW" },
      { property: "og:description", content: "Toute ton activité STEMFLOW en un coup d'œil." },
    ],
  }),
  component: NotificationsPage,
});

type Notification = {
  id: string;
  type: string;
  title: string;
  message: string | null;
  read: boolean;
  created_at: string;
};

const ICONS: Record<string, string> = {
  badge: "🏅",
  follow: "👥",
  like: "❤️",
  comment: "💬",
  mission: "🎯",
  level: "⬆️",
};

function NotificationsPage() {
  const { session } = useAuth();
  const [items, setItems] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!session) return;
    let alive = true;
    const load = async () => {
      const { data } = await supabase
        .from("notifications")
        .select("id,type,title,message,read,created_at")
        .eq("user_id", session.user.id)
        .order("created_at", { ascending: false })
        .limit(50);
      if (!alive) return;
      setItems((data as Notification[]) ?? []);
      setLoading(false);
    };
    void load();

    const channel = supabase
      .channel("notifications-page")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "notifications",
          filter: `user_id=eq.${session.user.id}`,
        },
        () => void load(),
      )
      .subscribe();

    return () => {
      alive = false;
      void supabase.removeChannel(channel);
    };
  }, [session]);

  const markAll = async () => {
    if (!session) return;
    setItems((prev) => prev.map((i) => ({ ...i, read: true })));
    await supabase
      .from("notifications")
      .update({ read: true })
      .eq("user_id", session.user.id)
      .eq("read", false);
  };

  return (
    <AppShell>
      <div className="mx-auto max-w-2xl px-4 py-6 md:px-8 md:py-10">
        <div className="flex items-center justify-between">
          <h1 className="text-3xl">Notifications</h1>
          <button
            onClick={markAll}
            className="flex items-center gap-1.5 rounded-full border border-border bg-surface-2 px-3.5 py-1.5 text-xs font-bold text-muted-foreground hover:text-foreground"
          >
            <CheckCheck className="h-3.5 w-3.5" /> Tout lire
          </button>
        </div>

        <div className="mt-6 space-y-2">
          {loading && <p className="text-sm text-muted-foreground">Chargement…</p>}
          {!loading && items.length === 0 && (
            <div className="flex flex-col items-center gap-3 py-16 text-center">
              <Bell className="h-8 w-8 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">Rien de neuf pour l'instant.</p>
            </div>
          )}
          {items.map((n) => (
            <div
              key={n.id}
              className={`flex gap-3 rounded-2xl border p-4 ${
                n.read ? "border-border bg-surface-2" : "border-primary/40 bg-primary/10"
              }`}
            >
              <span className="text-xl">{ICONS[n.type] ?? "∞"}</span>
              <div className="min-w-0">
                <p className="text-sm font-bold">{n.title}</p>
                {n.message && <p className="mt-0.5 text-xs text-muted-foreground">{n.message}</p>}
                <p className="mt-1 text-[10px] text-muted-foreground">
                  {new Date(n.created_at).toLocaleDateString("fr-FR", {
                    day: "numeric",
                    month: "short",
                  })}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </AppShell>
  );
}
