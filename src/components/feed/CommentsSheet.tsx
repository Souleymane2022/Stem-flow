import { useEffect, useState } from "react";
import { X, Send, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useXpPopup } from "@/components/gamification/XpPopup";
import { XP_REWARDS } from "@/lib/xp";

type Comment = {
  id: string;
  text: string;
  author_name: string | null;
  user_id: string;
  created_at: string;
};

export function CommentsSheet({ contentId, onClose }: { contentId: string; onClose: () => void }) {
  const { profile, awardXp } = useAuth();
  const pushXp = useXpPopup();
  const [comments, setComments] = useState<Comment[]>([]);
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    let active = true;
    supabase
      .from("comments")
      .select("id,text,author_name,user_id,created_at")
      .eq("content_id", contentId)
      .order("created_at", { ascending: false })
      .then(({ data }) => {
        if (active) {
          setComments((data as Comment[]) ?? []);
          setLoading(false);
        }
      });
    return () => {
      active = false;
    };
  }, [contentId]);

  const submit = async () => {
    if (!text.trim() || !profile) return;
    setSending(true);
    const { data, error } = await supabase
      .from("comments")
      .insert({
        content_id: contentId,
        user_id: profile.id,
        author_name: profile.username,
        author_avatar: profile.profile_image_url,
        text: text.trim(),
      })
      .select("id,text,author_name,user_id,created_at")
      .single();
    setSending(false);
    if (!error && data) {
      setComments((prev) => [data as Comment, ...prev]);
      setText("");
      await awardXp(XP_REWARDS.comment);
      pushXp(XP_REWARDS.comment);
    }
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center bg-black/70 md:items-center" onClick={onClose}>
      <div
        className="flex h-[70dvh] w-full max-w-lg flex-col rounded-t-3xl border border-border bg-elevated md:h-[70vh] md:rounded-3xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <h3 className="text-base font-extrabold">Commentaires</h3>
          <button onClick={onClose} aria-label="Fermer" className="text-muted-foreground hover:text-foreground">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4">
          {loading && <p className="text-sm text-muted-foreground">Chargement…</p>}
          {!loading && comments.length === 0 && (
            <p className="py-10 text-center text-sm text-muted-foreground">
              Aucun commentaire. Lancez la discussion !
            </p>
          )}
          {comments.map((c) => (
            <div key={c.id} className="flex gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-brand text-sm font-black text-primary-foreground">
                {(c.author_name ?? "?").charAt(0).toUpperCase()}
              </div>
              <div className="min-w-0">
                <p className="text-xs font-bold">{c.author_name ?? "Anonyme"}</p>
                <p className="text-sm text-foreground/90">{c.text}</p>
              </div>
            </div>
          ))}
        </div>

        {profile ? (
          <div className="flex items-center gap-2 border-t border-border p-4">
            <input
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && submit()}
              placeholder="Ajouter un commentaire…"
              className="flex-1 rounded-full border border-border bg-surface-2 px-4 py-2.5 text-sm outline-none focus:border-primary/60"
            />
            <button
              onClick={submit}
              disabled={sending || !text.trim()}
              className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-brand text-primary-foreground disabled:opacity-40"
              aria-label="Envoyer"
            >
              {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </button>
          </div>
        ) : (
          <p className="border-t border-border p-4 text-center text-sm text-muted-foreground">
            Connectez-vous pour commenter.
          </p>
        )}
      </div>
    </div>
  );
}
