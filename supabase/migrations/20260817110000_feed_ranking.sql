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
