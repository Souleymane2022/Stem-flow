import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { AppShell } from "@/components/layout/AppShell";
import { getLevel, levelBgClass } from "@/lib/xp";

export const Route = createFileRoute("/leaderboard")({
  head: () => ({
    meta: [
      { title: "Classement de la communauté — STEMFLOW" },
      {
        name: "description",
        content: "Découvre les membres STEMFLOW qui accumulent le plus d'XP et grimpe dans le classement.",
      },
      { property: "og:title", content: "Classement de la communauté — STEMFLOW" },
      { property: "og:description", content: "Qui domine le classement STEM cette semaine ?" },
    ],
  }),
  component: LeaderboardPage,
});

type Row = { id: string; username: string; xp: number; streak: number; profile_image_url: string | null };

function LeaderboardPage() {
  const { profile } = useAuth();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    void (async () => {
      const { data } = await supabase
        .from("profiles")
        .select("id,username,xp,streak,profile_image_url")
        .order("xp", { ascending: false })
        .limit(50);
      if (!alive) return;
      setRows((data as Row[]) ?? []);
      setLoading(false);
    })();
    return () => {
      alive = false;
    };
  }, []);

  const myRank = rows.findIndex((r) => r.id === profile?.id) + 1;

  return (
    <AppShell>
      <div className="mx-auto max-w-2xl px-4 py-6 md:px-8 md:py-10">
        <h1 className="text-3xl">Classement</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {myRank > 0 ? `Tu es #${myRank} avec ${profile?.xp ?? 0} XP.` : "Gagne de l'XP pour entrer dans le top 50."}
        </p>

        <div className="mt-6 space-y-2">
          {loading && <p className="text-sm text-muted-foreground">Chargement…</p>}
          {rows.map((row, i) => {
            const level = getLevel(row.xp);
            const isMe = row.id === profile?.id;
            return (
              <Link
                key={row.id}
                to="/profile/$id"
                params={{ id: row.id }}
                className={`flex items-center gap-3 rounded-2xl border p-3.5 transition-colors ${
                  isMe ? "border-primary/60 bg-primary/10" : "border-border bg-surface-2 hover:border-primary/40"
                }`}
              >
                <span className="w-7 text-center text-sm font-black tabular text-muted-foreground">
                  {i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : i + 1}
                </span>
                <span className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-brand text-sm font-black text-primary-foreground">
                  {row.username.charAt(0).toUpperCase()}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold">@{row.username}</p>
                  <span className={`mt-0.5 inline-block rounded-full border px-2 py-0.5 text-[10px] font-bold ${levelBgClass[level.token]}`}>
                    {level.icon} {level.label}
                  </span>
                </div>
                <div className="text-right">
                  <p className="text-sm font-black tabular text-primary">{row.xp} XP</p>
                  <p className="text-[11px] text-muted-foreground">🔥 {row.streak} j</p>
                </div>
              </Link>
            );
          })}
        </div>
      </div>
    </AppShell>
  );
}
