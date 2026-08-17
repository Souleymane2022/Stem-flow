import { useEffect, useRef } from "react";

type Props = {
  videoId: string;
  onPlayerReady?: ((player: YouTubePlayerLike) => void) | undefined;
};

export type YouTubePlayerLike = {
  playVideo: () => void;
  pauseVideo: () => void;
  mute: () => void;
  unMute: () => void;
  isMuted: () => boolean;
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

export function VideoPlayer({ videoId, onPlayerReady }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const readyRef = useRef(onPlayerReady);
  readyRef.current = onPlayerReady;

  useEffect(() => {
    let destroyed = false;
    let player: { destroy: () => void } | null = null;

    void loadApi().then(() => {
      if (destroyed || !hostRef.current) return;
      const YT = (window as unknown as { YT: { Player: new (el: Element, opts: unknown) => unknown } }).YT;
      player = new YT.Player(hostRef.current, {
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
    };
  }, [videoId]);

  return (
    <div className="h-full w-full bg-black">
      <div ref={hostRef} className="h-full w-full" />
    </div>
  );
}
