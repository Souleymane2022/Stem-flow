-- Modes de compétition et invitations.
--
--   solo  — s'entraîner seul sur un cours ;
--   duel  — affrontement entre deux personnes désignées ;
--   open  — salon ouvert, que n'importe qui peut rejoindre.
--
-- Jusqu'ici toute compétition était implicitement ouverte : la politique
-- d'insertion des participants n'exigeait que `auth.uid() = user_id`, si bien
-- qu'un tiers pouvait s'inviter dans un duel privé en devinant son
-- identifiant. Le mode devient donc une règle d'accès, pas un simple libellé.

-- Cette migration s'appuie sur 20260817040000_course_duels.sql (colonnes
-- opponent_id et visibility). Sans elle, PostgreSQL échouerait plus bas sur un
-- « column does not exist » qui n'indique pas la marche à suivre.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'competitions'
       AND column_name = 'opponent_id'
  ) THEN
    RAISE EXCEPTION 'Applique d''abord 20260817040000_course_duels.sql : la colonne competitions.opponent_id est absente.';
  END IF;
END $$;

ALTER TABLE public.competitions
  ADD COLUMN IF NOT EXISTS mode text NOT NULL DEFAULT 'open';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'competitions_mode_check') THEN
    ALTER TABLE public.competitions
      ADD CONSTRAINT competitions_mode_check CHECK (mode IN ('solo', 'duel', 'open'));
  END IF;
END $$;

-- Les duels déjà créés désignent un adversaire : ils relèvent du mode duel.
UPDATE public.competitions SET mode = 'duel' WHERE opponent_id IS NOT NULL AND mode = 'open';

-- ------------------------------------------------------- invitations
CREATE TABLE IF NOT EXISTS public.competition_invites (
  competition_id uuid NOT NULL REFERENCES public.competitions(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  invited_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (competition_id, user_id)
);

GRANT SELECT ON public.competition_invites TO authenticated;
GRANT ALL ON public.competition_invites TO service_role;
ALTER TABLE public.competition_invites ENABLE ROW LEVEL SECURITY;


-- --------------------------------------------- sortir de la récursion
--
-- Une politique sur `competitions` qui interroge `competition_invites`, et une
-- politique sur `competition_invites` qui interroge `competitions`, forment un
-- cycle : PostgreSQL lève « infinite recursion detected in policy ».
--
-- Ces deux fonctions sont en SECURITY DEFINER, donc exécutées avec les droits
-- du propriétaire et hors RLS. Les politiques les appellent au lieu de lire
-- directement l'autre table, ce qui rompt le cycle. Elles ne divulguent rien :
-- l'une répond par un booléen sur une invitation que l'appelant désigne, la
-- seconde ne renvoie qu'un identifiant d'hôte.
CREATE OR REPLACE FUNCTION public.is_invited_to(p_competition_id uuid, p_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.competition_invites
     WHERE competition_id = p_competition_id AND user_id = p_user_id
  );
$$;

CREATE OR REPLACE FUNCTION public.competition_host(p_competition_id uuid)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT host_id FROM public.competitions WHERE id = p_competition_id;
$$;

REVOKE EXECUTE ON FUNCTION public.is_invited_to(uuid, uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.competition_host(uuid) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.is_invited_to(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.competition_host(uuid) TO authenticated;

-- Chacun voit les invitations qui le concernent ; l'hôte voit celles qu'il a
-- envoyées. Aucune politique d'écriture : seule invite_to_competition insère.
DROP POLICY IF EXISTS invites_read_involved ON public.competition_invites;
CREATE POLICY invites_read_involved ON public.competition_invites
  FOR SELECT TO authenticated
  USING (
    auth.uid() = user_id
    OR auth.uid() = invited_by
    OR auth.uid() = public.competition_host(public.competition_invites.competition_id)
  );

-- --------------------------------------------------- accès aux défis
-- Une personne invitée doit voir le défi auquel on la convie.
DROP POLICY IF EXISTS competitions_read_visible ON public.competitions;
CREATE POLICY competitions_read_visible ON public.competitions
  FOR SELECT
  USING (
    visibility = 'public'
    OR auth.uid() = host_id
    OR auth.uid() = opponent_id
    OR public.is_invited_to(public.competitions.id, auth.uid())
  );

-- Rejoindre n'est plus libre : le mode et les invitations en décident.
DROP POLICY IF EXISTS competition_participants_insert_own ON public.competition_participants;
DROP POLICY IF EXISTS competition_participants_insert_allowed ON public.competition_participants;
CREATE POLICY competition_participants_insert_allowed ON public.competition_participants
  FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM public.competitions c
       WHERE c.id = public.competition_participants.competition_id
         AND (
           c.mode = 'open'
           OR c.host_id = auth.uid()
           OR c.opponent_id = auth.uid()
           OR public.is_invited_to(c.id, auth.uid())
         )
    )
  );

-- ------------------------------------------------------ inviter
--
-- Comme pour les duels, prévenir un tiers est impossible depuis le client :
-- la politique des notifications restreint chacun à ses propres lignes.
CREATE OR REPLACE FUNCTION public.invite_to_competition(
  p_competition_id uuid,
  p_user_id uuid
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  uid uuid := auth.uid();
  comp public.competitions%ROWTYPE;
  me public.profiles%ROWTYPE;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'authentification requise'; END IF;
  IF uid = p_user_id THEN RAISE EXCEPTION 'tu participes déjà'; END IF;

  SELECT * INTO comp FROM public.competitions WHERE id = p_competition_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'défi introuvable'; END IF;
  IF comp.host_id <> uid THEN RAISE EXCEPTION 'seul l''hôte peut inviter'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = p_user_id) THEN
    RAISE EXCEPTION 'personne introuvable';
  END IF;

  SELECT * INTO me FROM public.profiles WHERE id = uid;

  INSERT INTO public.competition_invites (competition_id, user_id, invited_by)
  VALUES (p_competition_id, p_user_id, uid)
  ON CONFLICT (competition_id, user_id) DO NOTHING;

  INSERT INTO public.notifications (user_id, type, title, message)
  VALUES (
    p_user_id, 'invitation',
    format('%s t''invite au défi « %s »', me.username, comp.topic),
    'Rejoins le salon pour participer.'
  );

  RETURN true;
END; $$;

REVOKE EXECUTE ON FUNCTION public.invite_to_competition(uuid, uuid) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.invite_to_competition(uuid, uuid) TO authenticated;

-- Un duel créé depuis un cours relève désormais explicitement du mode duel.
CREATE OR REPLACE FUNCTION public.create_course_duel(
  p_course_id uuid,
  p_opponent_id uuid,
  p_visibility text DEFAULT 'public',
  p_question_count integer DEFAULT 5
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  uid uuid := auth.uid();
  me public.profiles%ROWTYPE;
  foe public.profiles%ROWTYPE;
  course public.courses%ROWTYPE;
  vis text := CASE WHEN p_visibility = 'private' THEN 'private' ELSE 'public' END;
  new_id uuid;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'authentification requise'; END IF;
  IF uid = p_opponent_id THEN RAISE EXCEPTION 'on ne se défie pas soi-même'; END IF;

  SELECT * INTO me FROM public.profiles WHERE id = uid;
  IF NOT FOUND THEN RAISE EXCEPTION 'profil introuvable'; END IF;
  SELECT * INTO foe FROM public.profiles WHERE id = p_opponent_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'adversaire introuvable'; END IF;
  SELECT * INTO course FROM public.courses WHERE id = p_course_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'cours introuvable'; END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.course_enrollments
     WHERE course_id = p_course_id AND user_id = uid
  ) THEN
    RAISE EXCEPTION 'commence le cours avant de lancer un défi dessus';
  END IF;

  INSERT INTO public.competitions (
    host_id, host_name, topic, category, difficulty,
    question_count, xp_reward, source_course_id, opponent_id, visibility, mode
  ) VALUES (
    uid, me.username, course.title, course.category, course.difficulty,
    GREATEST(LEAST(COALESCE(p_question_count, 5), 12), 3), 60,
    course.id, p_opponent_id, vis, 'duel'
  ) RETURNING id INTO new_id;

  INSERT INTO public.competition_participants (competition_id, user_id, username, avatar_url)
  VALUES (new_id, uid, me.username, me.profile_image_url),
         (new_id, p_opponent_id, foe.username, foe.profile_image_url)
  ON CONFLICT DO NOTHING;

  INSERT INTO public.notifications (user_id, type, title, message)
  VALUES (
    p_opponent_id, 'duel',
    format('%s te défie sur « %s »', me.username, course.title),
    'Rejoins le défi et réponds plus vite que ton adversaire.'
  );

  IF vis = 'public' THEN
    INSERT INTO public.notifications (user_id, type, title, message)
    SELECT e.user_id, 'duel_public',
           format('%s et %s s''affrontent sur « %s »', me.username, foe.username, course.title),
           'Ouvre le défi pour suivre le duel en direct.'
      FROM public.course_enrollments e
     WHERE e.course_id = p_course_id
       AND e.user_id NOT IN (uid, p_opponent_id)
     LIMIT 200;
  END IF;

  RETURN new_id;
END; $$;

REVOKE EXECUTE ON FUNCTION public.create_course_duel(uuid, uuid, text, integer) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.create_course_duel(uuid, uuid, text, integer) TO authenticated;
