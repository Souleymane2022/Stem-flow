import { useEffect, useState } from "react";
import { X, Check, ChevronRight, XCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useI18n } from "@/lib/i18n";
import { useXpPopup } from "@/components/gamification/XpPopup";
import { XP_REWARDS } from "@/lib/xp";

type Question = {
  id: string;
  question: string;
  options: string[];
  correct_option_index: number;
  explanation: string | null;
};

export function QuizModal({ contentId, onClose }: { contentId: string; onClose: () => void }) {
  const { profile, awardXp } = useAuth();
  const pushXp = useXpPopup();
  const { t } = useI18n();
  const [questions, setQuestions] = useState<Question[]>([]);
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<number[]>([]);
  const [selected, setSelected] = useState<number | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [finished, setFinished] = useState(false);
  const [loading, setLoading] = useState(true);
  const [rewarded, setRewarded] = useState(true);

  useEffect(() => {
    let active = true;
    supabase
      .from("quiz_questions")
      .select("id,question,options,correct_option_index,explanation")
      .eq("content_id", contentId)
      .order("sort_order")
      .then(({ data }) => {
        if (active) {
          setQuestions((data as Question[]) ?? []);
          setLoading(false);
        }
      });
    return () => {
      active = false;
    };
  }, [contentId]);

  const current = questions[index];
  const score = answers.filter((a, i) => a === questions[i]?.correct_option_index).length;

  const next = async () => {
    if (selected === null || !current) return;

    if (!revealed) {
      setRevealed(true);
      return;
    }

    const nextAnswers = [...answers, selected];
    setAnswers(nextAnswers);
    setSelected(null);
    setRevealed(false);

    if (index + 1 < questions.length) {
      setIndex(index + 1);
      return;
    }

    setFinished(true);
    const finalScore = nextAnswers.filter(
      (a, i) => a === questions[i]?.correct_option_index,
    ).length;
    if (!profile) return;

    // L'XP n'est accordé qu'à la première tentative : sans ce contrôle, rouvrir
    // le même quiz en boucle permettait d'accumuler de l'XP indéfiniment.
    const { count: previous } = await supabase
      .from("quiz_attempts")
      .select("id", { count: "exact", head: true })
      .eq("user_id", profile.id)
      .eq("content_id", contentId);

    await supabase.from("quiz_attempts").insert({
      user_id: profile.id,
      content_id: contentId,
      answers: nextAnswers,
      score: finalScore,
      total_questions: questions.length,
    });

    if ((previous ?? 0) > 0) {
      setRewarded(false);
      return;
    }
    const gain =
      XP_REWARDS.quizPass + (finalScore === questions.length ? XP_REWARDS.quizPerfect : 0);
    await awardXp(gain);
    pushXp(gain);
    setRewarded(true);
  };

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/80 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-3xl border border-border bg-elevated p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-5 flex items-center justify-between">
          <p className="label-xs">
            {finished
              ? t("quiz.result")
              : t("quiz.progress", {
                  current: Math.min(index + 1, questions.length),
                  total: questions.length,
                })}
          </p>
          <button
            onClick={onClose}
            aria-label={t("common.close")}
            className="text-muted-foreground hover:text-foreground"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {loading && <p className="text-sm text-muted-foreground">{t("quiz.loading")}</p>}

        {/* Sans ce cas, un quiz sans question affichait une fenêtre vide et
            « Question 0 / 0 », sans aucun moyen d'avancer. */}
        {!loading && questions.length === 0 && (
          <div className="py-8 text-center">
            <p className="text-4xl">🧪</p>
            <p className="mt-3 text-sm text-muted-foreground">{t("quiz.emptyTitle")}</p>
            <button
              onClick={onClose}
              className="mt-6 w-full rounded-xl bg-gradient-brand py-3 text-sm font-black text-primary-foreground"
            >
              {t("quiz.backToFeed")}
            </button>
          </div>
        )}

        {!loading && !finished && current && (
          <>
            <div className="mb-5 h-1.5 overflow-hidden rounded-full bg-surface-2">
              <div
                className="h-full bg-gradient-brand transition-all duration-500"
                style={{ width: `${((index + (revealed ? 1 : 0)) / questions.length) * 100}%` }}
              />
            </div>
            <h3 className="text-lg font-extrabold">{current.question}</h3>
            <div className="mt-5 space-y-2.5">
              {current.options.map((option, i) => {
                const isCorrect = i === current.correct_option_index;
                const state = revealed
                  ? isCorrect
                    ? "border-primary bg-primary/15 text-primary"
                    : selected === i
                      ? "border-destructive bg-destructive/15 text-destructive"
                      : "border-border bg-surface-2 opacity-60"
                  : selected === i
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border bg-surface-2 hover:border-primary/40";
                return (
                  <button
                    key={option}
                    disabled={revealed}
                    onClick={() => setSelected(i)}
                    className={`flex w-full items-center justify-between gap-3 rounded-xl border px-4 py-3 text-left text-sm font-semibold transition-all ${state}`}
                  >
                    {option}
                    {revealed && isCorrect && <Check className="h-4 w-4 shrink-0" />}
                    {revealed && !isCorrect && selected === i && (
                      <XCircle className="h-4 w-4 shrink-0" />
                    )}
                    {!revealed && selected === i && <Check className="h-4 w-4 shrink-0" />}
                  </button>
                );
              })}
            </div>

            {revealed && (
              <div className="mt-4 rounded-xl border border-border bg-surface-2 p-3">
                <p
                  className={`text-sm font-black ${
                    selected === current.correct_option_index ? "text-primary" : "text-destructive"
                  }`}
                >
                  {selected === current.correct_option_index
                    ? t("quiz.correct")
                    : t("quiz.incorrect")}
                </p>
                {current.explanation && (
                  <p className="mt-1 text-xs text-muted-foreground">{current.explanation}</p>
                )}
              </div>
            )}

            <button
              onClick={next}
              disabled={selected === null}
              className="mt-6 flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-brand py-3 text-sm font-black text-primary-foreground disabled:opacity-40"
            >
              {!revealed
                ? t("quiz.validate")
                : index + 1 === questions.length
                  ? t("quiz.finish")
                  : t("quiz.next")}
              <ChevronRight className="h-4 w-4" />
            </button>
          </>
        )}

        {finished && (
          <div className="py-6 text-center">
            <p className="text-5xl">
              {score === questions.length ? "🏆" : score > questions.length / 2 ? "🎉" : "💪"}
            </p>
            <h3 className="mt-4 text-2xl font-black">
              {t("quiz.score", { score, total: questions.length })}
            </h3>
            <p className="mt-1 text-sm text-primary">
              {rewarded
                ? t("quiz.xpGained", {
                    count:
                      XP_REWARDS.quizPass +
                      (score === questions.length ? XP_REWARDS.quizPerfect : 0),
                  })
                : t("quiz.alreadyDone")}
            </p>
            <div className="mt-6 space-y-3 text-left">
              {questions.map((q, i) => (
                <div key={q.id} className="rounded-xl border border-border bg-surface-2 p-3">
                  <p className="text-xs font-bold">{q.question}</p>
                  <p
                    className={`mt-1 text-xs ${
                      answers[i] === q.correct_option_index ? "text-primary" : "text-destructive"
                    }`}
                  >
                    {t("quiz.answer", { answer: q.options[q.correct_option_index] ?? "" })}
                  </p>
                  {q.explanation && (
                    <p className="mt-1 text-xs text-muted-foreground">{q.explanation}</p>
                  )}
                </div>
              ))}
            </div>
            <button
              onClick={onClose}
              className="mt-6 w-full rounded-xl bg-gradient-brand py-3 text-sm font-black text-primary-foreground"
            >
              {t("quiz.backToFeed")}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
