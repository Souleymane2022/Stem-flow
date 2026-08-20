-- Les salons deviennent des lieux de rendez-vous.
--
-- Un salon n'offrait qu'un fil de discussion permanent : rien n'y permettait
-- d'annoncer une masterclass, d'ouvrir un atelier à une heure dite, ni de
-- suivre une conférence en direct. Une séance donne au salon ce qui lui
-- manquait — une date, un hôte, une diffusion, et sa propre discussion.
--
-- La diffusion passe par un identifiant de vidéo YouTube. Ce n'est pas un
-- pis-aller : diffuser réellement de la caméra vers des spectateurs demande
-- une infrastructure de streaming, alors qu'un direct YouTube est gratuit,
-- tient la charge, et se regarde depuis l'application comme n'importe quelle
-- vidéo. Le champ reste vide tant que le lien n'est pas connu : la séance
-- existe alors comme annonce, puis comme fil de discussion.

CREATE TABLE IF NOT EXISTS public.live_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id uuid NOT NULL REFERENCES public.rooms(id) ON DELETE CASCADE,
  kind text NOT NULL DEFAULT 'masterclass'
    CHECK (kind IN ('masterclass', 'atelier', 'conference')),
  title text NOT NULL,
  description text,
  host_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  host_name text,
  video_id text,
  cover_url text,
  starts_at timestamptz NOT NULL,
  duration_minutes integer NOT NULL DEFAULT 60 CHECK (duration_minutes BETWEEN 5 AND 600),
  status text NOT NULL DEFAULT 'scheduled'
    CHECK (status IN ('scheduled', 'live', 'ended', 'cancelled')),
  attendee_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS live_sessions_room_idx ON public.live_sessions (room_id, starts_at DESC);
CREATE INDEX IF NOT EXISTS live_sessions_agenda_idx ON public.live_sessions (starts_at) WHERE status IN ('scheduled', 'live');

CREATE TABLE IF NOT EXISTS public.live_attendees (
  session_id uuid NOT NULL REFERENCES public.live_sessions(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  registered_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (session_id, user_id)
);

CREATE TABLE IF NOT EXISTS public.live_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES public.live_sessions(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  username text,
  text text NOT NULL CHECK (length(btrim(text)) BETWEEN 1 AND 1000),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS live_messages_session_idx ON public.live_messages (session_id, created_at);

-- ------------------------------------------------------- droits et RLS
GRANT SELECT ON public.live_sessions, public.live_attendees, public.live_messages TO anon;
GRANT SELECT ON public.live_sessions TO authenticated;
GRANT SELECT, INSERT, DELETE ON public.live_attendees TO authenticated;
GRANT SELECT, INSERT, DELETE ON public.live_messages TO authenticated;
GRANT ALL ON public.live_sessions, public.live_attendees, public.live_messages TO service_role;

ALTER TABLE public.live_sessions  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.live_attendees ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.live_messages  ENABLE ROW LEVEL SECURITY;

-- Une séance se partage par lien : elle doit être lisible sans compte, sinon
-- l'aperçu envoyé dans un groupe mène à une page vide.
DROP POLICY IF EXISTS live_sessions_read_all ON public.live_sessions;
CREATE POLICY live_sessions_read_all ON public.live_sessions FOR SELECT USING (true);

DROP POLICY IF EXISTS live_attendees_read_all ON public.live_attendees;
CREATE POLICY live_attendees_read_all ON public.live_attendees FOR SELECT USING (true);
DROP POLICY IF EXISTS live_attendees_write_own ON public.live_attendees;
CREATE POLICY live_attendees_write_own ON public.live_attendees
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS live_attendees_delete_own ON public.live_attendees;
CREATE POLICY live_attendees_delete_own ON public.live_attendees
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS live_messages_read_all ON public.live_messages;
CREATE POLICY live_messages_read_all ON public.live_messages FOR SELECT USING (true);
DROP POLICY IF EXISTS live_messages_insert_own ON public.live_messages;
CREATE POLICY live_messages_insert_own ON public.live_messages
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
-- Chacun retire ses propres messages ; la modération passe par la fonction
-- plus bas, qui vérifie la liste des comptes autorisés.
DROP POLICY IF EXISTS live_messages_delete_own ON public.live_messages;
CREATE POLICY live_messages_delete_own ON public.live_messages
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- Aucune écriture directe sur les séances : titre, hôte et diffusion passent
-- par les fonctions ci-dessous.

-- --------------------------------------------------- compteur d'inscrits
CREATE OR REPLACE FUNCTION public.sync_live_attendees()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE target uuid := COALESCE(NEW.session_id, OLD.session_id);
BEGIN
  UPDATE public.live_sessions s
     SET attendee_count = (SELECT count(*) FROM public.live_attendees a WHERE a.session_id = target)
   WHERE s.id = target;
  RETURN NULL;
END; $$;
REVOKE EXECUTE ON FUNCTION public.sync_live_attendees() FROM anon, authenticated, public;

DROP TRIGGER IF EXISTS trg_live_attendees ON public.live_attendees;
CREATE TRIGGER trg_live_attendees
  AFTER INSERT OR DELETE ON public.live_attendees
  FOR EACH ROW EXECUTE FUNCTION public.sync_live_attendees();

-- ------------------------------------------------------------ création
CREATE OR REPLACE FUNCTION public.create_live_session(
  p_room_id uuid,
  p_title text,
  p_kind text DEFAULT 'masterclass',
  p_description text DEFAULT NULL,
  p_video_id text DEFAULT NULL,
  p_starts_at timestamptz DEFAULT now(),
  p_duration integer DEFAULT 60
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  uid uuid := auth.uid();
  me public.profiles%ROWTYPE;
  new_id uuid;
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'authentification requise';
  END IF;
  -- Annoncer une séance engage le salon entier : le geste suit la même règle
  -- que l'alimentation du catalogue.
  IF NOT public.is_app_admin() THEN
    RAISE EXCEPTION 'réservé aux comptes autorisés';
  END IF;
  IF length(btrim(COALESCE(p_title, ''))) < 3 THEN
    RAISE EXCEPTION 'titre trop court';
  END IF;

  SELECT * INTO me FROM public.profiles WHERE id = uid;

  INSERT INTO public.live_sessions (
    room_id, kind, title, description, host_id, host_name,
    video_id, starts_at, duration_minutes
  ) VALUES (
    p_room_id,
    CASE WHEN p_kind IN ('masterclass', 'atelier', 'conference') THEN p_kind ELSE 'masterclass' END,
    btrim(p_title),
    NULLIF(btrim(COALESCE(p_description, '')), ''),
    uid,
    COALESCE(me.username, 'stemflow'),
    NULLIF(btrim(COALESCE(p_video_id, '')), ''),
    COALESCE(p_starts_at, now()),
    LEAST(GREATEST(COALESCE(p_duration, 60), 5), 600)
  ) RETURNING id INTO new_id;

  -- L'hôte est inscrit d'office : il figure dans la liste et reçoit les
  -- mêmes rappels que les autres.
  INSERT INTO public.live_attendees (session_id, user_id) VALUES (new_id, uid)
  ON CONFLICT DO NOTHING;

  RETURN new_id;
END; $$;

REVOKE EXECUTE ON FUNCTION public.create_live_session(uuid, text, text, text, text, timestamptz, integer) FROM public;
GRANT EXECUTE ON FUNCTION public.create_live_session(uuid, text, text, text, text, timestamptz, integer) TO authenticated;

-- ---------------------------------------------------------- mise à jour
CREATE OR REPLACE FUNCTION public.update_live_session(
  p_session_id uuid,
  p_title text DEFAULT NULL,
  p_description text DEFAULT NULL,
  p_video_id text DEFAULT NULL,
  p_starts_at timestamptz DEFAULT NULL,
  p_duration integer DEFAULT NULL
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  uid uuid := auth.uid();
  session public.live_sessions%ROWTYPE;
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'authentification requise';
  END IF;
  SELECT * INTO session FROM public.live_sessions WHERE id = p_session_id;
  IF NOT FOUND THEN
    RETURN false;
  END IF;
  -- L'hôte règle sa propre séance ; un compte autorisé peut corriger n'importe
  -- laquelle, notamment pour coller le lien du direct à la dernière minute.
  IF session.host_id <> uid AND NOT public.is_app_admin() THEN
    RAISE EXCEPTION 'réservé à l''hôte de la séance';
  END IF;

  UPDATE public.live_sessions
     SET title = COALESCE(NULLIF(btrim(COALESCE(p_title, '')), ''), title),
         description = COALESCE(NULLIF(btrim(COALESCE(p_description, '')), ''), description),
         video_id = COALESCE(NULLIF(btrim(COALESCE(p_video_id, '')), ''), video_id),
         starts_at = COALESCE(p_starts_at, starts_at),
         duration_minutes = COALESCE(LEAST(GREATEST(p_duration, 5), 600), duration_minutes),
         updated_at = now()
   WHERE id = p_session_id;
  RETURN true;
END; $$;

REVOKE EXECUTE ON FUNCTION public.update_live_session(uuid, text, text, text, timestamptz, integer) FROM public;
GRANT EXECUTE ON FUNCTION public.update_live_session(uuid, text, text, text, timestamptz, integer) TO authenticated;

-- ---------------------------------------------------- ouverture, clôture
--
-- Passer une séance en direct prévient celles et ceux qui s'y sont inscrits :
-- une annonce que personne ne voit au bon moment ne sert à rien.
CREATE OR REPLACE FUNCTION public.set_live_status(p_session_id uuid, p_status text)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  uid uuid := auth.uid();
  session public.live_sessions%ROWTYPE;
  notified integer := 0;
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'authentification requise';
  END IF;
  IF p_status NOT IN ('scheduled', 'live', 'ended', 'cancelled') THEN
    RAISE EXCEPTION 'état inconnu';
  END IF;

  SELECT * INTO session FROM public.live_sessions WHERE id = p_session_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'séance introuvable';
  END IF;
  IF session.host_id <> uid AND NOT public.is_app_admin() THEN
    RAISE EXCEPTION 'réservé à l''hôte de la séance';
  END IF;

  UPDATE public.live_sessions SET status = p_status, updated_at = now() WHERE id = p_session_id;

  IF p_status = 'live' AND session.status <> 'live' THEN
    INSERT INTO public.notifications (user_id, type, title, message)
    SELECT a.user_id, 'live_started', session.title,
           'La séance commence maintenant.'
      FROM public.live_attendees a
     WHERE a.session_id = p_session_id AND a.user_id <> uid;
    GET DIAGNOSTICS notified = ROW_COUNT;
  END IF;

  RETURN notified;
END; $$;

REVOKE EXECUTE ON FUNCTION public.set_live_status(uuid, text) FROM public;
GRANT EXECUTE ON FUNCTION public.set_live_status(uuid, text) TO authenticated;

-- ------------------------------------------------------------ modération
CREATE OR REPLACE FUNCTION public.delete_live_message(p_message_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  uid uuid := auth.uid();
  removed integer;
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'authentification requise';
  END IF;
  IF NOT public.is_app_admin() THEN
    RAISE EXCEPTION 'réservé aux comptes autorisés';
  END IF;
  DELETE FROM public.live_messages WHERE id = p_message_id;
  GET DIAGNOSTICS removed = ROW_COUNT;
  RETURN removed > 0;
END; $$;

REVOKE EXECUTE ON FUNCTION public.delete_live_message(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.delete_live_message(uuid) TO authenticated;

-- La discussion et l'état de la séance doivent arriver sans rechargement.
--
-- `ALTER PUBLICATION … ADD TABLE` échoue si la table y figure déjà : sans ce
-- garde-fou, rejouer le fichier s'arrêterait ici, et tout ce qui suit serait
-- perdu.
DO $realtime$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
       WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'live_messages'
    ) THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.live_messages;
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
       WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'live_sessions'
    ) THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.live_sessions;
    END IF;
  END IF;
END $realtime$;

NOTIFY pgrst, 'reload schema';
