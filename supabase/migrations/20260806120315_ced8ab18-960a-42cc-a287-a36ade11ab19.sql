CREATE TABLE public.competitions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  host_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  host_name text,
  topic text NOT NULL,
  category text NOT NULL DEFAULT 'Science',
  difficulty text NOT NULL DEFAULT 'debutant',
  question_count integer NOT NULL DEFAULT 5,
  seconds_per_question integer NOT NULL DEFAULT 20,
  status text NOT NULL DEFAULT 'lobby',
  xp_reward integer NOT NULL DEFAULT 60,
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.competitions TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.competitions TO authenticated;
GRANT ALL ON public.competitions TO service_role;
ALTER TABLE public.competitions ENABLE ROW LEVEL SECURITY;
CREATE POLICY competitions_read_all ON public.competitions FOR SELECT USING (true);
CREATE POLICY competitions_insert_own ON public.competitions FOR INSERT TO authenticated WITH CHECK (auth.uid() = host_id);
CREATE POLICY competitions_update_host ON public.competitions FOR UPDATE TO authenticated USING (auth.uid() = host_id) WITH CHECK (auth.uid() = host_id);
CREATE POLICY competitions_delete_host ON public.competitions FOR DELETE TO authenticated USING (auth.uid() = host_id);

CREATE TABLE public.competition_questions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  competition_id uuid NOT NULL REFERENCES public.competitions(id) ON DELETE CASCADE,
  question text NOT NULL,
  options text[] NOT NULL,
  correct_option_index integer NOT NULL,
  explanation text,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.competition_questions TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.competition_questions TO authenticated;
GRANT ALL ON public.competition_questions TO service_role;
ALTER TABLE public.competition_questions ENABLE ROW LEVEL SECURITY;
CREATE POLICY competition_questions_read_all ON public.competition_questions FOR SELECT USING (true);
CREATE POLICY competition_questions_write_host ON public.competition_questions FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.competitions c WHERE c.id = competition_questions.competition_id AND c.host_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.competitions c WHERE c.id = competition_questions.competition_id AND c.host_id = auth.uid()));

CREATE TABLE public.competition_participants (
  competition_id uuid NOT NULL REFERENCES public.competitions(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  username text,
  avatar_url text,
  score integer NOT NULL DEFAULT 0,
  correct_count integer NOT NULL DEFAULT 0,
  answered_count integer NOT NULL DEFAULT 0,
  finished boolean NOT NULL DEFAULT false,
  finished_at timestamptz,
  joined_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (competition_id, user_id)
);

GRANT SELECT ON public.competition_participants TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.competition_participants TO authenticated;
GRANT ALL ON public.competition_participants TO service_role;
ALTER TABLE public.competition_participants ENABLE ROW LEVEL SECURITY;
CREATE POLICY competition_participants_read_all ON public.competition_participants FOR SELECT USING (true);
CREATE POLICY competition_participants_insert_own ON public.competition_participants FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY competition_participants_update_own ON public.competition_participants FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY competition_participants_delete_own ON public.competition_participants FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

CREATE TRIGGER update_competitions_updated_at BEFORE UPDATE ON public.competitions
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.competitions REPLICA IDENTITY FULL;
ALTER TABLE public.competition_participants REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.competitions;
ALTER PUBLICATION supabase_realtime ADD TABLE public.competition_participants;