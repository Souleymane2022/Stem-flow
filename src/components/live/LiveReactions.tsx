import { AnimatePresence, motion } from "framer-motion";

import { REACTIONS, type Burst } from "@/components/live/useLiveRoom";

/** Les réactions qui montent devant la vidéo. */
export function ReactionLayer({ bursts }: { bursts: Burst[] }) {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      <AnimatePresence>
        {bursts.map((burst) => (
          <motion.span
            key={burst.id}
            className="absolute bottom-2 text-3xl"
            style={{ left: `${burst.left}%` }}
            initial={{ y: 0, opacity: 0, scale: 0.6 }}
            animate={{
              y: -180,
              opacity: [0, 1, 1, 0],
              scale: 1.1,
              rotate: burst.id % 2 ? 12 : -12,
            }}
            exit={{ opacity: 0 }}
            transition={{ duration: 2.4, ease: "easeOut" }}
          >
            {burst.emoji}
          </motion.span>
        ))}
      </AnimatePresence>
    </div>
  );
}

/** La rangée de boutons, sous la vidéo. */
export function ReactionBar({ onReact }: { onReact: (emoji: string) => void }) {
  return (
    <div className="mt-3 flex flex-wrap gap-2">
      {REACTIONS.map((emoji) => (
        <button
          key={emoji}
          type="button"
          onClick={() => onReact(emoji)}
          aria-label={emoji}
          className="flex h-10 w-10 items-center justify-center rounded-full border border-border bg-surface-2 text-lg transition-transform active:scale-90"
        >
          {emoji}
        </button>
      ))}
    </div>
  );
}
