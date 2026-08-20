import { useState } from "react";
import { CalendarPlus, Loader2, Radio } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useI18n } from "@/lib/i18n";
import { isAdminEmail } from "@/lib/admins";
import { explainDbError } from "@/lib/db-errors";
import { extractYouTubeId } from "@/utils/youtube";
import { LiveAgenda } from "@/components/live/LiveAgenda";

const KINDS = ["masterclass", "atelier", "conference"] as const;

/** Prochain quart d'heure rond : une séance s'annonce rarement à 18 h 07. */
function defaultStart(): string {
  const date = new Date(Date.now() + 60 * 60 * 1000);
  date.setMinutes(Math.ceil(date.getMinutes() / 15) * 15, 0, 0);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/**
 * Séances d'un salon, et leur création.
 *
 * Le bloc reste discret quand il n'y a rien à montrer : la page d'un salon est
 * d'abord une discussion, l'agenda ne doit pas repousser les messages hors de
 * l'écran.
 */
export function RoomLive({ roomId }: { roomId: string }) {
  const { t } = useI18n();
  const { user } = useAuth();
  const canHost = isAdminEmail(user?.email);

  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [kind, setKind] = useState<(typeof KINDS)[number]>("masterclass");
  const [startsAt, setStartsAt] = useState(defaultStart);
  const [duration, setDuration] = useState(60);
  const [video, setVideo] = useState("");
  const [refresh, setRefresh] = useState(0);

  const submit = async () => {
    if (title.trim().length < 3) return;
    setBusy(true);
    const { error } = await supabase.rpc("create_live_session", {
      p_room_id: roomId,
      p_title: title.trim(),
      p_kind: kind,
      p_description: description.trim() || null,
      p_video_id: extractYouTubeId(video) ?? (video.trim() || null),
      // Le champ du navigateur donne une heure locale : elle part en UTC,
      // sinon la séance s'afficherait décalée pour tous les autres fuseaux.
      p_starts_at: new Date(startsAt).toISOString(),
      p_duration: duration,
    });
    setBusy(false);
    if (error) {
      toast.error(explainDbError(error, t));
      return;
    }
    setTitle("");
    setDescription("");
    setVideo("");
    setOpen(false);
    setRefresh((n) => n + 1);
    toast.success(t("live.create.done"));
  };

  return (
    <section className="mb-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-sm font-bold">
          <Radio className="h-4 w-4 text-destructive" /> {t("live.agenda")}
        </h2>
        {canHost && (
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="flex items-center gap-1.5 rounded-full border border-border bg-surface-2 px-3 py-1.5 text-xs font-bold text-muted-foreground hover:text-foreground"
          >
            <CalendarPlus className="h-3.5 w-3.5" /> {t("live.create")}
          </button>
        )}
      </div>

      <LiveAgenda key={refresh} roomId={roomId} showEmpty={false} />

      {open && canHost && (
        <div className="mt-3 space-y-2 rounded-2xl border border-primary/30 bg-primary/5 p-3">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={t("live.create.title")}
            className="w-full rounded-xl border border-border bg-surface-2 px-3 py-2 text-sm outline-none focus:border-primary"
          />
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder={t("live.create.description")}
            rows={2}
            className="w-full rounded-xl border border-border bg-surface-2 px-3 py-2 text-sm outline-none focus:border-primary"
          />
          <div className="grid gap-2 sm:grid-cols-3">
            <select
              value={kind}
              onChange={(e) => setKind(e.target.value as (typeof KINDS)[number])}
              className="rounded-xl border border-border bg-surface-2 px-3 py-2 text-sm outline-none focus:border-primary"
            >
              {KINDS.map((k) => (
                <option key={k} value={k}>
                  {t(`live.kind.${k}`)}
                </option>
              ))}
            </select>
            <input
              type="datetime-local"
              value={startsAt}
              onChange={(e) => setStartsAt(e.target.value)}
              className="rounded-xl border border-border bg-surface-2 px-3 py-2 text-sm outline-none focus:border-primary"
            />
            <input
              type="number"
              min={5}
              max={600}
              step={5}
              value={duration}
              onChange={(e) => setDuration(Number(e.target.value))}
              className="rounded-xl border border-border bg-surface-2 px-3 py-2 text-sm outline-none focus:border-primary"
            />
          </div>
          <input
            value={video}
            onChange={(e) => setVideo(e.target.value)}
            placeholder={t("live.create.video")}
            className="w-full rounded-xl border border-border bg-surface-2 px-3 py-2 text-sm outline-none focus:border-primary"
          />
          <button
            type="button"
            onClick={() => void submit()}
            disabled={busy || title.trim().length < 3}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-brand py-2.5 text-sm font-bold text-background disabled:opacity-60"
          >
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            {busy ? t("live.create.busy") : t("live.create.submit")}
          </button>
        </div>
      )}
    </section>
  );
}
