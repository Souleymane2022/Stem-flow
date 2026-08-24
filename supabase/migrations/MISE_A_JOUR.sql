-- =====================================================================
--  STEMFLOW — mise à jour de la base
-- =====================================================================
--
--  À coller en une fois dans le SQL Editor de Supabase, puis « Run ».
--
--  Ce fichier reprend les six migrations qui suivent l'installation
--  initiale. Toutes sont réexécutables : si une partie est déjà en place,
--  elle est simplement ignorée. Il n'y a donc pas à savoir où on en est.
--
--  Contenu :
--    1. les leçons de cours peuvent rejoindre le fil
--    2. la liste des comptes autorisés à alimenter le catalogue
--    3. la suppression d'une vidéo du fil par un compte autorisé
--    4. le rattachement des vidéos déjà présentes, sans doublon
--    5. le classement du fil et la mesure du visionnage
--    6. les notifications poussées
--    7. le retrait et la suppression d'une playlist
--    8. les séances en direct dans les salons
--    9. les questions du public et leurs votes
--    6. les abonnements aux notifications poussées
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
-- 20260817110000_feed_ranking.sql
-- =============================================================

-- Un fil qui ne se répète pas et qui apprend.
--
-- L'ordre était l'antichronologique pur : mêmes vidéos, même suite, à chaque
-- ouverture. Passé les premières, plus rien de nouveau n'apparaissait, et rien
-- ne tenait compte de ce que la personne regarde vraiment.
--
-- Le classement mêle donc cinq signaux, dont une part de hasard pour que deux
-- visites ne se ressemblent pas. Le hasard est tiré d'une graine fournie par
-- le client : l'ordre reste stable pendant une visite — sinon une même vidéo
-- réapparaîtrait au rechargement de la page suivante — et change à la
-- suivante.

-- --------------------------------------------------- mesure du visionnage
--
-- La table existait mais personne n'y écrivait : le fil ne savait donc pas ce
-- qui avait déjà été vu. Sans cette mémoire, aucun classement ne peut éviter
-- de resservir la même chose.
DELETE FROM public.video_engagements a
 USING public.video_engagements b
 WHERE a.user_id = b.user_id
   AND a.content_id = b.content_id
   AND a.ctid > b.ctid;

CREATE UNIQUE INDEX IF NOT EXISTS video_engagements_user_content_key
  ON public.video_engagements (user_id, content_id);

CREATE OR REPLACE FUNCTION public.record_video_engagement(
  p_content_id uuid,
  p_watch_delta integer,
  p_completion double precision DEFAULT 0
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  -- Le client ne transmet qu'un incrément : plafonné, un appel forgé ne peut
  -- pas fabriquer des heures de visionnage.
  MAX_DELTA constant integer := 60;
  uid uuid := auth.uid();
  delta integer;
  completion double precision;
  is_new boolean := false;
BEGIN
  IF uid IS NULL THEN
    RETURN;
  END IF;

  delta := LEAST(GREATEST(COALESCE(p_watch_delta, 0), 0), MAX_DELTA);
  completion := LEAST(GREATEST(COALESCE(p_completion, 0), 0), 1);

  INSERT INTO public.video_engagements (user_id, content_id, watch_time_seconds, completion_percentage)
  VALUES (uid, p_content_id, delta, completion)
  ON CONFLICT (user_id, content_id) DO UPDATE
    SET watch_time_seconds = public.video_engagements.watch_time_seconds + delta,
        -- La complétion ne redescend pas : revenir au début d'une vidéo déjà
        -- vue en entier ne l'efface pas des vidéos vues.
        completion_percentage = GREATEST(public.video_engagements.completion_percentage, completion)
  RETURNING (xmax = 0) INTO is_new;

  IF is_new THEN
    UPDATE public.contents SET views_count = views_count + 1 WHERE id = p_content_id;
  END IF;
END; $$;

REVOKE EXECUTE ON FUNCTION public.record_video_engagement(uuid, integer, double precision) FROM public;
GRANT EXECUTE ON FUNCTION public.record_video_engagement(uuid, integer, double precision) TO authenticated;

-- ------------------------------------------------------------ classement
CREATE OR REPLACE FUNCTION public.feed_for_me(
  p_limit integer DEFAULT 40,
  p_category text DEFAULT NULL,
  p_seed double precision DEFAULT 0.5
) RETURNS SETOF public.contents
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH me AS (SELECT auth.uid() AS uid),
  -- Goût mesuré : ce que la personne aime et regarde, par catégorie. Une
  -- minute regardée pèse autant qu'un « j'aime », les deux disent la même
  -- chose avec une précision différente.
  taste AS (
    SELECT c.category, 1.0::numeric AS weight
      FROM public.content_likes l
      JOIN public.contents c ON c.id = l.content_id
     WHERE l.user_id = (SELECT uid FROM me)
    UNION ALL
    SELECT c.category, (e.watch_time_seconds / 60.0)::numeric
      FROM public.video_engagements e
      JOIN public.contents c ON c.id = e.content_id
     WHERE e.user_id = (SELECT uid FROM me)
  ),
  taste_by_category AS (
    SELECT category, sum(weight) AS w FROM taste GROUP BY category
  ),
  -- Goût déclaré à l'inscription : seul repère tant que rien n'a été regardé.
  declared AS (
    SELECT unnest(COALESCE(interests, '{}'::text[])) AS category
      FROM public.profiles WHERE id = (SELECT uid FROM me)
  ),
  seen AS (
    SELECT content_id
      FROM public.video_engagements
     WHERE user_id = (SELECT uid FROM me)
       AND (completion_percentage >= 0.6 OR watch_time_seconds >= 20)
  ),
  pool AS (
    SELECT c.*
      FROM public.contents c
     WHERE (p_category IS NULL OR c.category = p_category)
     ORDER BY c.created_at DESC
     LIMIT 400
  ),
  scale AS (
    SELECT GREATEST(max(likes_count + 2 * comments_count + 3 * shares_count), 1) AS top_engagement,
           GREATEST((SELECT max(w) FROM taste_by_category), 1) AS top_taste
      FROM pool
  )
  SELECT p.*
    FROM pool p
    CROSS JOIN scale s
    LEFT JOIN taste_by_category t ON t.category = p.category
   ORDER BY (
       -- ce que la personne regarde vraiment
       0.30 * COALESCE(t.w / s.top_taste, 0)
       -- ce qu'elle a déclaré aimer
     + 0.15 * (CASE WHEN p.category IN (SELECT category FROM declared) THEN 1 ELSE 0 END)
       -- ce que le contenu obtient des autres, en échelle logarithmique pour
       -- qu'une vidéo très partagée n'écrase pas tout le reste
     + 0.20 * (ln(1 + p.likes_count + 2 * p.comments_count + 3 * p.shares_count)
               / ln(1 + s.top_engagement))
       -- fraîcheur, moitié moins de poids après trois semaines
     + 0.15 * exp(-EXTRACT(epoch FROM now() - p.created_at) / (30 * 86400))
       -- hasard : deux visites ne donnent pas la même suite
     + 0.20 * (abs(hashtext(p.id::text || p_seed::text) % 1000) / 1000.0)
       -- déjà vu : fortement repoussé, jamais exclu — une vidéo peut revenir
       -- longtemps après, comme un souvenir
     - 0.60 * (CASE WHEN p.id IN (SELECT content_id FROM seen) THEN 1 ELSE 0 END)
   ) DESC
   LIMIT GREATEST(LEAST(p_limit, 100), 1);
$$;

REVOKE EXECUTE ON FUNCTION public.feed_for_me(integer, text, double precision) FROM public;
GRANT EXECUTE ON FUNCTION public.feed_for_me(integer, text, double precision) TO anon, authenticated;

NOTIFY pgrst, 'reload schema';

-- =============================================================
-- 20260817120000_push_subscriptions.sql
-- =============================================================

-- Abonnements aux notifications poussées.
--
-- Une notification poussée s'adresse à un navigateur, pas à un compte : la
-- même personne sur son téléphone et sur son ordinateur a deux abonnements.
-- L'adresse d'émission (`endpoint`) est unique et sert donc de clé — se
-- réabonner depuis le même appareil met la ligne à jour au lieu d'en empiler
-- une seconde.
CREATE TABLE IF NOT EXISTS public.push_subscriptions (
  endpoint text PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  -- Clés de chiffrement du navigateur : sans elles, le service de push ne
  -- peut pas déchiffrer le message.
  p256dh text NOT NULL,
  auth text NOT NULL,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS push_subscriptions_user_idx ON public.push_subscriptions (user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.push_subscriptions TO authenticated;
GRANT ALL ON public.push_subscriptions TO service_role;
ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;

-- Chacun ne voit et ne gère que ses propres appareils. L'envoi passe par le
-- rôle de service, qui lit la table sans être soumis à ces politiques.
DROP POLICY IF EXISTS push_subscriptions_read_own ON public.push_subscriptions;
CREATE POLICY push_subscriptions_read_own ON public.push_subscriptions
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS push_subscriptions_write_own ON public.push_subscriptions;
CREATE POLICY push_subscriptions_write_own ON public.push_subscriptions
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS push_subscriptions_update_own ON public.push_subscriptions;
CREATE POLICY push_subscriptions_update_own ON public.push_subscriptions
  FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS push_subscriptions_delete_own ON public.push_subscriptions;
CREATE POLICY push_subscriptions_delete_own ON public.push_subscriptions
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

NOTIFY pgrst, 'reload schema';

-- =============================================================
-- 20260817140000_delete_course.sql
-- =============================================================

-- Retirer ou supprimer un cours importé.
--
-- Aucun moyen n'existait pour défaire un import : une playlist ajoutée par
-- erreur, ou dont les vidéos ne conviennent pas, restait au catalogue.
--
-- Une suppression brutale ferait pourtant deux dégâts invisibles, tous deux
-- inscrits dans les clés étrangères :
--
--   certificates -> CASCADE   les diplômes déjà délivrés disparaîtraient, alors
--                             qu'ils sont vérifiables publiquement par leur
--                             numéro de série ;
--   contents     -> CASCADE   les vidéos du fil rattachées au cours partiraient
--                             avec lui — y compris celles qui existaient AVANT
--                             le cours et n'ont été qu'adoptées, soit trente
--                             vidéos livrées avec l'application.
--
-- D'où deux gestes distincts, et une suppression qui refuse plutôt que de
-- détruire ce qu'elle ne devrait pas.

-- ------------------------------------------------- retirer du catalogue
--
-- Réversible : le cours disparaît des listes sans qu'aucune donnée ne soit
-- perdue. C'est la réponse quand des certificats ont été délivrés.
CREATE OR REPLACE FUNCTION public.set_course_published(p_course_id uuid, p_published boolean)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  touched integer;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'authentification requise';
  END IF;
  IF NOT public.is_app_admin() THEN
    RAISE EXCEPTION 'réservé aux comptes autorisés';
  END IF;

  UPDATE public.courses SET published = p_published, updated_at = now() WHERE id = p_course_id;
  GET DIAGNOSTICS touched = ROW_COUNT;
  RETURN touched > 0;
END; $$;

REVOKE EXECUTE ON FUNCTION public.set_course_published(uuid, boolean) FROM public;
GRANT EXECUTE ON FUNCTION public.set_course_published(uuid, boolean) TO authenticated;

-- ------------------------------------------------------- supprimer
CREATE OR REPLACE FUNCTION public.delete_course(p_course_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  issued integer;
  learners integer;
  detached integer;
  removed integer;
  lessons integer;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'authentification requise';
  END IF;
  IF NOT public.is_app_admin() THEN
    RAISE EXCEPTION 'réservé aux comptes autorisés';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.courses WHERE id = p_course_id) THEN
    RETURN jsonb_build_object('deleted', false, 'reason', 'missing');
  END IF;

  -- Un certificat est un document que son titulaire peut faire vérifier par un
  -- tiers. Le détruire parce qu'on range le catalogue n'est pas un arbitrage
  -- que l'application doit prendre seule : on refuse, et on laisse le retrait.
  SELECT count(*) INTO issued FROM public.certificates WHERE course_id = p_course_id;
  IF issued > 0 THEN
    RETURN jsonb_build_object('deleted', false, 'reason', 'certificates', 'certificates', issued);
  END IF;

  SELECT count(*) INTO learners FROM public.course_enrollments WHERE course_id = p_course_id;
  SELECT count(*) INTO lessons FROM public.course_lessons WHERE course_id = p_course_id;

  -- Les vidéos seulement adoptées reprennent leur vie d'avant le cours.
  UPDATE public.contents
     SET source_course_id = NULL, source_lesson_id = NULL
   WHERE source_course_id = p_course_id AND NOT from_lesson;
  GET DIAGNOSTICS detached = ROW_COUNT;

  -- Restent celles que la publication avait créées : elles s'en vont avec le
  -- cours, par cascade.
  SELECT count(*) INTO removed FROM public.contents WHERE source_course_id = p_course_id;

  DELETE FROM public.courses WHERE id = p_course_id;

  RETURN jsonb_build_object(
    'deleted', true,
    'lessons', lessons,
    'learners', learners,
    'feed_detached', detached,
    'feed_removed', removed
  );
END; $$;

REVOKE EXECUTE ON FUNCTION public.delete_course(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.delete_course(uuid) TO authenticated;

-- La liste du catalogue n'affiche que les cours publiés ; l'espace
-- d'administration doit voir aussi ceux qui en ont été retirés, sans quoi ils
-- deviendraient impossibles à remettre.
DROP POLICY IF EXISTS courses_read_admin ON public.courses;
CREATE POLICY courses_read_admin ON public.courses
  FOR SELECT TO authenticated USING (public.is_app_admin());

NOTIFY pgrst, 'reload schema';

-- =============================================================
-- 20260817150000_live_sessions.sql
-- =============================================================

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

-- =============================================================
-- 20260817160000_live_questions.sql
-- =============================================================

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
                           'link_lesson_to_feed', 'unlink_lesson_from_feed',
                           'feed_for_me', 'record_video_engagement',
                           'delete_course', 'set_course_published',
                           'create_live_session', 'set_live_status',
                           'update_live_session', 'delete_live_message',
                           'set_question_answered', 'delete_live_question'))::text || ' / 15'
UNION ALL
SELECT 'comptes autorisés', (SELECT count(*)::text FROM public.app_admins)
UNION ALL
SELECT 'vidéos du fil reliées à une leçon',
       (SELECT count(*)::text FROM public.contents WHERE source_lesson_id IS NOT NULL)
UNION ALL
SELECT 'table des notifications poussées',
       CASE WHEN to_regclass('public.push_subscriptions') IS NULL THEN 'absente' ELSE 'présente' END
UNION ALL
SELECT 'tables des séances en direct',
       (SELECT count(*)::text FROM information_schema.tables
         WHERE table_schema = 'public' AND table_name LIKE 'live_%') || ' / 5'
UNION ALL
SELECT 'doublons dans le fil',
       (SELECT count(*)::text FROM (
          SELECT video_id FROM public.contents
           WHERE video_id IS NOT NULL GROUP BY video_id HAVING count(*) > 1) d);
