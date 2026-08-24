import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { CalendarDays, Radio, Users } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { useI18n, type Key } from "@/lib/i18n";
import { EmptyState } from "@/components/common/EmptyState";
import { relativeTime } from "@/lib/dates";
import { formatCount } from "@/lib/numbers";

type Agenda = {
  id: string;
  title: string;
  kind: string;
  status: string;
  starts_at: string;
  attendee_count: number;
  host_name: string | null;
};

const KIND_KEY: Record<string, Key> = {
  masterclass: "live.kind.masterclass",
  atelier: "live.kind.atelier",
  conference: "live.kind.conference",
};

/**
 * Séances en direct ou à venir.
 *
 * Sans `roomId`, elle couvre tous les salons : c'est la vue d'agenda de la
 * page Salons. Avec, elle se limite au salon affiché.
 */
export function LiveAgenda({
  roomId,
  showEmpty = true,
  includeEnded = false,
  onCount,
}: {
  roomId?: string;
  showEmpty?: boolean;
  /** Rediffusions comprises : utile dans un salon, où la séance passée compte. */
  includeEnded?: boolean;
  /** Prévient le parent du nombre de séances, pour qu'il masque son titre. */
  onCount?: (count: number) => void;
}) {
  const { t, locale } = useI18n();
  const [rows, setRows] = useState<Agenda[] | null>(null);

  useEffect(() => {
    let alive = true;
    void (async () => {
      let query = supabase
        .from("live_sessions")
        .select("id,title,kind,status,starts_at,attendee_count,host_name")
        .in("status", includeEnded ? ["live", "scheduled", "ended"] : ["live", "scheduled"])
        // Une séance annoncée puis jamais ouverte resterait sinon en tête de
        // l'agenda des semaines après sa date.
        .gte("starts_at", new Date(Date.now() - 36 * 3600 * 1000).toISOString())
        // Les directs d'abord, puis les prochaines dates : c'est l'ordre dans
        // lequel on cherche une séance.
        .order("status", { ascending: true })
        .order("starts_at", { ascending: true })
        .limit(10);
      if (roomId) query = query.eq("room_id", roomId);
      const { data, error } = await query;
      if (!alive) return;
      if (error) {
        console.error("[direct] agenda illisible", error);
        setRows([]);
        onCount?.(0);
        return;
      }
      const list = (data as Agenda[]) ?? [];
      setRows(list);
      onCount?.(list.length);
    })();
    return () => {
      alive = false;
    };
    // `onCount` change à chaque rendu du parent : le suivre relancerait la
    // requête en boucle.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId, includeEnded]);

  if (rows === null) return null;
  if (rows.length === 0) {
    if (!showEmpty) return null;
    return (
      <EmptyState
        icon={<CalendarDays className="h-6 w-6" />}
        title={t("live.agenda.empty")}
        hint={t("live.agenda.hint")}
      />
    );
  }

  return (
    <ul className="mt-3 space-y-2">
      {rows.map((row) => {
        const isLive = row.status === "live";
        const isEnded = row.status === "ended";
        return (
          <li key={row.id}>
            <Link
              to="/live/$id"
              params={{ id: row.id }}
              className={`flex items-center gap-3 rounded-2xl border p-3 transition-colors ${
                isLive
                  ? "border-destructive/40 bg-destructive/5 hover:border-destructive"
                  : "border-border bg-surface-2 hover:border-primary/40"
              }`}
            >
              <span
                className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
                  isLive ? "bg-destructive/15 text-destructive" : "bg-background text-primary"
                }`}
              >
                <Radio className="h-5 w-5" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-bold">{row.title}</span>
                <span className="mt-0.5 block truncate text-[11px] text-muted-foreground">
                  {t(KIND_KEY[row.kind] ?? "live.kind.masterclass")} ·{" "}
                  {row.status === "scheduled"
                    ? relativeTime(row.starts_at, locale)
                    : new Date(row.starts_at).toLocaleString(locale, {
                        dateStyle: "medium",
                        timeStyle: "short",
                      })}
                  {row.host_name && ` · @${row.host_name}`}
                </span>
              </span>
              <span className="flex shrink-0 flex-col items-end gap-1">
                {isLive && (
                  <span className="flex items-center gap-1 rounded-full bg-destructive/15 px-2 py-0.5 text-[10px] font-black text-destructive">
                    <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-destructive" />
                    {t("live.status.live")}
                  </span>
                )}
                {isEnded && (
                  <span className="rounded-full border border-border px-2 py-0.5 text-[10px] font-bold text-muted-foreground">
                    {t("live.status.ended")}
                  </span>
                )}
                <span className="flex items-center gap-1 text-[11px] font-bold text-muted-foreground">
                  <Users className="h-3 w-3" /> {formatCount(row.attendee_count, locale)}
                </span>
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
