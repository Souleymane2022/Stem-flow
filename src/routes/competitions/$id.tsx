import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, Crown, Loader2, Swords, Timer, Trophy, Users } from "lucide-react";
import { motion } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/layout/AppShell";
import { categoryMeta } from "@/lib/categories";
import { useAuth } from "@/hooks/useAuth";
import { generateCompetitionQuestions } from "@/lib/competitions.functions";
import { toast } from "sonner";

export const Route = createFileRoute("/competitions/$id")({
  head: () => ({
    meta: [
      { title: "Défi STEM en direct — STEMFLOW" },
      { name: "description", content: "Rejoins ce défi STEM, réponds plus vite que les autres et grimpe au classement." },
      { property: "og:title", content: "Défi STEM en direct — STEMFLOW" },
      { property: "og:description", content: "Affronte la communauté sur une notion précise et gagne de l'XP." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: CompetitionRoom,
});

type Competition = {
  id: string;
  host_id: string;
  host_name: string | null;
  topic: string;
  category: string;
  difficulty: string;
  question_count: number;
  seconds_per_question: number;
  status: string;
  xp_reward: number;
};

type Question = {
  id: string;
  question: string;
  options: string[];
  correct_option_index: number;
  explanation: string | null;
  sort_order: number;
};

type Participant = {
  user_id: string;
  username: string | null;
  score: number;
  correct_count: number;
  answered_count: number;
  finished: boolean;
};

function CompetitionRoom() {
  const { id } = Route.useParams();
  const { user, profile, awardXp } = useAuth();
  const navigate = useNavigate();
  const generate = useServerFn(generateCompetitionQuestions);

  const [comp, setComp] = useState<Competition | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);

  // état de jeu local
  const [index, setIndex] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [score, setScore] = useState(0);
  const [correct, setCorrect] = useState(0);
  const [timeLeft, setTimeLeft] = useState(0);
  const [playing, setPlaying] = useState(false);
  const scoreRef = useRef(0);

  const me = participants.find((p) => p.user_id === user?.id);
  const meta = categoryMeta(comp?.category);

  const loadAll = useCallback(async () => {
    const [{ data: c }, { data: p }] = await Promise.all([
      supabase.from("competitions").select("*").eq("id", id).maybeSingle(),
      supabase
        .from("competition_participants")
        .select("user_id,username,score,correct_count,answered_count,finished")
        .eq("competition_id", id)
        .order("score", { ascending: false }),
    ]);
    setComp((c as Competition) ?? null);
    setParticipants((p as Participant[]) ?? []);
    setLoading(false);
  }, [id]);

  useEffect(() => {
    void loadAll();
    const channel = supabase
      .channel(`competition-${id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "competitions", filter: `id=eq.${id}` }, () =>
        void loadAll(),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "competition_participants", filter: `competition_id=eq.${id}` },
        () => void loadAll(),
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [id, loadAll]);

  const loadQuestions = useCallback(async () => {
    const { data } = await supabase
      .from("competition_questions")
      .select("id,question,options,correct_option_index,explanation,sort_order")
      .eq("competition_id", id)
      .order("sort_order");
    const list = (data as Question[]) ?? [];
    setQuestions(list);
    return list;
  }, [id]);

  useEffect(() => {
    if (comp?.status === "running" || comp?.status === "finished") void loadQuestions();
  }, [comp?.status, loadQuestions]);

  const join = async () => {
    if (!user || !profile) {
      toast.error("Connecte-toi pour rejoindre le défi");
      return;
    }
    const { error } = await supabase.from("competition_participants").insert({
      competition_id: id,
      user_id: user.id,
      username: profile.username,
      avatar_url: profile.profile_image_url,
    });
    if (error) toast.error("Impossible de rejoindre");
    else void loadAll();
  };

  const startCompetition = async () => {
    if (!comp || !user || comp.host_id !== user.id) return;
    setStarting(true);
    try {
      await generate({ data: { competitionId: comp.id } });
      await supabase
        .from("competitions")
        .update({ status: "running", started_at: new Date().toISOString() })
        .eq("id", comp.id);
      await loadQuestions();
      await loadAll();
      toast.success("Le défi est lancé !");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Génération impossible");
    } finally {
      setStarting(false);
    }
  };

  const beginPlay = async () => {
    const list = questions.length ? questions : await loadQuestions();
    if (!list.length) {
      toast.error("Questions indisponibles");
      return;
    }
    setIndex(0);
    setScore(0);
    scoreRef.current = 0;
    setCorrect(0);
    setSelected(null);
    setRevealed(false);
    setTimeLeft(comp?.seconds_per_question ?? 20);
    setPlaying(true);
  };

  const current = questions[index];

  const answer = useCallback(
    (choice: number | null) => {
      if (revealed || !current || !comp) return;
      setSelected(choice);
      setRevealed(true);
      if (choice !== null && choice === current.correct_option_index) {
        const bonus = Math.round((timeLeft / (comp.seconds_per_question || 20)) * 50);
        const gained = 100 + Math.max(bonus, 0);
        scoreRef.current += gained;
        setScore(scoreRef.current);
        setCorrect((c) => c + 1);
      }
    },
    [revealed, current, comp, timeLeft],
  );

  // Timer
  useEffect(() => {
    if (!playing || revealed || !current) return;
    if (timeLeft <= 0) {
      answer(null);
      return;
    }
    const t = setTimeout(() => setTimeLeft((v) => v - 1), 1000);
    return () => clearTimeout(t);
  }, [playing, revealed, timeLeft, current, answer]);

  const nextQuestion = async () => {
    if (index + 1 < questions.length) {
      setIndex((i) => i + 1);
      setSelected(null);
      setRevealed(false);
      setTimeLeft(comp?.seconds_per_question ?? 20);
      return;
    }
    // Fin
    setPlaying(false);
    if (user) {
      await supabase
        .from("competition_participants")
        .update({
          score: scoreRef.current,
          correct_count: correct,
          answered_count: questions.length,
          finished: true,
          finished_at: new Date().toISOString(),
        })
        .eq("competition_id", id)
        .eq("user_id", user.id);
      const xp = Math.max(20, Math.round((correct / Math.max(questions.length, 1)) * (comp?.xp_reward ?? 60)));
      await awardXp(xp);
      toast.success(`Défi terminé ! +${xp} XP`);
    }
    void loadAll();
  };

  const ranking = useMemo(
    () => [...participants].sort((a, b) => b.score - a.score || b.correct_count - a.correct_count),
    [participants],
  );

  if (loading) {
    return (
      <AppShell>
        <div className="p-8 text-sm text-muted-foreground">Chargement du défi…</div>
      </AppShell>
    );
  }

  if (!comp) {
    return (
      <AppShell>
        <div className="p-8">
          <p className="text-sm text-muted-foreground">Ce défi n'existe plus.</p>
          <Link to="/competitions" className="mt-3 inline-block text-sm text-primary">
            Retour aux compétitions
          </Link>
        </div>
      </AppShell>
    );
  }

  const isHost = user?.id === comp.host_id;

  return (
    <AppShell>
      <div className="mx-auto max-w-3xl px-4 py-6 md:px-8 md:py-10">
        <button
          type="button"
          onClick={() => void navigate({ to: "/competitions" })}
          className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> Compétitions
        </button>

        <div className={`mt-4 rounded-2xl border ${meta.border} bg-gradient-to-br ${meta.gradient} p-5`}>
          <span className={`rounded-full ${meta.bg} px-2 py-0.5 text-[11px] font-bold ${meta.text}`}>
            {meta.emoji} {comp.category}
          </span>
          <h1 className="mt-2 text-2xl font-black leading-tight">{comp.topic}</h1>
          <p className="mt-1 text-xs text-muted-foreground">
            Hôte : {comp.host_name ?? "un membre"} · {comp.question_count} questions · {comp.seconds_per_question}s par
            question
          </p>
        </div>

        {/* Zone de jeu */}
        {playing && current ? (
          <div className="mt-6 rounded-2xl border border-border bg-surface p-5">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>
                Question {index + 1}/{questions.length}
              </span>
              <span className="flex items-center gap-1 font-bold text-primary">
                <Timer className="h-3.5 w-3.5" /> {timeLeft}s
              </span>
            </div>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-2">
              <div
                className="h-full bg-gradient-brand transition-all duration-1000"
                style={{ width: `${(timeLeft / (comp.seconds_per_question || 20)) * 100}%` }}
              />
            </div>

            <p className="mt-4 text-lg font-bold">{current.question}</p>

            <div className="mt-4 space-y-2">
              {current.options.map((option, i) => {
                const isCorrect = i === current.correct_option_index;
                const isPicked = selected === i;
                const state = !revealed
                  ? "border-border bg-surface-2 hover:border-primary"
                  : isCorrect
                    ? "border-primary bg-primary/15 text-primary"
                    : isPicked
                      ? "border-destructive bg-destructive/15 text-destructive"
                      : "border-border bg-surface-2 opacity-60";
                return (
                  <button
                    key={option}
                    type="button"
                    disabled={revealed}
                    onClick={() => answer(i)}
                    className={`w-full rounded-xl border px-4 py-3 text-left text-sm font-semibold transition-colors ${state}`}
                  >
                    {option}
                  </button>
                );
              })}
            </div>

            {revealed && (
              <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="mt-4">
                {current.explanation && (
                  <p className="rounded-xl border border-border bg-surface-2 p-3 text-sm text-muted-foreground">
                    {current.explanation}
                  </p>
                )}
                <div className="mt-3 flex items-center justify-between">
                  <span className="text-sm font-bold tabular">{score} pts</span>
                  <button
                    type="button"
                    onClick={() => void nextQuestion()}
                    className="rounded-xl bg-gradient-brand px-5 py-2.5 text-sm font-bold text-background"
                  >
                    {index + 1 < questions.length ? "Question suivante" : "Terminer"}
                  </button>
                </div>
              </motion.div>
            )}
          </div>
        ) : (
          <div className="mt-6 rounded-2xl border border-border bg-surface p-5">
            {comp.status === "lobby" && (
              <>
                <p className="text-sm text-muted-foreground">
                  Le défi attend les participants. L'hôte lance la partie quand tout le monde est prêt.
                </p>
                {!me ? (
                  <button
                    type="button"
                    onClick={() => void join()}
                    className="mt-3 w-full rounded-xl bg-gradient-brand py-2.5 text-sm font-bold text-background"
                  >
                    Rejoindre le défi
                  </button>
                ) : (
                  <p className="mt-3 text-sm font-semibold text-primary">Tu es inscrit ✅</p>
                )}
                {isHost && (
                  <button
                    type="button"
                    onClick={() => void startCompetition()}
                    disabled={starting}
                    className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl border border-primary py-2.5 text-sm font-bold text-primary disabled:opacity-60"
                  >
                    {starting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Swords className="h-4 w-4" />}
                    {starting ? "Préparation des questions…" : "Lancer la compétition"}
                  </button>
                )}
              </>
            )}

            {comp.status !== "lobby" && (
              <>
                {!me && (
                  <button
                    type="button"
                    onClick={() => void join()}
                    className="mb-3 w-full rounded-xl border border-primary py-2.5 text-sm font-bold text-primary"
                  >
                    Rejoindre et jouer
                  </button>
                )}
                {me?.finished ? (
                  <p className="text-sm font-semibold">
                    Ton score : <span className="text-primary tabular">{me.score} pts</span> · {me.correct_count}/
                    {comp.question_count} bonnes réponses
                  </p>
                ) : (
                  me && (
                    <button
                      type="button"
                      onClick={() => void beginPlay()}
                      className="w-full rounded-xl bg-gradient-brand py-2.5 text-sm font-bold text-background"
                    >
                      Commencer mes questions
                    </button>
                  )
                )}
                {isHost && comp.status === "running" && (
                  <button
                    type="button"
                    onClick={() =>
                      void supabase
                        .from("competitions")
                        .update({ status: "finished", finished_at: new Date().toISOString() })
                        .eq("id", comp.id)
                    }
                    className="mt-2 w-full rounded-xl border border-border py-2.5 text-sm font-semibold text-muted-foreground"
                  >
                    Clôturer le défi
                  </button>
                )}
              </>
            )}
          </div>
        )}

        {/* Classement */}
        <h2 className="mt-8 flex items-center gap-2 text-base font-bold">
          <Trophy className="h-4 w-4 text-primary" /> Classement en direct
        </h2>
        <div className="mt-3 space-y-2">
          {ranking.length === 0 && <p className="text-sm text-muted-foreground">Aucun participant pour l'instant.</p>}
          {ranking.map((p, i) => (
            <div
              key={p.user_id}
              className={`flex items-center gap-3 rounded-xl border px-4 py-3 ${
                p.user_id === user?.id ? "border-primary bg-primary/10" : "border-border bg-surface"
              }`}
            >
              <span className="w-6 text-center text-sm font-black tabular text-muted-foreground">
                {i === 0 ? <Crown className="mx-auto h-4 w-4 text-primary" /> : i + 1}
              </span>
              <span className="flex-1 truncate text-sm font-semibold">{p.username ?? "Membre"}</span>
              <span className="text-xs text-muted-foreground">{p.correct_count} ✓</span>
              <span className="text-sm font-bold tabular text-primary">{p.score}</span>
            </div>
          ))}
        </div>

        <p className="mt-6 flex items-center gap-1.5 text-xs text-muted-foreground">
          <Users className="h-3.5 w-3.5" /> {participants.length} participant(s)
        </p>
      </div>
    </AppShell>
  );
}
