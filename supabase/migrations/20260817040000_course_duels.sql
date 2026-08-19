-- Progression visible entre apprenants d'un même cours, et duels entre deux
-- d'entre eux.
--
-- Choix de confidentialité : voir la progression d'autrui est une exposition de
-- données personnelles. Elle est donc conditionnée à un consentement explicite,
-- porté par profiles.share_progress. La valeur par défaut est `true` parce que
-- l'application est conçue autour de l'émulation entre apprenants, mais chacun
-- peut se retirer sans perdre l'accès aux cours.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS share_progress boolean NOT NULL DEFAULT true;

-- Un défi peut viser une personne précise, et rester privé entre les deux.
ALTER TABLE public.competitions
  ADD COLUMN IF NOT EXISTS opponent_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL;

ALTER TABLE public.competitions
  ADD COLUMN IF NOT EXISTS visibility text NOT NULL DEFAULT 'public';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'competitions_visibility_check') THEN
    ALTER TABLE public.competitions
      ADD CONSTRAINT competitions_visibility_check CHECK (visibility IN ('public', 'private'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS competitions_opponent_idx ON public.competitions (opponent_id);

-- ------------------------------------------------------ visibilité RLS
-- La progression d'autrui n'est lisible que si son auteur l'a acceptée.
DROP POLICY IF EXISTS enrollments_read_shared ON public.course_enrollments;
CREATE POLICY enrollments_read_shared ON public.course_enrollments
  FOR SELECT TO authenticated
  USING (
    auth.uid() = user_id
    OR EXISTS (
      SELECT 1 FROM public.profiles p
       WHERE p.id = public.course_enrollments.user_id AND p.share_progress
    )
  );

-- Un défi privé ne concerne que ses deux protagonistes.
DROP POLICY IF EXISTS competitions_read_all ON public.competitions;
DROP POLICY IF EXISTS competitions_read_visible ON public.competitions;
CREATE POLICY competitions_read_visible ON public.competitions
  FOR SELECT
  USING (
    visibility = 'public'
    OR auth.uid() = host_id
    OR auth.uid() = opponent_id
  );

-- ------------------------------------------------------------- le duel
--
-- Créer un duel touche à plusieurs tables et doit notifier des tiers : la
-- politique d'insertion des notifications restreint chacun à ses propres
-- lignes, ce qui interdit au client de prévenir qui que ce soit. D'où une
-- fonction SECURITY DEFINER, seule habilitée à écrire ces notifications.
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

  -- Défier suppose de suivre le cours : sans quoi le défi ne porterait sur
  -- rien de commun aux deux personnes.
  IF NOT EXISTS (
    SELECT 1 FROM public.course_enrollments
     WHERE course_id = p_course_id AND user_id = uid
  ) THEN
    RAISE EXCEPTION 'commence le cours avant de lancer un défi dessus';
  END IF;

  INSERT INTO public.competitions (
    host_id, host_name, topic, category, difficulty,
    question_count, xp_reward, source_course_id, opponent_id, visibility
  ) VALUES (
    uid, me.username, course.title, course.category, course.difficulty,
    GREATEST(LEAST(COALESCE(p_question_count, 5), 12), 3), 60, course.id, p_opponent_id, vis
  ) RETURNING id INTO new_id;

  -- Les deux protagonistes sont inscrits d'emblée.
  INSERT INTO public.competition_participants (competition_id, user_id, username, avatar_url)
  VALUES (new_id, uid, me.username, me.profile_image_url),
         (new_id, p_opponent_id, foe.username, foe.profile_image_url)
  ON CONFLICT DO NOTHING;

  -- L'adversaire est prévenu dans tous les cas.
  INSERT INTO public.notifications (user_id, type, title, message)
  VALUES (
    p_opponent_id, 'duel',
    format('%s te défie sur « %s »', me.username, course.title),
    'Rejoins le défi et réponds plus vite que ton adversaire.'
  );

  -- Défi public : les autres apprenants du cours en sont informés. Plafonné,
  -- pour qu'un cours très suivi ne déclenche pas des milliers d'écritures.
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
