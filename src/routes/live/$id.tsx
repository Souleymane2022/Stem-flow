import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronLeft, Radio, Send, Share2, Trash2, Users } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useI18n, type Key } from "@/lib/i18n";
import { AppShell } from "@/components/layout/AppShell";
import { VideoPlayer } from "@/components/feed/VideoPlayer";
import { EmptyState } from "@/components/common/EmptyState";
import { SkeletonList } from "@/components/common/Skeleton";
import { isAdminEmail } from "@/lib/admins";
import { explainDbError } from "@/lib/db-errors";
import { extractYouTubeId } from "@/utils/youtube";
import { durationLabel, relativeTime } from "@/lib/dates";

export const Route = createFileRoute("/live/$id")({
  head: () => ({
    meta: [
      { title: "Séance en direct — STEMFLOW" },
      {
        name: "description",
        content: "Masterclass, ateliers et conférences STEM en direct, avec la discussion.",
      },
      { property: "og:title", content: "Séance en direct — STEMFLOW" },
      { property: "og:description", content: "Rejoins la séance et participe à la discussion." },
    ],
  }),
  component: LivePage,
});

type Session = {
  id: string;
  room_id: string;
  kind: string;
  title: string;
  description: string | null;
  host_id: string | null;
  host_name: string | null;
  video_id: string | null;
  starts_at: string;
  duration_minutes: number;
  status: string;
  attendee_count: number;
};
type Message = {
  id: string;
  user_id: string;
  username: string | null;
  text: string;
  created_at: string;
};

const KIND_KEY: Record<string, Key> = {
  masterclass: "live.kind.masterclass",
  atelier: "live.kind.atelier",
  conference: "live.kind.conference",
};
const STATUS_KEY: Record<string, Key> = {
  scheduled: "live.status.scheduled",
  live: "live.status.live",
  ended: "live.status.ended",
  cancelled: "live.status.cancelled",
};

function LivePage() {
  const { id } = Route.useParams();
  const { session: auth, profile, user } = useAuth();
  const { t, locale } = useI18n();
  const navigate = useNavigate();

  const [live, setLive] = useState<Session | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [attending, setAttending] = useState(false);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [videoDraft, setVideoDraft] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);
  const chatRef = useRef<HTMLDivElement>(null);

  const isHost = Boolean(live?.host_id && live.host_id === user?.id);
  const canModerate = isHost || isAdminEmail(user?.email);

  const load = useCallback(async () => {
    const [{ data: s }, { data: m }] = await Promise.all([
      supabase.from("live_sessions").select("*").eq("id", id).maybeSingle(),
      supabase
        .from("live_messages")
        .select("id,user_id,username,text,created_at")
        .eq("session_id", id)
        .order("created_at")
        .limit(200),
    ]);
    setLive((s as Session) ?? null);
    setMessages((m as Message[]) ?? []);
    setLoading(false);
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!auth) return;
    let alive = true;
    void (async () => {
      const { data } = await supabase
        .from("live_attendees")
        .select("user_id")
        .eq("session_id", id)
        .eq("user_id", auth.user.id)
        .maybeSingle();
      if (alive) setAttending(Boolean(data));
    })();
    return () => {
      alive = false;
    };
  }, [auth, id]);

  // La discussion et l'état de la séance arrivent sans rechargement : pendant
  // un direct, rafraîchir la page pour voir un message n'aurait pas de sens.
  useEffect(() => {
    const channel = supabase
      .channel(`live-${id}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "live_messages",
          filter: `session_id=eq.${id}`,
        },
        (payload) =>
          setMessages((prev) => {
            const arriving = payload.new as Message;
            // Le message peut déjà être là : l'expéditeur l'affiche sans
            // attendre le retour du serveur.
            if (prev.some((m) => m.id === arriving.id)) return prev;
            return [...prev, arriving];
          }),
      )
      .on(
        "postgres_changes",
        { event: "DELETE", schema: "public", table: "live_messages" },
        (payload) =>
          setMessages((prev) => prev.filter((msg) => msg.id !== (payload.old as Message).id)),
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "live_sessions", filter: `id=eq.${id}` },
        (payload) => setLive((prev) => ({ ...(prev as Session), ...(payload.new as Session) })),
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [id]);

  // On ne suit le fil que si la personne s'y trouve déjà : pendant un direct
  // animé, ramener de force en bas arracherait la lecture d'un message plus
  // haut à chaque arrivée.
  useEffect(() => {
    const box = chatRef.current;
    if (!box) return;
    const atBottom = box.scrollHeight - box.scrollTop - box.clientHeight < 80;
    if (atBottom) bottomRef.current?.scrollIntoView({ block: "end" });
  }, [messages.length]);

  const toggleAttendance = async () => {
    if (!auth) {
      void navigate({ to: "/auth" });
      return;
    }
    if (attending) {
      const { error } = await supabase
        .from("live_attendees")
        .delete()
        .eq("session_id", id)
        .eq("user_id", auth.user.id);
      if (error) {
        toast.error(explainDbError(error, t));
        return;
      }
      setAttending(false);
      setLive((prev) =>
        prev ? { ...prev, attendee_count: Math.max(0, prev.attendee_count - 1) } : prev,
      );
      toast.success(t("live.left"));
      return;
    }
    const { error } = await supabase
      .from("live_attendees")
      .insert({ session_id: id, user_id: auth.user.id });
    if (error) {
      toast.error(explainDbError(error, t));
      return;
    }
    setAttending(true);
    setLive((prev) => (prev ? { ...prev, attendee_count: prev.attendee_count + 1 } : prev));
    toast.success(t("live.joined"));
  };

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    const text = draft.trim();
    if (!text || !auth) return;
    setSending(true);
    // La ligne part avec le nom d'utilisateur figé : le message reste lisible
    // même si la personne change de pseudo ensuite.
    const { data, error } = await supabase
      .from("live_messages")
      .insert({
        session_id: id,
        user_id: auth.user.id,
        username: profile?.username ?? null,
        text,
      })
      .select("id,user_id,username,text,created_at")
      .maybeSingle();
    setSending(false);
    if (error) {
      toast.error(explainDbError(error, t));
      return;
    }
    setDraft("");
    // Affiché tout de suite : si le temps réel n'est pas actif, on verrait
    // sinon son propre message disparaître dans le vide.
    if (data) {
      const sent = data as Message;
      setMessages((prev) => (prev.some((m) => m.id === sent.id) ? prev : [...prev, sent]));
    }
  };

  const share = async () => {
    const url = `${window.location.origin}/live/${id}`;
    const payload = { title: live?.title ?? "STEM Flow", url };
    // Le partage natif ouvre les applications du téléphone ; sur ordinateur il
    // n'existe pas, et le presse-papier rend le même service.
    if (navigator.share) {
      try {
        await navigator.share(payload);
        return;
      } catch {
        /* partage annulé */
      }
    }
    await navigator.clipboard.writeText(url);
    toast.success(t("live.shared"));
  };

  const setStatus = async (status: "live" | "ended") => {
    const { data, error } = await supabase.rpc("set_live_status", {
      p_session_id: id,
      p_status: status,
    });
    if (error) {
      toast.error(explainDbError(error, t));
      return;
    }
    setLive((prev) => (prev ? { ...prev, status } : prev));
    toast.success(
      status === "live" ? t("live.host.started", { count: data ?? 0 }) : t("live.host.ended"),
    );
  };

  const saveVideo = async () => {
    const videoId = extractYouTubeId(videoDraft) ?? videoDraft.trim();
    if (!videoId) return;
    const { error } = await supabase.rpc("update_live_session", {
      p_session_id: id,
      p_video_id: videoId,
    });
    if (error) {
      toast.error(explainDbError(error, t));
      return;
    }
    setLive((prev) => (prev ? { ...prev, video_id: videoId } : prev));
    setVideoDraft("");
    toast.success(t("live.host.videoSaved"));
  };

  const removeMessage = async (messageId: string) => {
    const { error } = await supabase.rpc("delete_live_message", { p_message_id: messageId });
    if (error) {
      toast.error(explainDbError(error, t));
      return;
    }
    setMessages((prev) => prev.filter((m) => m.id !== messageId));
  };

  if (loading) {
    return (
      <AppShell>
        <div className="mx-auto max-w-3xl px-4 py-6 md:px-8">
          <SkeletonList rows={3} thumb />
        </div>
      </AppShell>
    );
  }

  if (!live) {
    return (
      <AppShell>
        <EmptyState
          icon={<Radio className="h-6 w-6" />}
          title={t("live.notFound")}
          action={
            <Link
              to="/rooms"
              className="rounded-full bg-gradient-brand px-5 py-2.5 text-sm font-black text-background"
            >
              {t("live.back")}
            </Link>
          }
        />
      </AppShell>
    );
  }

  const isLive = live.status === "live";
  const startsAt = new Date(live.starts_at).toLocaleString(locale, {
    dateStyle: "long",
    timeStyle: "short",
  });
  // Devant une séance annoncée, « dans deux jours » vaut mieux qu'une date
  // qu'il faut comparer de tête à celle du jour.
  const countdown = live.status === "scheduled" ? relativeTime(live.starts_at, locale) : null;

  return (
    <AppShell>
      <div className="mx-auto max-w-3xl px-4 py-6 md:px-8 md:py-10">
        <Link
          to="/rooms/$id"
          params={{ id: live.room_id }}
          className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ChevronLeft className="h-4 w-4" /> {t("live.back")}
        </Link>

        {/* Diffusion */}
        <div className="mt-4 overflow-hidden rounded-2xl border border-border bg-black">
          <div className="aspect-video w-full">
            {live.video_id ? (
              <VideoPlayer videoId={live.video_id} />
            ) : (
              <div className="flex h-full w-full flex-col items-center justify-center gap-2 bg-surface-2 px-6 text-center">
                <Radio className="h-7 w-7 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">
                  {isLive ? t("live.waiting") : t("live.noVideo")}
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Identité de la séance */}
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <span
            className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-black ${
              isLive
                ? "bg-destructive/15 text-destructive"
                : "border border-border bg-surface-2 text-muted-foreground"
            }`}
          >
            {isLive && <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-destructive" />}
            {t(STATUS_KEY[live.status] ?? "live.status.scheduled")}
          </span>
          <span className="rounded-full border border-primary/40 bg-primary/10 px-2.5 py-1 text-[11px] font-bold text-primary">
            {t(KIND_KEY[live.kind] ?? "live.kind.masterclass")}
          </span>
          <span className="flex items-center gap-1 rounded-full border border-border bg-surface-2 px-2.5 py-1 text-[11px] font-bold text-muted-foreground">
            <Users className="h-3 w-3" /> {t("live.attendees", { count: live.attendee_count })}
          </span>
        </div>

        <h1 className="mt-3 text-2xl md:text-3xl">{live.title}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {t("live.startsAt", { date: startsAt })} ·{" "}
          {t("live.duration", { count: live.duration_minutes })}
          {live.host_name && ` · ${t("live.host", { name: live.host_name })}`}
        </p>
        {live.description && (
          <p className="mt-3 whitespace-pre-line text-sm text-foreground/85">{live.description}</p>
        )}

        <div className="mt-4 flex flex-wrap gap-2">
          {live.status !== "ended" && live.status !== "cancelled" && !isHost && (
            <button
              type="button"
              onClick={() => void toggleAttendance()}
              className={`rounded-full px-4 py-2 text-sm font-black ${
                attending
                  ? "border border-border bg-surface-2 text-muted-foreground"
                  : "bg-gradient-brand text-background"
              }`}
            >
              {attending ? t("live.leave") : t("live.join")}
            </button>
          )}
          <button
            type="button"
            onClick={() => void share()}
            className="flex items-center gap-1.5 rounded-full border border-border bg-surface-2 px-4 py-2 text-sm font-bold text-muted-foreground hover:text-foreground"
          >
            <Share2 className="h-4 w-4" /> {t("live.share")}
          </button>
        </div>

        {/* Commandes de l'hôte */}
        {canModerate && (
          <section className="mt-5 rounded-2xl border border-primary/30 bg-primary/5 p-4">
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => void setStatus(isLive ? "ended" : "live")}
                className="rounded-full bg-gradient-brand px-4 py-2 text-sm font-black text-background"
              >
                {isLive ? t("live.host.end") : t("live.host.start")}
              </button>
            </div>
            <label className="mt-3 block">
              <span className="label-xs">{t("live.host.videoLabel")}</span>
              <div className="mt-1.5 flex gap-2">
                <input
                  value={videoDraft}
                  onChange={(e) => setVideoDraft(e.target.value)}
                  placeholder="https://www.youtube.com/watch?v=…"
                  className="min-w-0 flex-1 rounded-xl border border-border bg-surface-2 px-3 py-2 text-sm outline-none focus:border-primary"
                />
                <button
                  type="button"
                  onClick={() => void saveVideo()}
                  disabled={!videoDraft.trim()}
                  className="shrink-0 rounded-xl border border-border bg-surface-2 px-3 py-2 text-sm font-bold disabled:opacity-50"
                >
                  {t("live.host.videoSave")}
                </button>
              </div>
            </label>
          </section>
        )}

        {/* Discussion */}
        <section className="mt-6">
          <h2 className="text-base font-bold">{t("live.chat")}</h2>

          <div
            ref={chatRef}
            className="mt-3 max-h-[26rem] space-y-2 overflow-y-auto rounded-2xl border border-border bg-surface-2 p-3"
          >
            {messages.length === 0 && (
              <p className="py-6 text-center text-sm text-muted-foreground">
                {t("live.chat.empty")}
              </p>
            )}
            {messages.map((message) => (
              <div key={message.id} className="group flex items-start gap-2">
                <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gradient-brand text-[11px] font-black text-primary-foreground">
                  {(message.username ?? "?").charAt(0).toUpperCase()}
                </span>
                <p className="min-w-0 flex-1 text-sm">
                  <span className="font-bold">@{message.username ?? "membre"}</span>{" "}
                  <span className="text-foreground/85">{message.text}</span>
                </p>
                {canModerate && (
                  <button
                    type="button"
                    onClick={() => void removeMessage(message.id)}
                    aria-label={t("admin.delete.action")}
                    className="shrink-0 text-muted-foreground opacity-0 transition-opacity hover:text-destructive group-hover:opacity-100"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            ))}
            <div ref={bottomRef} />
          </div>

          {auth ? (
            <form onSubmit={(e) => void send(e)} className="mt-3 flex gap-2">
              <input
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder={t("live.chat.placeholder")}
                maxLength={1000}
                className="min-w-0 flex-1 rounded-full border border-border bg-surface-2 px-4 py-2.5 text-sm outline-none focus:border-primary"
              />
              <button
                type="submit"
                disabled={sending || !draft.trim()}
                aria-label={t("rooms.send")}
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-gradient-brand text-background disabled:opacity-50"
              >
                <Send className="h-4 w-4" />
              </button>
            </form>
          ) : (
            <p className="mt-3 text-center text-sm text-muted-foreground">
              <Link to="/auth" className="text-primary">
                {t("live.chat.signin")}
              </Link>
            </p>
          )}
        </section>
      </div>
    </AppShell>
  );
}
