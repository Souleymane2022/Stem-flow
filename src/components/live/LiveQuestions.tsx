import { useCallback, useEffect, useState } from "react";
import { ArrowBigUp, Check, HelpCircle, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useI18n } from "@/lib/i18n";
import { explainDbError } from "@/lib/db-errors";
import { formatCount } from "@/lib/numbers";

type Question = {
  id: string;
  user_id: string;
  username: string | null;
  text: string;
  votes_count: number;
  answered: boolean;
  created_at: string;
};

/**
 * Les questions du public, triées par votes.
 *
 * Pendant une masterclass, une bonne question se noie dans la discussion, et
 * l'hôte ne sait pas laquelle intéresse le plus de monde. Ici le public fait
 * remonter ce qu'il veut entendre, et l'hôte lit de haut en bas. Les questions
 * traitées descendent au lieu de disparaître : on veut pouvoir relire.
 */
export function LiveQuestions({ sessionId, canHost }: { sessionId: string; canHost: boolean }) {
  const { t, locale } = useI18n();
  const { session, profile } = useAuth();
  const [rows, setRows] = useState<Question[]>([]);
  const [voted, setVoted] = useState<Set<string>>(new Set());
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const { data } = await supabase
      .from("live_questions")
      .select("id,user_id,username,text,votes_count,answered,created_at")
      .eq("session_id", sessionId)
      .order("answered")
      .order("votes_count", { ascending: false })
      .order("created_at")
      .limit(100);
    setRows((data as Question[]) ?? []);
  }, [sessionId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!session) return;
    let alive = true;
    void (async () => {
      const { data } = await supabase
        .from("live_question_votes")
        .select("question_id")
        .eq("user_id", session.user.id);
      if (alive) setVoted(new Set((data ?? []).map((v) => v.question_id)));
    })();
    return () => {
      alive = false;
    };
  }, [session]);

  // Le classement bouge pendant la séance : sans temps réel, chacun voterait
  // sur une liste figée à son arrivée.
  useEffect(() => {
    const channel = supabase
      .channel(`live-questions-${sessionId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "live_questions",
          filter: `session_id=eq.${sessionId}`,
        },
        () => void load(),
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [sessionId, load]);

  const ask = async (e: React.FormEvent) => {
    e.preventDefault();
    const text = draft.trim();
    if (text.length < 3 || !session) return;
    setBusy(true);
    const { error } = await supabase.from("live_questions").insert({
      session_id: sessionId,
      user_id: session.user.id,
      username: profile?.username ?? null,
      text,
    });
    setBusy(false);
    if (error) {
      toast.error(explainDbError(error, t));
      return;
    }
    setDraft("");
    void load();
  };

  const toggleVote = async (question: Question) => {
    if (!session) return;
    const has = voted.has(question.id);
    // Le compteur bouge tout de suite ; la base tranchera.
    setVoted((prev) => {
      const copy = new Set(prev);
      if (has) copy.delete(question.id);
      else copy.add(question.id);
      return copy;
    });
    setRows((prev) =>
      prev.map((r) =>
        r.id === question.id ? { ...r, votes_count: r.votes_count + (has ? -1 : 1) } : r,
      ),
    );

    const { error } = has
      ? await supabase
          .from("live_question_votes")
          .delete()
          .eq("question_id", question.id)
          .eq("user_id", session.user.id)
      : await supabase
          .from("live_question_votes")
          .insert({ question_id: question.id, user_id: session.user.id });

    if (error) {
      toast.error(explainDbError(error, t));
      void load();
    }
  };

  const markAnswered = async (question: Question) => {
    const { error } = await supabase.rpc("set_question_answered", {
      p_question_id: question.id,
      p_answered: !question.answered,
    });
    if (error) {
      toast.error(explainDbError(error, t));
      return;
    }
    void load();
  };

  const remove = async (question: Question) => {
    const { error } = await supabase.rpc("delete_live_question", { p_question_id: question.id });
    if (error) {
      toast.error(explainDbError(error, t));
      return;
    }
    setRows((prev) => prev.filter((r) => r.id !== question.id));
  };

  return (
    <div>
      {session ? (
        <form onSubmit={(e) => void ask(e)} className="flex gap-2">
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={t("live.questions.placeholder")}
            maxLength={500}
            className="min-w-0 flex-1 rounded-full border border-border bg-surface-2 px-4 py-2.5 text-sm outline-none focus:border-primary"
          />
          <button
            type="submit"
            disabled={busy || draft.trim().length < 3}
            className="shrink-0 rounded-full bg-gradient-brand px-4 py-2.5 text-sm font-black text-background disabled:opacity-50"
          >
            {t("live.questions.ask")}
          </button>
        </form>
      ) : (
        <p className="text-center text-sm text-muted-foreground">{t("live.chat.signin")}</p>
      )}

      {rows.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">
          {t("live.questions.empty")}
        </p>
      ) : (
        <ul className="mt-3 space-y-2">
          {rows.map((question) => {
            const mine = voted.has(question.id);
            return (
              <li
                key={question.id}
                className={`flex items-start gap-3 rounded-2xl border p-3 ${
                  question.answered
                    ? "border-border bg-surface-2/50 opacity-70"
                    : "border-border bg-surface-2"
                }`}
              >
                <button
                  type="button"
                  onClick={() => void toggleVote(question)}
                  disabled={!session}
                  aria-pressed={mine}
                  aria-label={t("live.questions.vote")}
                  className={`flex w-11 shrink-0 flex-col items-center rounded-xl border py-1.5 transition-colors disabled:opacity-50 ${
                    mine
                      ? "border-primary bg-primary/15 text-primary"
                      : "border-border bg-background text-muted-foreground"
                  }`}
                >
                  <ArrowBigUp className={`h-4 w-4 ${mine ? "fill-current" : ""}`} />
                  <span className="text-[11px] font-black tabular">
                    {formatCount(question.votes_count, locale)}
                  </span>
                </button>

                <p className="min-w-0 flex-1 text-sm">
                  <span className="block truncate text-[11px] font-bold text-primary">
                    @{question.username ?? "membre"}
                  </span>
                  <span className={question.answered ? "line-through" : ""}>{question.text}</span>
                  {question.answered && (
                    <span className="mt-1 flex items-center gap-1 text-[11px] font-bold text-primary">
                      <Check className="h-3 w-3" /> {t("live.questions.answered")}
                    </span>
                  )}
                </p>

                <span className="flex shrink-0 flex-col gap-1">
                  {canHost && (
                    <button
                      type="button"
                      onClick={() => void markAnswered(question)}
                      aria-label={t("live.questions.markAnswered")}
                      title={t("live.questions.markAnswered")}
                      className="flex h-8 w-8 items-center justify-center rounded-full border border-border bg-background text-muted-foreground hover:text-primary"
                    >
                      <Check className="h-4 w-4" />
                    </button>
                  )}
                  {(canHost || question.user_id === session?.user.id) && (
                    <button
                      type="button"
                      onClick={() => void remove(question)}
                      aria-label={t("admin.delete.action")}
                      className="flex h-8 w-8 items-center justify-center rounded-full border border-border bg-background text-muted-foreground hover:text-destructive"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </span>
              </li>
            );
          })}
        </ul>
      )}

      {rows.length === 0 && (
        <p className="mt-1 text-center text-xs text-muted-foreground">
          <HelpCircle className="mb-0.5 mr-1 inline h-3.5 w-3.5" />
          {t("live.questions.hint")}
        </p>
      )}
    </div>
  );
}
