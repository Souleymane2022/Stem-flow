import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowLeft, Send } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { AppShell } from "@/components/layout/AppShell";
import { useI18n } from "@/lib/i18n";
import { categoryMeta } from "@/lib/categories";

export const Route = createFileRoute("/rooms/$id")({
  head: () => ({
    meta: [
      { title: "Salon — STEMFLOW" },
      {
        name: "description",
        content: "Discute en direct avec les membres de ce salon STEM et partage tes découvertes.",
      },
      { property: "og:title", content: "Salon — STEMFLOW" },
      { property: "og:description", content: "Échange en temps réel avec la communauté STEMFLOW." },
    ],
  }),
  component: RoomPage,
});

type Room = {
  id: string;
  name: string;
  description: string | null;
  category: string;
  member_count: number;
};
type Post = {
  id: string;
  username: string | null;
  text: string;
  created_at: string;
  user_id: string;
};

function RoomPage() {
  const { t } = useI18n();
  const { id } = Route.useParams();
  const { session, profile } = useAuth();
  const [room, setRoom] = useState<Room | null>(null);
  const [posts, setPosts] = useState<Post[]>([]);
  const [joined, setJoined] = useState(false);
  const [text, setText] = useState("");

  useEffect(() => {
    let alive = true;
    void (async () => {
      const [{ data: r }, { data: p }] = await Promise.all([
        supabase
          .from("rooms")
          .select("id,name,description,category,member_count")
          .eq("id", id)
          .maybeSingle(),
        supabase
          .from("room_posts")
          .select("id,username,text,created_at,user_id")
          .eq("room_id", id)
          .order("created_at", { ascending: true })
          .limit(100),
      ]);
      if (!alive) return;
      setRoom((r as Room) ?? null);
      setPosts((p as Post[]) ?? []);
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
        .from("room_members")
        .select("user_id")
        .eq("room_id", id)
        .eq("user_id", session.user.id)
        .maybeSingle();
      if (alive) setJoined(!!data);
    })();
    return () => {
      alive = false;
    };
  }, [id, session]);

  useEffect(() => {
    const channel = supabase
      .channel(`room-${id}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "room_posts", filter: `room_id=eq.${id}` },
        (payload) => setPosts((prev) => [...prev, payload.new as Post]),
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [id]);

  const toggleJoin = async () => {
    if (!session) return;
    if (joined) {
      await supabase.from("room_members").delete().eq("room_id", id).eq("user_id", session.user.id);
      setJoined(false);
    } else {
      await supabase.from("room_members").insert({ room_id: id, user_id: session.user.id });
      setJoined(true);
      toast.success(t("rooms.welcome"));
    }
  };

  const send = async () => {
    if (!text.trim() || !session || !profile) return;
    const value = text.trim();
    setText("");
    const { error } = await supabase
      .from("room_posts")
      .insert({ room_id: id, user_id: session.user.id, username: profile.username, text: value });
    if (error) toast.error(t("rooms.sendFailed"));
  };

  const meta = categoryMeta(room?.category);

  return (
    <AppShell>
      <div className="mx-auto flex h-[calc(100dvh-7.75rem)] max-w-3xl flex-col px-4 md:h-screen md:px-8">
        <div className="flex items-center gap-3 py-4">
          <Link
            to="/rooms"
            aria-label="Retour"
            className="text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <span className="text-2xl">{meta.emoji}</span>
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-lg font-extrabold">{room?.name ?? "Salon"}</h1>
            <p className="text-[11px] text-muted-foreground">{room?.member_count ?? 0} membres</p>
          </div>
          <button
            onClick={toggleJoin}
            className={`rounded-full px-4 py-2 text-xs font-bold ${
              joined
                ? "border border-border bg-surface-2 text-muted-foreground"
                : "bg-gradient-brand text-primary-foreground"
            }`}
          >
            {joined ? t("rooms.leave") : t("rooms.join")}
          </button>
        </div>

        <div className="flex-1 space-y-3 overflow-y-auto rounded-2xl border border-border bg-surface-2 p-4">
          {posts.length === 0 && (
            <p className="py-12 text-center text-sm text-muted-foreground">
              Aucun message. Sois le premier à écrire !
            </p>
          )}
          {posts.map((post) => {
            const mine = post.user_id === session?.user.id;
            return (
              <div key={post.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                <div
                  className={`max-w-[80%] rounded-2xl px-4 py-2.5 ${
                    mine ? "bg-primary/20 text-foreground" : "bg-elevated"
                  }`}
                >
                  {!mine && (
                    <p className="text-[11px] font-bold text-primary">
                      @{post.username ?? "membre"}
                    </p>
                  )}
                  <p className="text-sm">{post.text}</p>
                </div>
              </div>
            );
          })}
        </div>

        <div className="flex items-center gap-2 py-4">
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && send()}
            placeholder={joined ? t("rooms.write") : t("rooms.joinToWrite")}
            disabled={!joined}
            className="flex-1 rounded-full border border-border bg-surface-2 px-4 py-3 text-sm outline-none focus:border-primary/60 disabled:opacity-50"
          />
          <button
            onClick={send}
            disabled={!joined || !text.trim()}
            aria-label={t("rooms.send")}
            className="flex h-11 w-11 items-center justify-center rounded-full bg-gradient-brand text-primary-foreground disabled:opacity-40"
          >
            <Send className="h-4 w-4" />
          </button>
        </div>
      </div>
    </AppShell>
  );
}
