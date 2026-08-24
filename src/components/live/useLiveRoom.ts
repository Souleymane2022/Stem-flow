import { useCallback, useEffect, useRef, useState } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";

import { supabase } from "@/integrations/supabase/client";

export type Burst = { id: number; emoji: string; left: number };

/** Les réactions ne sont pas des données : elles passent, elles ne se stockent pas. */
export const REACTIONS = ["👏", "🔥", "🤯", "❤️", "🙌"] as const;

/**
 * Présence et réactions d'une séance.
 *
 * Deux signaux qui font qu'on se sent à plusieurs, et qu'aucune table ne
 * mérite : le nombre de personnes devant l'écran se déduit de la présence
 * temps réel, et une réaction est diffusée à ceux qui regardent au même
 * moment — l'enregistrer reviendrait à garder la trace d'un applaudissement.
 */
export function useLiveRoom(sessionId: string, userId?: string) {
  const [online, setOnline] = useState(0);
  const [bursts, setBursts] = useState<Burst[]>([]);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const counter = useRef(0);

  const pushBurst = useCallback((emoji: string) => {
    counter.current += 1;
    // Chaque réaction part d'un point différent, sinon elles se superposent
    // en une seule colonne quand plusieurs personnes réagissent ensemble.
    const burst = { id: counter.current, emoji, left: 10 + Math.random() * 70 };
    setBursts((prev) => [...prev.slice(-24), burst]);
    window.setTimeout(() => {
      setBursts((prev) => prev.filter((b) => b.id !== burst.id));
    }, 2600);
  }, []);

  useEffect(() => {
    const key = userId ?? `anon-${Math.random().toString(36).slice(2, 10)}`;
    const channel = supabase.channel(`live-room-${sessionId}`, {
      config: { presence: { key } },
    });

    channel
      .on("presence", { event: "sync" }, () => {
        setOnline(Object.keys(channel.presenceState()).length);
      })
      .on("broadcast", { event: "reaction" }, ({ payload }) => {
        const emoji = (payload as { emoji?: string })?.emoji;
        if (emoji) pushBurst(emoji);
      })
      .subscribe((status) => {
        if (status === "SUBSCRIBED") void channel.track({ at: Date.now() });
      });

    channelRef.current = channel;
    return () => {
      channelRef.current = null;
      void supabase.removeChannel(channel);
    };
  }, [sessionId, userId, pushBurst]);

  const react = useCallback(
    (emoji: string) => {
      // Affichée sans attendre : la diffusion ne se renvoie pas à l'expéditeur.
      pushBurst(emoji);
      void channelRef.current?.send({ type: "broadcast", event: "reaction", payload: { emoji } });
    },
    [pushBurst],
  );

  return { online, bursts, react };
}
