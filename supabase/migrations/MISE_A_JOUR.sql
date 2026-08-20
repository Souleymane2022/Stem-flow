-- =====================================================================
--  STEMFLOW — mise à jour de la base
-- =====================================================================
--
--  À coller en une fois dans le SQL Editor de Supabase, puis « Run ».
--
--  Ce fichier reprend les quatre migrations qui suivent l'installation
--  initiale. Toutes sont réexécutables : si une partie est déjà en place,
--  elle est simplement ignorée. Il n'y a donc pas à savoir où on en est.
--
--  Contenu :
--    1. les leçons de cours peuvent rejoindre le fil
--    2. la liste des comptes autorisés à alimenter le catalogue
--    3. la suppression d'une vidéo du fil par un compte autorisé
--    4. le rattachement des vidéos déjà présentes, sans doublon
--
--  Après exécution, le contrôle est en bas du fichier.
-- =====================================================================


-- =============================================================
-- 20260817070000_lessons_in_feed.sql
-- =============================================================

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


-- =============================================================
-- 20260817080000_admins.sql
-- =============================================================

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


-- =============================================================
-- 20260817090000_admin_delete_content.sql
-- =============================================================

-- Retirer une vidéo du fil, quel qu'en soit l'auteur.
--
-- La politique `contents_delete_own` ne laisse supprimer que ses propres
-- publications. Modérer suppose l'inverse : retirer ce qu'un autre a posté.
-- Plutôt que d'ouvrir la politique — ce qui donnerait le droit à tout le
-- monde — la suppression passe par une fonction réservée aux comptes de la
-- liste blanche.
--
-- Les tables qui dépendent d'un contenu (mentions j'aime, enregistrements,
-- commentaires, questions et tentatives de quiz, engagements vidéo) sont
-- toutes en ON DELETE CASCADE : une suppression ne laisse pas d'orphelins.
CREATE OR REPLACE FUNCTION public.delete_content(p_content_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  removed integer;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'authentification requise';
  END IF;
  IF NOT public.is_app_admin() THEN
    RAISE EXCEPTION 'réservé aux comptes autorisés';
  END IF;

  DELETE FROM public.contents WHERE id = p_content_id;
  GET DIAGNOSTICS removed = ROW_COUNT;
  -- Faux si la ligne avait déjà disparu : l'écran peut le dire plutôt que de
  -- laisser croire à une suppression qui n'a rien touché.
  RETURN removed > 0;
END; $$;

REVOKE EXECUTE ON FUNCTION public.delete_content(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.delete_content(uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';


-- =============================================================
-- 20260817100000_adopt_feed_videos.sql
-- =============================================================

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


-- =============================================================
-- Contrôle
-- =============================================================
SELECT 'colonnes de liaison' AS verification,
       (SELECT count(*) FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = 'contents'
           AND column_name IN ('source_course_id', 'source_lesson_id', 'from_lesson'))::text
         || ' / 3' AS resultat
UNION ALL
SELECT 'fonctions',
       (SELECT count(*) FROM pg_proc
         WHERE proname IN ('is_app_admin', 'set_lesson_in_feed', 'delete_content',
                           'link_lesson_to_feed', 'unlink_lesson_from_feed'))::text || ' / 5'
UNION ALL
SELECT 'comptes autorisés', (SELECT count(*)::text FROM public.app_admins)
UNION ALL
SELECT 'vidéos du fil reliées à une leçon',
       (SELECT count(*)::text FROM public.contents WHERE source_lesson_id IS NOT NULL)
UNION ALL
SELECT 'doublons dans le fil',
       (SELECT count(*)::text FROM (
          SELECT video_id FROM public.contents
           WHERE video_id IS NOT NULL GROUP BY video_id HAVING count(*) > 1) d);
