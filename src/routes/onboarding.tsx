import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Check, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { CATEGORIES, CATEGORY_META } from "@/lib/categories";
import { InfinityMark } from "@/components/brand/InfinityMark";

export const Route = createFileRoute("/onboarding")({
  head: () => ({
    meta: [
      { title: "Personnalise ton fil — STEMFLOW" },
      {
        name: "description",
        content: "Choisis ta langue, ton niveau d'études et tes centres d'intérêt STEM pour un fil sur mesure.",
      },
      { property: "og:title", content: "Personnalise ton fil — STEMFLOW" },
      { property: "og:description", content: "4 étapes pour un fil STEM adapté à ton niveau." },
    ],
  }),
  component: OnboardingPage,
});

const LANGUAGES = [
  { value: "fr", label: "Français", flag: "🇫🇷" },
  { value: "en", label: "English", flag: "🇬🇧" },
];

const EDUCATION = [
  { value: "college", label: "Collège", emoji: "📗" },
  { value: "lycee", label: "Lycée", emoji: "📘" },
  { value: "universite", label: "Université", emoji: "🎓" },
  { value: "autodidacte", label: "Autodidacte", emoji: "🚀" },
];

const LEVELS = [
  { value: "debutant", label: "Débutant", description: "Je découvre les sciences" },
  { value: "intermediaire", label: "Intermédiaire", description: "J'ai déjà des bases solides" },
  { value: "avance", label: "Avancé", description: "Je veux aller plus loin" },
];

function OnboardingPage() {
  const navigate = useNavigate();
  const { session, profile, loading, refreshProfile } = useAuth();
  const [step, setStep] = useState(0);
  const [language, setLanguage] = useState("fr");
  const [education, setEducation] = useState("");
  const [interests, setInterests] = useState<string[]>([]);
  const [level, setLevel] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (loading) return;
    if (!session) navigate({ to: "/auth" });
    else if (profile?.onboarding_completed) navigate({ to: "/feed" });
  }, [session, profile, loading, navigate]);

  const steps = ["Langue", "Études", "Intérêts", "Niveau"];
  const canContinue = [true, !!education, interests.length > 0, !!level][step];

  const finish = async () => {
    if (!session) return;
    setBusy(true);
    const { error } = await supabase
      .from("profiles")
      .update({
        preferred_language: language,
        education_level: education,
        interests,
        bio: level,
        onboarding_completed: true,
      })
      .eq("id", session.user.id);
    setBusy(false);
    if (error) {
      toast.error("Impossible d'enregistrer tes préférences.");
      return;
    }
    await refreshProfile();
    toast.success("Ton fil est prêt 🎉");
    navigate({ to: "/feed" });
  };

  return (
    <main className="flex min-h-dvh flex-col bg-background px-6 py-8">
      <div className="mx-auto w-full max-w-lg">
        <div className="flex items-center gap-3">
          <InfinityMark className="h-8 w-8" />
          <div className="flex flex-1 gap-1.5">
            {steps.map((s, i) => (
              <div key={s} className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-2">
                <div
                  className="h-full bg-gradient-brand transition-all duration-500"
                  style={{ width: i <= step ? "100%" : "0%" }}
                />
              </div>
            ))}
          </div>
        </div>

        <motion.div key={step} initial={{ opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }} className="mt-10">
          {step === 0 && (
            <Section title="Quelle langue préfères-tu ?" subtitle="Tu pourras la changer plus tard.">
              {LANGUAGES.map((l) => (
                <Option key={l.value} selected={language === l.value} onClick={() => setLanguage(l.value)}>
                  <span className="text-xl">{l.flag}</span> {l.label}
                </Option>
              ))}
            </Section>
          )}

          {step === 1 && (
            <Section title="Où en es-tu dans tes études ?" subtitle="Pour adapter la difficulté des contenus.">
              {EDUCATION.map((e) => (
                <Option key={e.value} selected={education === e.value} onClick={() => setEducation(e.value)}>
                  <span className="text-xl">{e.emoji}</span> {e.label}
                </Option>
              ))}
            </Section>
          )}

          {step === 2 && (
            <Section title="Qu'est-ce qui te passionne ?" subtitle="Choisis au moins un domaine.">
              <div className="grid grid-cols-2 gap-2.5">
                {CATEGORIES.map((name) => {
                  const c = CATEGORY_META[name];
                  const active = interests.includes(name);
                  return (
                    <button
                      key={name}
                      onClick={() =>
                        setInterests((prev) =>
                          active ? prev.filter((i) => i !== name) : [...prev, name],
                        )
                      }
                      className={`rounded-2xl border p-4 text-left transition-colors ${
                        active ? `${c.bg} ${c.border}` : "border-border bg-surface-2"
                      }`}
                    >
                      <span className="text-2xl">{c.emoji}</span>
                      <p className={`mt-2 text-sm font-bold ${active ? c.text : "text-foreground"}`}>{name}</p>
                    </button>
                  );
                })}
              </div>
            </Section>
          )}

          {step === 3 && (
            <Section title="Ton niveau en sciences ?" subtitle="On calibrera tes quiz et tes missions.">
              {LEVELS.map((l) => (
                <Option key={l.value} selected={level === l.value} onClick={() => setLevel(l.value)}>
                  <span className="flex flex-col">
                    <span>{l.label}</span>
                    <span className="text-xs font-medium text-muted-foreground">{l.description}</span>
                  </span>
                </Option>
              ))}
            </Section>
          )}
        </motion.div>
      </div>

      <div className="mx-auto mt-auto flex w-full max-w-lg gap-3 pt-8">
        {step > 0 && (
          <button
            onClick={() => setStep(step - 1)}
            className="rounded-xl border border-border bg-surface-2 px-5 py-3.5 text-sm font-bold"
          >
            Retour
          </button>
        )}
        <button
          onClick={() => (step === 3 ? finish() : setStep(step + 1))}
          disabled={!canContinue || busy}
          className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-gradient-brand py-3.5 text-sm font-black text-primary-foreground disabled:opacity-40"
        >
          {step === 3 ? "Découvrir mon fil" : "Continuer"}
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
    </main>
  );
}

function Section({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <h1 className="text-3xl">{title}</h1>
      <p className="mt-2 text-sm text-muted-foreground">{subtitle}</p>
      <div className="mt-6 space-y-2.5">{children}</div>
    </div>
  );
}

function Option({
  children,
  selected,
  onClick,
}: {
  children: React.ReactNode;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex w-full items-center justify-between rounded-2xl border px-4 py-4 text-left text-sm font-bold transition-colors ${
        selected ? "border-primary bg-primary/10 text-primary" : "border-border bg-surface-2 hover:border-primary/40"
      }`}
    >
      <span className="flex items-center gap-3">{children}</span>
      {selected && <Check className="h-4 w-4" />}
    </button>
  );
}
