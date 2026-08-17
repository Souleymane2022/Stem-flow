-- Le compteur de partages était incrémenté par un UPDATE direct sur public.contents.
-- La politique `contents_update_own` exige auth.uid() = author_id : un partage sur
-- le contenu d'autrui — ou sur les contenus initiaux, dont author_id est NULL —
-- était donc silencieusement refusé par RLS. L'interface affichait un compteur
-- incrémenté qui n'existait pas en base.
--
-- Cette fonction SECURITY DEFINER n'autorise que l'incrément de shares_count,
-- sans ouvrir l'UPDATE des autres colonnes.
CREATE OR REPLACE FUNCTION public.increment_shares(content_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE new_count INTEGER;
BEGIN
  UPDATE public.contents
     SET shares_count = shares_count + 1
   WHERE id = increment_shares.content_id
  RETURNING shares_count INTO new_count;

  RETURN new_count;
END; $$;

REVOKE EXECUTE ON FUNCTION public.increment_shares(UUID) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.increment_shares(UUID) TO authenticated;
