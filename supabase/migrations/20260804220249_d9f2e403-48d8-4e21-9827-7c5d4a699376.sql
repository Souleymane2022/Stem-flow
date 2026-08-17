-- PROFILES
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username TEXT UNIQUE NOT NULL,
  email TEXT NOT NULL,
  profile_image_url TEXT,
  preferred_language TEXT DEFAULT 'fr',
  education_level TEXT,
  interests TEXT[] DEFAULT '{}',
  bio TEXT,
  level TEXT DEFAULT 'curieux',
  xp INTEGER NOT NULL DEFAULT 0,
  streak INTEGER NOT NULL DEFAULT 0,
  last_login_date DATE,
  onboarding_completed BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT SELECT ON public.profiles TO anon;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "profiles_read_all" ON public.profiles FOR SELECT USING (true);
CREATE POLICY "profiles_insert_own" ON public.profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);
CREATE POLICY "profiles_update_own" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);
CREATE POLICY "profiles_delete_own" ON public.profiles FOR DELETE TO authenticated USING (auth.uid() = id);

-- CONTENTS
CREATE TABLE public.contents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  content_type TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  video_url TEXT,
  video_id TEXT,
  text_content TEXT,
  image_url TEXT,
  category TEXT NOT NULL,
  difficulty TEXT NOT NULL DEFAULT 'debutant',
  tags TEXT[] DEFAULT '{}',
  xp_reward INTEGER NOT NULL DEFAULT 10,
  author_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  author_name TEXT,
  author_avatar TEXT,
  room_id UUID,
  likes_count INTEGER NOT NULL DEFAULT 0,
  comments_count INTEGER NOT NULL DEFAULT 0,
  shares_count INTEGER NOT NULL DEFAULT 0,
  views_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.contents TO authenticated;
GRANT SELECT ON public.contents TO anon;
GRANT ALL ON public.contents TO service_role;
ALTER TABLE public.contents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "contents_read_all" ON public.contents FOR SELECT USING (true);
CREATE POLICY "contents_insert_own" ON public.contents FOR INSERT TO authenticated WITH CHECK (auth.uid() = author_id);
CREATE POLICY "contents_update_own" ON public.contents FOR UPDATE TO authenticated USING (auth.uid() = author_id) WITH CHECK (auth.uid() = author_id);
CREATE POLICY "contents_delete_own" ON public.contents FOR DELETE TO authenticated USING (auth.uid() = author_id);

-- QUIZ QUESTIONS
CREATE TABLE public.quiz_questions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  content_id UUID REFERENCES public.contents(id) ON DELETE CASCADE,
  question TEXT NOT NULL,
  options TEXT[] NOT NULL,
  correct_option_index INTEGER NOT NULL,
  explanation TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.quiz_questions TO authenticated;
GRANT SELECT ON public.quiz_questions TO anon;
GRANT ALL ON public.quiz_questions TO service_role;
ALTER TABLE public.quiz_questions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "quiz_questions_read_all" ON public.quiz_questions FOR SELECT USING (true);
CREATE POLICY "quiz_questions_write_author" ON public.quiz_questions FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.contents c WHERE c.id = content_id AND c.author_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.contents c WHERE c.id = content_id AND c.author_id = auth.uid()));

-- QUIZ ATTEMPTS
CREATE TABLE public.quiz_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  content_id UUID REFERENCES public.contents(id) ON DELETE CASCADE,
  answers INTEGER[],
  score INTEGER,
  total_questions INTEGER,
  completed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.quiz_attempts TO authenticated;
GRANT ALL ON public.quiz_attempts TO service_role;
ALTER TABLE public.quiz_attempts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "quiz_attempts_own" ON public.quiz_attempts FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- COMMENTS
CREATE TABLE public.comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  content_id UUID REFERENCES public.contents(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  author_name TEXT,
  author_avatar TEXT,
  text TEXT NOT NULL,
  parent_id UUID REFERENCES public.comments(id) ON DELETE CASCADE,
  likes_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.comments TO authenticated;
GRANT SELECT ON public.comments TO anon;
GRANT ALL ON public.comments TO service_role;
ALTER TABLE public.comments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "comments_read_all" ON public.comments FOR SELECT USING (true);
CREATE POLICY "comments_insert_own" ON public.comments FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "comments_update_own" ON public.comments FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "comments_delete_own" ON public.comments FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- LIKES
CREATE TABLE public.content_likes (
  content_id UUID NOT NULL REFERENCES public.contents(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (content_id, user_id)
);
GRANT SELECT, INSERT, DELETE ON public.content_likes TO authenticated;
GRANT SELECT ON public.content_likes TO anon;
GRANT ALL ON public.content_likes TO service_role;
ALTER TABLE public.content_likes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "content_likes_read_all" ON public.content_likes FOR SELECT USING (true);
CREATE POLICY "content_likes_write_own" ON public.content_likes FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "content_likes_delete_own" ON public.content_likes FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- SAVES
CREATE TABLE public.content_saves (
  content_id UUID NOT NULL REFERENCES public.contents(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (content_id, user_id)
);
GRANT SELECT, INSERT, DELETE ON public.content_saves TO authenticated;
GRANT ALL ON public.content_saves TO service_role;
ALTER TABLE public.content_saves ENABLE ROW LEVEL SECURITY;
CREATE POLICY "content_saves_own" ON public.content_saves FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- FOLLOWS
CREATE TABLE public.follows (
  follower_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  following_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (follower_id, following_id)
);
GRANT SELECT, INSERT, DELETE ON public.follows TO authenticated;
GRANT SELECT ON public.follows TO anon;
GRANT ALL ON public.follows TO service_role;
ALTER TABLE public.follows ENABLE ROW LEVEL SECURITY;
CREATE POLICY "follows_read_all" ON public.follows FOR SELECT USING (true);
CREATE POLICY "follows_insert_own" ON public.follows FOR INSERT TO authenticated WITH CHECK (auth.uid() = follower_id);
CREATE POLICY "follows_delete_own" ON public.follows FOR DELETE TO authenticated USING (auth.uid() = follower_id);

-- BADGES
CREATE TABLE public.badges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  icon TEXT,
  category TEXT,
  xp_required INTEGER NOT NULL DEFAULT 0
);
GRANT SELECT ON public.badges TO authenticated, anon;
GRANT ALL ON public.badges TO service_role;
ALTER TABLE public.badges ENABLE ROW LEVEL SECURITY;
CREATE POLICY "badges_read_all" ON public.badges FOR SELECT USING (true);

CREATE TABLE public.user_badges (
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  badge_id UUID NOT NULL REFERENCES public.badges(id) ON DELETE CASCADE,
  earned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, badge_id)
);
GRANT SELECT, INSERT, DELETE ON public.user_badges TO authenticated;
GRANT SELECT ON public.user_badges TO anon;
GRANT ALL ON public.user_badges TO service_role;
ALTER TABLE public.user_badges ENABLE ROW LEVEL SECURITY;
CREATE POLICY "user_badges_read_all" ON public.user_badges FOR SELECT USING (true);
CREATE POLICY "user_badges_insert_own" ON public.user_badges FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

-- MISSIONS
CREATE TABLE public.missions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  mission_type TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  target_value INTEGER NOT NULL,
  current_progress INTEGER NOT NULL DEFAULT 0,
  xp_reward INTEGER NOT NULL DEFAULT 50,
  frequency TEXT NOT NULL DEFAULT 'daily',
  completed BOOLEAN NOT NULL DEFAULT false,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.missions TO authenticated;
GRANT ALL ON public.missions TO service_role;
ALTER TABLE public.missions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "missions_own" ON public.missions FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ROOMS
CREATE TABLE public.rooms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  category TEXT,
  image_url TEXT,
  member_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.rooms TO authenticated, anon;
GRANT ALL ON public.rooms TO service_role;
ALTER TABLE public.rooms ENABLE ROW LEVEL SECURITY;
CREATE POLICY "rooms_read_all" ON public.rooms FOR SELECT USING (true);

CREATE TABLE public.room_members (
  room_id UUID NOT NULL REFERENCES public.rooms(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'apprenant',
  xp_in_room INTEGER NOT NULL DEFAULT 0,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (room_id, user_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.room_members TO authenticated;
GRANT SELECT ON public.room_members TO anon;
GRANT ALL ON public.room_members TO service_role;
ALTER TABLE public.room_members ENABLE ROW LEVEL SECURITY;
CREATE POLICY "room_members_read_all" ON public.room_members FOR SELECT USING (true);
CREATE POLICY "room_members_insert_own" ON public.room_members FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "room_members_delete_own" ON public.room_members FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE TABLE public.room_posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id UUID NOT NULL REFERENCES public.rooms(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  username TEXT,
  text TEXT NOT NULL,
  likes_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.room_posts TO authenticated;
GRANT SELECT ON public.room_posts TO anon;
GRANT ALL ON public.room_posts TO service_role;
ALTER TABLE public.room_posts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "room_posts_read_all" ON public.room_posts FOR SELECT USING (true);
CREATE POLICY "room_posts_insert_own" ON public.room_posts FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "room_posts_delete_own" ON public.room_posts FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- NOTIFICATIONS
CREATE TABLE public.notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  message TEXT,
  read BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.notifications TO authenticated;
GRANT ALL ON public.notifications TO service_role;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "notifications_own" ON public.notifications FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;

-- VIDEO ENGAGEMENTS
CREATE TABLE public.video_engagements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  content_id UUID REFERENCES public.contents(id) ON DELETE CASCADE,
  watch_time_seconds INTEGER NOT NULL DEFAULT 0,
  completion_percentage FLOAT NOT NULL DEFAULT 0,
  liked BOOLEAN NOT NULL DEFAULT false,
  commented BOOLEAN NOT NULL DEFAULT false,
  saved BOOLEAN NOT NULL DEFAULT false,
  shared BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.video_engagements TO authenticated;
GRANT ALL ON public.video_engagements TO service_role;
ALTER TABLE public.video_engagements ENABLE ROW LEVEL SECURITY;
CREATE POLICY "video_engagements_own" ON public.video_engagements FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- COUNTER TRIGGERS
CREATE OR REPLACE FUNCTION public.sync_like_count() RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.contents SET likes_count = likes_count + 1 WHERE id = NEW.content_id;
  ELSE
    UPDATE public.contents SET likes_count = GREATEST(likes_count - 1, 0) WHERE id = OLD.content_id;
  END IF;
  RETURN NULL;
END; $$;
CREATE TRIGGER trg_like_count AFTER INSERT OR DELETE ON public.content_likes FOR EACH ROW EXECUTE FUNCTION public.sync_like_count();

CREATE OR REPLACE FUNCTION public.sync_comment_count() RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.contents SET comments_count = comments_count + 1 WHERE id = NEW.content_id;
  ELSE
    UPDATE public.contents SET comments_count = GREATEST(comments_count - 1, 0) WHERE id = OLD.content_id;
  END IF;
  RETURN NULL;
END; $$;
CREATE TRIGGER trg_comment_count AFTER INSERT OR DELETE ON public.comments FOR EACH ROW EXECUTE FUNCTION public.sync_comment_count();

CREATE OR REPLACE FUNCTION public.sync_room_member_count() RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.rooms SET member_count = member_count + 1 WHERE id = NEW.room_id;
  ELSE
    UPDATE public.rooms SET member_count = GREATEST(member_count - 1, 0) WHERE id = OLD.room_id;
  END IF;
  RETURN NULL;
END; $$;
CREATE TRIGGER trg_room_member_count AFTER INSERT OR DELETE ON public.room_members FOR EACH ROW EXECUTE FUNCTION public.sync_room_member_count();

-- XP increment helper
CREATE OR REPLACE FUNCTION public.add_xp(amount INTEGER) RETURNS INTEGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE new_xp INTEGER;
BEGIN
  UPDATE public.profiles SET xp = xp + GREATEST(amount, 0),
    level = CASE
      WHEN xp + GREATEST(amount,0) >= 10000 THEN 'mentor'
      WHEN xp + GREATEST(amount,0) >= 5000 THEN 'challenger'
      WHEN xp + GREATEST(amount,0) >= 2000 THEN 'analyste'
      WHEN xp + GREATEST(amount,0) >= 500 THEN 'explorateur'
      ELSE 'curieux' END
  WHERE id = auth.uid() RETURNING xp INTO new_xp;
  RETURN new_xp;
END; $$;
GRANT EXECUTE ON FUNCTION public.add_xp(INTEGER) TO authenticated;

-- AUTO PROFILE ON SIGNUP
CREATE OR REPLACE FUNCTION public.handle_new_user() RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, username, email)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'username', split_part(NEW.email, '@', 1) || '_' || substr(NEW.id::text, 1, 4)),
    COALESCE(NEW.email, '')
  ) ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END; $$;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- SEED ROOMS
INSERT INTO public.rooms (name, description, category) VALUES
('Sciences du Vivant', 'Biologie, génétique et écosystèmes africains.', 'Science'),
('Le Lab Tech', 'Dev, gadgets et innovation numérique.', 'Technologie'),
('Ingénieurs en Herbe', 'Projets, prototypes et mécanique.', 'Ingénierie'),
('Les Matheux', 'Défis, démonstrations et astuces de calcul.', 'Mathématiques'),
('IA & Futur', 'Intelligence artificielle et société.', 'Technologie'),
('Physique Avancée', 'Quantique, relativité et astrophysique.', 'Science'),
('Code Africa', 'La communauté des développeurs africains.', 'Technologie'),
('Architecture & BTP', 'Construction, matériaux et design urbain.', 'Ingénierie'),
('Stats & Probabilités', 'Données, hasard et modélisation.', 'Mathématiques'),
('Chimie Organique', 'Molécules, réactions et laboratoire.', 'Science');

-- SEED BADGES
INSERT INTO public.badges (name, description, icon, xp_required) VALUES
('Premier Pas', 'Créez votre premier contenu', '🌱', 0),
('Flamme', '7 jours consécutifs de connexion', '🔥', 0),
('Lecteur', 'Lisez 10 articles', '📚', 0),
('Quiz Master', 'Complétez 10 quiz avec un score parfait', '🧠', 0),
('Étoile Montante', 'Atteignez le niveau Analyste', '⭐', 2000),
('Mentor', 'Atteignez le niveau Mentor', '👑', 10000),
('Connecté', 'Suivez 10 utilisateurs', '🤝', 0),
('Bavard', 'Postez 50 commentaires', '💬', 0);