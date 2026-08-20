import { useEffect, useState } from "react";
import { motion } from "framer-motion";

import { BrandLogo } from "@/components/brand/BrandLogo";
import { useI18n } from "@/lib/i18n";

/**
 * Ouverture de marque affichée avant la lecture d'une vidéo du fil.
 *
 * Le lecteur YouTube n'est monté qu'après : rien ne charge ni ne joue derrière
 * l'écran, ce qui évite un son qui démarre sous le voile et économise la
 * bande passante si la personne passe au contenu suivant.
 */
const DURATION_MS = 5000;
/** Le bouton « Passer » n'apparaît qu'après ce délai, pour laisser le message. */
const SKIP_AFTER_MS = 2000;

export function BrandSplash({ onDone }: { onDone: () => void }) {
  const { t } = useI18n();
  const [remaining, setRemaining] = useState(Math.round(DURATION_MS / 1000));
  const [canSkip, setCanSkip] = useState(false);

  useEffect(() => {
    const skip = setTimeout(() => setCanSkip(true), SKIP_AFTER_MS);
    const tick = setInterval(() => setRemaining((r) => Math.max(0, r - 1)), 1000);
    const end = setTimeout(onDone, DURATION_MS);
    return () => {
      clearTimeout(skip);
      clearInterval(tick);
      clearTimeout(end);
    };
  }, [onDone]);

  return (
    <div className="absolute inset-0 z-40 flex flex-col items-center justify-center overflow-hidden bg-background">
      {/* Halos de marque, repris des deux teintes du logo. */}
      <motion.div
        aria-hidden="true"
        initial={{ scale: 0.6, opacity: 0 }}
        animate={{ scale: 1.15, opacity: 0.5 }}
        transition={{ duration: 2.4, ease: "easeOut" }}
        className="pointer-events-none absolute -top-24 start-1/4 h-72 w-72 rounded-full bg-[#8CC63F] blur-[120px]"
      />
      <motion.div
        aria-hidden="true"
        initial={{ scale: 0.6, opacity: 0 }}
        animate={{ scale: 1.15, opacity: 0.5 }}
        transition={{ duration: 2.4, delay: 0.3, ease: "easeOut" }}
        className="pointer-events-none absolute -bottom-24 end-1/4 h-72 w-72 rounded-full bg-[#0FA3E0] blur-[120px]"
      />

      <motion.div
        initial={{ opacity: 0, y: 18, scale: 0.94 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.7, ease: "easeOut" }}
        className="relative flex flex-col items-center px-8 text-center"
      >
        <BrandLogo className="h-20 md:h-24" />

        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.6, duration: 0.6 }}
          className="mt-7 text-lg font-black leading-tight text-foreground md:text-2xl"
        >
          {t("splash.method")}
        </motion.p>
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.9, duration: 0.6 }}
          className="mt-1 text-3xl font-black text-gradient-brand md:text-4xl"
        >
          {t("splash.scroll")}
        </motion.p>
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1.2, duration: 0.6 }}
          className="mt-4 text-[11px] font-semibold tracking-[0.35em] text-muted-foreground"
        >
          {t("brand.tagline").toUpperCase()}
        </motion.p>
      </motion.div>

      {/* Décompte : une barre qui se vide, plus lisible qu'un simple chiffre. */}
      <div className="absolute inset-x-0 bottom-0">
        <motion.div
          initial={{ width: "100%" }}
          animate={{ width: "0%" }}
          transition={{ duration: DURATION_MS / 1000, ease: "linear" }}
          className="h-1 bg-gradient-brand"
        />
      </div>

      <div className="absolute end-4 top-4 flex items-center gap-2">
        <span className="rounded-full bg-background/70 px-2.5 py-1 text-xs font-bold tabular text-muted-foreground backdrop-blur">
          {remaining}s
        </span>
        {canSkip && (
          <motion.button
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            type="button"
            onClick={onDone}
            className="rounded-full border border-border bg-background/70 px-3 py-1 text-xs font-bold text-foreground backdrop-blur"
          >
            {t("splash.skip")}
          </motion.button>
        )}
      </div>
    </div>
  );
}
