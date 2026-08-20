-- Publier des leçons de cours dans le fil.
--
-- Une playlist importée ne vivait que dans sa page de cours : rien de ce
-- catalogue n'atteignait le fil, alors que c'est là que les gens passent leur
-- temps. Une leçon peut désormais être poussée dans le fil comme n'importe
-- quel contenu, sans être dupliquée : la ligne `contents` garde un lien vers
-- la leçon d'origine, ce qui permet de la retirer, d'éviter les doublons, et
-- surtout de créditer le visionnage du fil sur la progression du cours.

ALTER TABLE public.contents
  ADD COLUMN IF NOT EXISTS source_course_id uuid REFERENCES public.courses(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS source_lesson_id uuid REFERENCES public.course_lessons(id) ON DELETE CASCADE;

-- Une leçon n'apparaît qu'une fois dans le fil. L'index partiel laisse
-- cohabiter tous les contenus ordinaires, qui n'ont pas de leçon d'origine.
CREATE UNIQUE INDEX IF NOT EXISTS contents_source_lesson_key
  ON public.contents (source_lesson_id) WHERE source_lesson_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS contents_source_course_idx
  ON public.contents (source_course_id) WHERE source_course_id IS NOT NULL;

-- ------------------------------------------------------------ bascule
--
-- Le client ne peut pas insérer ces lignes lui-même : la politique
-- `contents_insert_own` l'autoriserait à se déclarer auteur de n'importe quelle
-- leçon, avec le titre et la catégorie de son choix. La fonction copie les
-- champs depuis la leçon et le cours, donc le fil montre toujours ce que la
-- playlist contient réellement.
--
-- Qui a le droit : l'auteur du cours. Les cours de démarrage n'ont pas
-- d'auteur (`created_by IS NULL`) ; ils restent publiables par n'importe quel
-- membre connecté, sans quoi le catalogue livré avec l'application ne pourrait
-- jamais rejoindre le fil.
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

  SELECT * INTO lesson FROM public.course_lessons WHERE id = p_lesson_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'leçon introuvable';
  END IF;
  SELECT * INTO course FROM public.courses WHERE id = lesson.course_id;
  IF course.created_by IS NOT NULL AND course.created_by <> uid THEN
    RAISE EXCEPTION 'seul l''auteur du cours peut publier ses leçons';
  END IF;

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
    -- La description YouTube d'une leçon est souvent un mur de liens : le fil
    -- n'en affiche que le début, on stocke donc un extrait.
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

-- Le fil doit pouvoir afficher « extrait du cours … » sans requête
-- supplémentaire : PostgREST n'imbrique `courses` que si la relation est
-- visible dans son cache de schéma.
NOTIFY pgrst, 'reload schema';
