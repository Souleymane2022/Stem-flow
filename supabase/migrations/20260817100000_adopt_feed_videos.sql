-- Relier une leçon à la vidéo du fil au lieu de la dupliquer.
--
-- Les cours livrés avec l'application sont bâtis sur des vidéos qui sont déjà
-- dans le fil : les publier telles quelles y aurait fait apparaître la même
-- vidéo deux fois. Publier une leçon consiste donc d'abord à adopter la ligne
-- existante — elle gagne le lien vers le cours, sans nouveau contenu — et
-- seulement à défaut à en créer une.
--
-- Adopter change aussi ce que voit l'apprenant : la carte affiche « Cours · … »
-- et le temps passé dessus compte dans la progression du cours.

-- Distingue les lignes que la publication a créées de celles qui existaient
-- avant : retirer une leçon du fil ne doit pas effacer un contenu qui ne lui
-- appartenait pas.
ALTER TABLE public.contents
  ADD COLUMN IF NOT EXISTS from_lesson boolean NOT NULL DEFAULT false;

-- ------------------------------------------------------------- interne
--
-- Le cœur de la publication, sans contrôle d'identité : il est appelé soit par
-- `set_lesson_in_feed` (qui vérifie la liste blanche), soit par la fonction
-- serveur d'import, qui s'exécute avec le rôle de service. L'import ne peut
-- pas passer par `set_lesson_in_feed` : `auth.uid()` y est nul.
CREATE OR REPLACE FUNCTION public.link_lesson_to_feed(p_lesson_id uuid, p_author uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  lesson public.course_lessons%ROWTYPE;
  course public.courses%ROWTYPE;
  author_name text;
  existing uuid;
  created uuid;
BEGIN
  SELECT * INTO lesson FROM public.course_lessons WHERE id = p_lesson_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'leçon introuvable';
  END IF;
  SELECT * INTO course FROM public.courses WHERE id = lesson.course_id;

  -- Déjà publiée.
  SELECT id INTO existing FROM public.contents WHERE source_lesson_id = lesson.id;
  IF existing IS NOT NULL THEN
    RETURN existing;
  END IF;

  -- La vidéo est déjà dans le fil sans appartenir à une leçon : on l'adopte.
  SELECT id INTO existing
    FROM public.contents
   WHERE video_id = lesson.video_id AND source_lesson_id IS NULL
   ORDER BY created_at
   LIMIT 1;
  IF existing IS NOT NULL THEN
    UPDATE public.contents
       SET source_course_id = course.id,
           source_lesson_id = lesson.id
     WHERE id = existing;
    RETURN existing;
  END IF;

  -- La vidéo est dans le fil mais rattachée à une autre leçon : ne rien faire
  -- plutôt que d'ajouter un doublon.
  SELECT id INTO existing FROM public.contents WHERE video_id = lesson.video_id LIMIT 1;
  IF existing IS NOT NULL THEN
    RETURN existing;
  END IF;

  SELECT username INTO author_name FROM public.profiles WHERE id = p_author;

  INSERT INTO public.contents (
    content_type, title, description, video_url, video_id,
    category, difficulty, xp_reward, author_id, author_name,
    source_course_id, source_lesson_id, from_lesson
  ) VALUES (
    'video',
    lesson.title,
    left(COALESCE(lesson.description, course.description, ''), 500),
    'https://www.youtube.com/watch?v=' || lesson.video_id,
    lesson.video_id,
    course.category,
    course.difficulty,
    15,
    p_author,
    COALESCE(author_name, 'stemflow'),
    course.id,
    lesson.id,
    true
  ) RETURNING id INTO created;

  RETURN created;
END; $$;

CREATE OR REPLACE FUNCTION public.unlink_lesson_from_feed(p_lesson_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  row_id uuid;
  mine boolean;
BEGIN
  SELECT id, from_lesson INTO row_id, mine
    FROM public.contents WHERE source_lesson_id = p_lesson_id;
  IF row_id IS NULL THEN
    RETURN;
  END IF;

  IF mine THEN
    -- Créée pour la leçon : elle disparaît avec elle.
    DELETE FROM public.contents WHERE id = row_id;
  ELSE
    -- Elle existait avant : on défait seulement le rattachement.
    UPDATE public.contents
       SET source_course_id = NULL, source_lesson_id = NULL
     WHERE id = row_id;
  END IF;
END; $$;

REVOKE EXECUTE ON FUNCTION public.link_lesson_to_feed(uuid, uuid) FROM public, authenticated;
REVOKE EXECUTE ON FUNCTION public.unlink_lesson_from_feed(uuid) FROM public, authenticated;
GRANT EXECUTE ON FUNCTION public.link_lesson_to_feed(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.unlink_lesson_from_feed(uuid) TO service_role;

-- --------------------------------------------------------- côté client
CREATE OR REPLACE FUNCTION public.set_lesson_in_feed(p_lesson_id uuid, p_in_feed boolean)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  uid uuid := auth.uid();
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'authentification requise';
  END IF;
  IF NOT public.is_app_admin() THEN
    RAISE EXCEPTION 'réservé aux comptes autorisés';
  END IF;

  IF p_in_feed THEN
    RETURN public.link_lesson_to_feed(p_lesson_id, uid);
  END IF;
  PERFORM public.unlink_lesson_from_feed(p_lesson_id);
  RETURN NULL;
END; $$;

REVOKE EXECUTE ON FUNCTION public.set_lesson_in_feed(uuid, boolean) FROM public;
GRANT EXECUTE ON FUNCTION public.set_lesson_in_feed(uuid, boolean) TO authenticated;

-- ------------------------------------------------- rattrapage existant
--
-- Les cours livrés avec l'application reprennent des vidéos déjà présentes
-- dans le fil, sans lien entre les deux : leurs cartes n'indiquaient pas le
-- cours, et les regarder ne faisait avancer aucune progression. On rattache
-- une fois pour toutes, sans rien ajouter au fil.
WITH pair AS (
  SELECT DISTINCT ON (c.id) c.id AS content_id, l.id AS lesson_id, l.course_id
    FROM public.contents c
    JOIN public.course_lessons l ON l.video_id = c.video_id
   WHERE c.source_lesson_id IS NULL
   ORDER BY c.id, l.sort_order, l.id
),
unique_pair AS (
  SELECT DISTINCT ON (lesson_id) content_id, lesson_id, course_id
    FROM pair
   ORDER BY lesson_id, content_id
)
UPDATE public.contents ct
   SET source_course_id = p.course_id,
       source_lesson_id = p.lesson_id
  FROM unique_pair p
 WHERE ct.id = p.content_id
   -- Une leçon déjà rattachée à une autre ligne ne doit pas l'être deux fois :
   -- l'index unique le refuserait, et le fichier doit rester rejouable.
   AND NOT EXISTS (
     SELECT 1 FROM public.contents x WHERE x.source_lesson_id = p.lesson_id
   );

NOTIFY pgrst, 'reload schema';
