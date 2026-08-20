-- Réserve l'alimentation du catalogue à quelques comptes.
--
-- Importer une playlist ou pousser une leçon dans le fil décide de ce que
-- toute l'application voit. Ces deux gestes étaient ouverts à n'importe quel
-- membre connecté : une seule personne mal intentionnée pouvait remplir le fil.
-- Ils passent sous liste blanche.
--
-- La liste vit en base, et non dans le code, pour deux raisons : le contrôle
-- doit tenir même si quelqu'un appelle les fonctions serveur directement, et
-- ajouter un administrateur ne doit pas demander un déploiement.

CREATE TABLE IF NOT EXISTS public.app_admins (
  email text PRIMARY KEY,
  added_at timestamptz NOT NULL DEFAULT now()
);

-- Aucun GRANT : la table n'est lue que par les fonctions SECURITY DEFINER
-- ci-dessous. Personne ne peut donc énumérer les administrateurs, ni s'y
-- ajouter. L'ajout se fait depuis le SQL Editor du tableau de bord.
ALTER TABLE public.app_admins ENABLE ROW LEVEL SECURITY;
-- Le rôle de service est réservé au serveur : les fonctions serveur, qui
-- importent les playlists, doivent pouvoir vérifier la liste.
GRANT SELECT ON public.app_admins TO service_role;

INSERT INTO public.app_admins (email) VALUES
  ('souleymanemahamatsaleh2000@gmail.com'),
  ('attioukotchole@gmail.com'),
  ('ciramamys@gmail.com')
ON CONFLICT (email) DO NOTHING;

-- Le courriel fait autorité, pas l'identifiant : un compte recréé garde ses
-- droits, et la liste reste lisible par un humain.
CREATE OR REPLACE FUNCTION public.is_app_admin()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1
      FROM auth.users u
      JOIN public.app_admins a ON lower(u.email) = lower(a.email)
     WHERE u.id = auth.uid()
  );
$$;
REVOKE EXECUTE ON FUNCTION public.is_app_admin() FROM public;
GRANT EXECUTE ON FUNCTION public.is_app_admin() TO authenticated;

-- La publication d'une leçon dans le fil suit la même règle. La version
-- précédente acceptait l'auteur du cours, et laissait grands ouverts les cours
-- livrés avec l'application, qui n'ont pas d'auteur.
CREATE OR REPLACE FUNCTION public.set_lesson_in_feed(p_lesson_id uuid, p_in_feed boolean)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  uid uuid := auth.uid();
  lesson public.course_lessons%ROWTYPE;
  course public.courses%ROWTYPE;
  me public.profiles%ROWTYPE;
  existing uuid;
  created uuid;
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'authentification requise';
  END IF;
  IF NOT public.is_app_admin() THEN
    RAISE EXCEPTION 'réservé aux comptes autorisés';
  END IF;

  SELECT * INTO lesson FROM public.course_lessons WHERE id = p_lesson_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'leçon introuvable';
  END IF;
  SELECT * INTO course FROM public.courses WHERE id = lesson.course_id;

  SELECT id INTO existing FROM public.contents WHERE source_lesson_id = lesson.id;

  IF NOT p_in_feed THEN
    IF existing IS NOT NULL THEN
      DELETE FROM public.contents WHERE id = existing;
    END IF;
    RETURN NULL;
  END IF;

  IF existing IS NOT NULL THEN
    RETURN existing;
  END IF;

  SELECT * INTO me FROM public.profiles WHERE id = uid;

  INSERT INTO public.contents (
    content_type, title, description, video_url, video_id,
    category, difficulty, xp_reward, author_id, author_name,
    source_course_id, source_lesson_id
  ) VALUES (
    'video',
    lesson.title,
    left(COALESCE(lesson.description, course.description, ''), 500),
    'https://www.youtube.com/watch?v=' || lesson.video_id,
    lesson.video_id,
    course.category,
    course.difficulty,
    15,
    uid,
    COALESCE(me.username, 'stemflow'),
    course.id,
    lesson.id
  ) RETURNING id INTO created;

  RETURN created;
END; $$;

REVOKE EXECUTE ON FUNCTION public.set_lesson_in_feed(uuid, boolean) FROM public;
GRANT EXECUTE ON FUNCTION public.set_lesson_in_feed(uuid, boolean) TO authenticated;

NOTIFY pgrst, 'reload schema';
