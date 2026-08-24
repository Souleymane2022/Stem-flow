-- Les questions du public, et leurs votes.
--
-- Une discussion défilante convient au bavardage, pas aux questions : pendant
-- une masterclass, la bonne question se noie sous les salutations, et l'hôte
-- ne sait pas laquelle intéresse le plus de monde. Un fil séparé, trié par
-- votes, répond aux deux : le public fait remonter ce qu'il veut entendre, et
-- l'hôte lit la liste de haut en bas.

CREATE TABLE IF NOT EXISTS public.live_questions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES public.live_sessions(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  username text,
  text text NOT NULL CHECK (length(btrim(text)) BETWEEN 3 AND 500),
  votes_count integer NOT NULL DEFAULT 0,
  answered boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS live_questions_session_idx
  ON public.live_questions (session_id, answered, votes_count DESC);

CREATE TABLE IF NOT EXISTS public.live_question_votes (
  question_id uuid NOT NULL REFERENCES public.live_questions(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (question_id, user_id)
);

GRANT SELECT ON public.live_questions, public.live_question_votes TO anon;
GRANT SELECT, INSERT, DELETE ON public.live_questions TO authenticated;
GRANT SELECT, INSERT, DELETE ON public.live_question_votes TO authenticated;
GRANT ALL ON public.live_questions, public.live_question_votes TO service_role;

ALTER TABLE public.live_questions      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.live_question_votes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS live_questions_read_all ON public.live_questions;
CREATE POLICY live_questions_read_all ON public.live_questions FOR SELECT USING (true);
DROP POLICY IF EXISTS live_questions_insert_own ON public.live_questions;
CREATE POLICY live_questions_insert_own ON public.live_questions
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS live_questions_delete_own ON public.live_questions;
CREATE POLICY live_questions_delete_own ON public.live_questions
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS live_question_votes_read_all ON public.live_question_votes;
CREATE POLICY live_question_votes_read_all ON public.live_question_votes FOR SELECT USING (true);
DROP POLICY IF EXISTS live_question_votes_write_own ON public.live_question_votes;
CREATE POLICY live_question_votes_write_own ON public.live_question_votes
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS live_question_votes_delete_own ON public.live_question_votes;
CREATE POLICY live_question_votes_delete_own ON public.live_question_votes
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- Le compte des votes est tenu par la base : un client qui l'incrémenterait
-- lui-même pourrait faire monter sa propre question.
CREATE OR REPLACE FUNCTION public.sync_question_votes()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE target uuid := COALESCE(NEW.question_id, OLD.question_id);
BEGIN
  UPDATE public.live_questions q
     SET votes_count = (SELECT count(*) FROM public.live_question_votes v WHERE v.question_id = target)
   WHERE q.id = target;
  RETURN NULL;
END; $$;
REVOKE EXECUTE ON FUNCTION public.sync_question_votes() FROM anon, authenticated, public;

DROP TRIGGER IF EXISTS trg_question_votes ON public.live_question_votes;
CREATE TRIGGER trg_question_votes
  AFTER INSERT OR DELETE ON public.live_question_votes
  FOR EACH ROW EXECUTE FUNCTION public.sync_question_votes();

-- ------------------------------------------------- réponses et modération
--
-- Marquer une question comme traitée appartient à l'hôte : c'est lui qui sait
-- s'il y a répondu. La suppression lui revient aussi, ou aux comptes
-- autorisés, pour écarter ce qui n'a pas sa place.
CREATE OR REPLACE FUNCTION public.set_question_answered(p_question_id uuid, p_answered boolean)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  uid uuid := auth.uid();
  host uuid;
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'authentification requise';
  END IF;
  SELECT s.host_id INTO host
    FROM public.live_questions q
    JOIN public.live_sessions s ON s.id = q.session_id
   WHERE q.id = p_question_id;
  IF host IS NULL AND NOT public.is_app_admin() THEN
    RETURN false;
  END IF;
  IF host <> uid AND NOT public.is_app_admin() THEN
    RAISE EXCEPTION 'réservé à l''hôte de la séance';
  END IF;

  UPDATE public.live_questions SET answered = p_answered WHERE id = p_question_id;
  RETURN true;
END; $$;

REVOKE EXECUTE ON FUNCTION public.set_question_answered(uuid, boolean) FROM public;
GRANT EXECUTE ON FUNCTION public.set_question_answered(uuid, boolean) TO authenticated;

CREATE OR REPLACE FUNCTION public.delete_live_question(p_question_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  uid uuid := auth.uid();
  host uuid;
  author uuid;
  removed integer;
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'authentification requise';
  END IF;
  SELECT s.host_id, q.user_id INTO host, author
    FROM public.live_questions q
    JOIN public.live_sessions s ON s.id = q.session_id
   WHERE q.id = p_question_id;
  IF author IS NULL THEN
    RETURN false;
  END IF;
  IF author <> uid AND COALESCE(host, '00000000-0000-0000-0000-000000000000'::uuid) <> uid
     AND NOT public.is_app_admin() THEN
    RAISE EXCEPTION 'suppression non autorisée';
  END IF;

  DELETE FROM public.live_questions WHERE id = p_question_id;
  GET DIAGNOSTICS removed = ROW_COUNT;
  RETURN removed > 0;
END; $$;

REVOKE EXECUTE ON FUNCTION public.delete_live_question(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.delete_live_question(uuid) TO authenticated;

-- Les questions montent et descendent pendant la séance : sans temps réel,
-- chacun voterait sur un classement figé.
DO $realtime$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
       WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'live_questions'
    ) THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.live_questions;
    END IF;
  END IF;
END $realtime$;

NOTIFY pgrst, 'reload schema';
