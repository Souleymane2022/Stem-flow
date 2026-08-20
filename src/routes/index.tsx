import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { BrandLogo } from "@/components/brand/BrandLogo";
import { useAuth } from "@/hooks/useAuth";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "STEMFLOW — Apprends les sciences en scrollant" },
      {
        name: "description",
        content:
          "Rejoins STEMFLOW : un fil vertical de vidéos, d'articles et de quiz STEM en français, avec XP, badges et salons de discussion.",
      },
      { property: "og:title", content: "STEMFLOW — Apprends les sciences en scrollant" },
      {
        property: "og:description",
        content:
          "Rejoins STEMFLOW : un fil vertical de vidéos, d'articles et de quiz STEM en français, avec XP, badges et salons de discussion.",
      },
    ],
  }),
  component: SplashPage,
});

function SplashPage() {
  const navigate = useNavigate();
  const { session, profile, loading } = useAuth();
  const [step, setStep] = useState(0);

  useEffect(() => {
    const timers = [
      setTimeout(() => setStep(1), 700),
      setTimeout(() => setStep(2), 1400),
      setTimeout(() => setStep(3), 2200),
    ];
    return () => timers.forEach(clearTimeout);
  }, []);

  useEffect(() => {
    if (step < 3 || loading) return;
    if (!session) navigate({ to: "/auth" });
    else if (!profile?.onboarding_completed) navigate({ to: "/onboarding" });
    else navigate({ to: "/feed" });
  }, [step, loading, session, profile, navigate]);

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center bg-background px-6">
      <motion.div
        className="flex flex-col items-center gap-4"
        initial={{ scale: 0.4, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: "spring", stiffness: 120, damping: 12 }}
      >
        <BrandLogo className="h-24 md:h-28" />
      </motion.div>

      <motion.p
        className="mt-5 text-sm font-semibold tracking-[0.35em] text-muted-foreground"
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: step >= 1 ? 1 : 0, y: step >= 1 ? 0 : 12 }}
        transition={{ duration: 0.5 }}
      >
        SCROLL. LEARN. LEVEL UP.
      </motion.p>

      <motion.div
        className="mt-10 h-1 w-40 overflow-hidden rounded-full bg-surface-2"
        initial={{ opacity: 0 }}
        animate={{ opacity: step >= 2 ? 1 : 0 }}
      >
        <motion.div
          className="h-full bg-gradient-brand"
          initial={{ width: "0%" }}
          animate={{ width: step >= 2 ? "100%" : "0%" }}
          transition={{ duration: 0.8 }}
        />
      </motion.div>
    </main>
  );
}
