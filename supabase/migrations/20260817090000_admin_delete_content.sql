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
