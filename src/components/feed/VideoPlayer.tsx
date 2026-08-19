import { useEffect, useRef, useState } from "react";

import { youtubeThumbnail } from "@/utils/youtube";

type Props = {
  videoId: string;
  onPlayerReady?: ((player: YouTubePlayerLike) => void) | undefined;
  /** Appelé quand l'iframe est détruite, pour purger les références côté fil. */
  onPlayerDestroy?: (() => void) | undefined;
};

export type YouTubePlayerLike = {
  playVideo: () => void;
  pauseVideo: () => void;
  mute: () => void;
  unMute: () => void;
  isMuted: () => boolean;
  /** Utilisées par les cours pour mesurer le temps réellement visionné. */
  getCurrentTime?: () => number;
  getDuration?: () => number;
  getPlayerState?: () => number;
};

let apiPromise: Promise<void> | null = null;

function loadApi(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  const w = window as unknown as { YT?: { Player: unknown }; onYouTubeIframeAPIReady?: () => void };
  if (w.YT?.Player) return Promise.resolve();
  if (apiPromise) return apiPromise;
  apiPromise = new Promise<void>((resolve) => {
    const previous = w.onYouTubeIframeAPIReady;
    w.onYouTubeIframeAPIReady = () => {
      previous?.();
      resolve();
    };
    const script = document.createElement("script");
    script.src = "https://www.youtube.com/iframe_api";
    document.head.appendChild(script);
  });
  return apiPromise;
}

export function VideoPlayer({ videoId, onPlayerReady, onPlayerDestroy }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const readyRef = useRef(onPlayerReady);
  readyRef.current = onPlayerReady;
  const destroyRef = useRef(onPlayerDestroy);
  destroyRef.current = onPlayerDestroy;
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let destroyed = false;
    let player: { destroy: () => void } | null = null;
    setReady(false);

    void loadApi().then(() => {
      if (destroyed || !hostRef.current) return;
      const YT = (
        window as unknown as { YT: { Player: new (el: Element, opts: unknown) => unknown } }
      ).YT;
      // YT.Player ne s'insère pas dans l'élément fourni : il le REMPLACE par une
      // iframe. Lui passer un nœud géré par React rendait ensuite le démontage
      // impossible — React cherchait à retirer un nœud qui n'existait plus, et
      // l'arbre plantait. On lui donne donc un enfant jetable, créé hors de React.
      const slot = document.createElement("div");
      slot.style.width = "100%";
      slot.style.height = "100%";
      hostRef.current.appendChild(slot);

      player = new YT.Player(slot, {
        videoId,
        width: "100%",
        height: "100%",
        playerVars: {
          enablejsapi: 1,
          rel: 0,
          modestbranding: 1,
          controls: 1,
          playsinline: 1,
          mute: 1,
        },
        events: {
          onReady: (event: { target: YouTubePlayerLike }) => {
            setReady(true);
            readyRef.current?.(event.target);
          },
        },
      }) as unknown as { destroy: () => void };
    });

    return () => {
      destroyed = true;
      try {
        player?.destroy();
      } catch {
        /* noop */
      }
      // Si destroy() a échoué, l'iframe résiduelle est retirée à la main : le
      // conteneur doit être vide avant que React ne reprenne la main dessus.
      if (hostRef.current) hostRef.current.replaceChildren();
      destroyRef.current?.();
    };
  }, [videoId]);

  return (
    <div className="relative h-full w-full bg-black">
      {/* Vignette affichée le temps que l'iframe s'initialise, pour éviter un écran noir. */}
      {!ready && (
        <img
          src={youtubeThumbnail(videoId)}
          alt=""
          aria-hidden="true"
          decoding="async"
          className="absolute inset-0 h-full w-full object-cover opacity-70"
        />
      )}
      <div ref={hostRef} className="relative h-full w-full" />
    </div>
  );
}
