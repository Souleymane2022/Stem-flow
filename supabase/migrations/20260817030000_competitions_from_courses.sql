-- Un défi peut désormais naître d'un cours suivi plutôt que d'une notion saisie
-- à la main. La colonne reste facultative : les défis à sujet libre continuent
-- de fonctionner à l'identique.
--
-- ON DELETE SET NULL et non CASCADE : supprimer un cours ne doit pas effacer
-- les défis qui en sont issus, ni les scores des participants.
ALTER TABLE public.competitions
  ADD COLUMN IF NOT EXISTS source_course_id uuid REFERENCES public.courses(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS competitions_source_course_idx
  ON public.competitions (source_course_id);
