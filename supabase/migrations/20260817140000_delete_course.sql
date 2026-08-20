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
