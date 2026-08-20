-- =====================================================================
--  STEMFLOW — installation complète de la base, en un seul passage
-- =====================================================================
--
--  Concaténation des 12 migrations, dans l'ordre. À coller tel quel dans
--  le SQL Editor de Supabase, puis « Run ». Une seule exécution suffit.
--
--  Ce fichier ne remplace pas les migrations : il les reprend telles
--  quelles pour éviter autant de copier-coller. Les migrations
--  individuelles restent la référence pour l'historique du projet.
--
--  Ne pas exécuter sur une base qui contient déjà ces tables : les
--  CREATE TABLE des quatre premières migrations ne sont pas idempotents
--  et échoueraient sur « relation already exists ». Sur une base déjà
--  installée, n'appliquer que les migrations manquantes.
--
--  Après exécution, contrôle rapide :
--    select count(*) from public.contents;   -- environ 30 vidéos
--    select title, lesson_count from public.courses;   -- 4 parcours
-- =====================================================================



-- =============================================================
-- 20260804220249_d9f2e403-48d8-4e21-9827-7c5d4a699376.sql
-- =============================================================

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


-- =============================================================
-- 20260804220401_fda81737-d203-4df4-98c9-d6cc66296cef.sql
-- =============================================================

REVOKE EXECUTE ON FUNCTION public.sync_like_count() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.sync_comment_count() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.sync_room_member_count() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.add_xp(INTEGER) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.add_xp(INTEGER) TO authenticated;

INSERT INTO public.contents (content_type, title, description, video_url, video_id, category, difficulty, tags, xp_reward, author_name) VALUES
('video','Les trous noirs expliqués simplement','Plongée dans les objets les plus extrêmes de l''univers.','https://www.youtube.com/watch?v=TdnER8AeIdw','TdnER8AeIdw','Science','intermediaire','{astrophysique,univers}',10,'STEMFLOW'),
('video','La matière noire : l''énigme du cosmos','85% de la matière de l''univers reste invisible. Pourquoi ?','https://www.youtube.com/watch?v=H5Mpw4oSojw','H5Mpw4oSojw','Science','avance','{cosmologie}',10,'STEMFLOW'),
('video','Comprendre l''IA en 20 minutes','Des réseaux de neurones aux grands modèles de langage.','https://www.youtube.com/watch?v=bof3sJ9P5Ss','bof3sJ9P5Ss','Technologie','debutant','{ia,machine-learning}',10,'STEMFLOW'),
('video','Chaque IA expliquée en 19 minutes','Panorama complet des familles d''intelligences artificielles.','https://www.youtube.com/watch?v=yQLmgw3rClM','yQLmgw3rClM','Technologie','intermediaire','{ia}',10,'STEMFLOW'),
('video','Comment fonctionne le moteur d''une voiture ?','Le fonctionnement du moteur thermique, pas à pas.','https://www.youtube.com/watch?v=5ziTd4Mv0cM','5ziTd4Mv0cM','Ingénierie','debutant','{mecanique,moteur}',10,'STEMFLOW'),
('video','Le moteur à réaction décrypté','Comment un avion pousse-t-il des tonnes d''acier dans le ciel ?','https://www.youtube.com/watch?v=6gT8NnjJV2c','6gT8NnjJV2c','Ingénierie','intermediaire','{aeronautique}',10,'STEMFLOW'),
('video','Le plus grand de tous les nombres','Voyage vertigineux dans l''infini mathématique.','https://www.youtube.com/watch?v=e6uLDvUUs8A','e6uLDvUUs8A','Mathématiques','intermediaire','{infini,logique}',10,'STEMFLOW'),
('video','Aux origines du nombre d''or','La proportion la plus célèbre des mathématiques.','https://www.youtube.com/watch?v=VgNUGxBDxUA','VgNUGxBDxUA','Mathématiques','debutant','{geometrie}',10,'STEMFLOW');

INSERT INTO public.contents (content_type, title, description, text_content, category, difficulty, xp_reward, author_name) VALUES
('text_post','La photosynthèse, moteur du vivant','Comment les plantes transforment la lumière en énergie.','Chaque seconde, les feuilles des plantes réalisent une prouesse chimique que nos meilleurs laboratoires peinent à imiter : convertir la lumière du Soleil en énergie chimique.

Dans les chloroplastes, la chlorophylle capte les photons. Cette énergie sert à casser des molécules d''eau, libérant de l''oxygène — celui que nous respirons. Le carbone du CO2 atmosphérique est ensuite assemblé en sucres via le cycle de Calvin.

Bilan : 6 CO2 + 6 H2O + lumière → C6H12O6 + 6 O2.

En Afrique, comprendre ce mécanisme est stratégique : il conditionne le rendement agricole, la sélection de variétés résistantes à la sécheresse et les projets de reforestation du Sahel.','Science','debutant',10,'STEMFLOW'),
('text_post','Pourquoi apprendre à coder change tout','Le code est la langue universelle de l''innovation.','Apprendre à programmer, ce n''est pas mémoriser une syntaxe. C''est apprendre à découper un problème complexe en étapes simples, testables et reproductibles.

Trois raisons de commencer aujourd''hui :

1. Effet de levier : un programme écrit une fois travaille pour des milliers de personnes.
2. Employabilité : le continent africain compte plus d''un million de développeurs, et la demande dépasse largement l''offre.
3. Autonomie : la capacité à construire vos propres outils plutôt que d''attendre qu''on les construise pour vous.

Commencez par Python ou JavaScript, construisez un projet réel dès la première semaine, et publiez-le. Un projet terminé vaut mille tutoriels commencés.','Technologie','debutant',10,'STEMFLOW'),
('text_post','Le béton : le matériau qui a bâti nos villes','Ingénierie des matériaux et défis climatiques.','Le béton est le deuxième matériau le plus consommé au monde après l''eau. Sa recette est ancienne : ciment, granulats, sable et eau. Sa force vient de l''hydratation du ciment, qui crée un réseau cristallin emprisonnant les granulats.

Mais produire une tonne de ciment libère environ 0,6 tonne de CO2. L''ingénierie moderne cherche des alternatives : ciments géopolymères, ajout de cendres volantes, bétons à base de latérite locale.

Pour les ingénieurs africains, l''enjeu est double : construire vite pour des villes qui doublent de population, et construire propre avec des ressources locales.','Ingénierie','intermediaire',10,'STEMFLOW');

WITH q AS (
  INSERT INTO public.contents (content_type, title, description, category, difficulty, xp_reward, author_name)
  VALUES ('quiz','Quiz : les bases du système solaire','Testez vos connaissances sur nos voisines planétaires.','Science','debutant',20,'STEMFLOW')
  RETURNING id
)
INSERT INTO public.quiz_questions (content_id, question, options, correct_option_index, explanation, sort_order)
SELECT q.id, v.question, v.options, v.idx, v.expl, v.ord FROM q, (VALUES
  ('Quelle est la planète la plus proche du Soleil ?', ARRAY['Vénus','Mercure','Mars','Terre'], 1, 'Mercure orbite à environ 58 millions de km du Soleil.', 0),
  ('Combien de planètes compte le système solaire ?', ARRAY['7','8','9','10'], 1, 'Depuis 2006, Pluton est classée planète naine : il reste 8 planètes.', 1),
  ('Quelle planète est appelée la planète rouge ?', ARRAY['Jupiter','Vénus','Mars','Saturne'], 2, 'Sa couleur vient de l''oxyde de fer présent dans son sol.', 2),
  ('Quel est le plus grand satellite naturel de la Terre ?', ARRAY['Titan','Europe','Phobos','La Lune'], 3, 'La Terre n''a qu''un seul satellite naturel : la Lune.', 3)
) AS v(question, options, idx, expl, ord);

WITH q AS (
  INSERT INTO public.contents (content_type, title, description, category, difficulty, xp_reward, author_name)
  VALUES ('quiz','Quiz : logique et algorithmes','4 questions pour affûter votre pensée informatique.','Technologie','intermediaire',20,'STEMFLOW')
  RETURNING id
)
INSERT INTO public.quiz_questions (content_id, question, options, correct_option_index, explanation, sort_order)
SELECT q.id, v.question, v.options, v.idx, v.expl, v.ord FROM q, (VALUES
  ('Que signifie l''acronyme "IA" ?', ARRAY['Interface Automatisée','Intelligence Artificielle','Informatique Appliquée','Index Algorithmique'], 1, 'IA = Intelligence Artificielle.', 0),
  ('Combien de bits contient un octet ?', ARRAY['4','8','16','32'], 1, 'Un octet (byte) vaut exactement 8 bits.', 1),
  ('Quelle structure suit le principe "dernier entré, premier sorti" ?', ARRAY['File (queue)','Pile (stack)','Arbre','Graphe'], 1, 'La pile est LIFO : Last In, First Out.', 2),
  ('En binaire, que vaut le nombre 5 ?', ARRAY['100','101','110','111'], 1, '5 = 4 + 1 = 101 en base 2.', 3)
) AS v(question, options, idx, expl, ord);


-- =============================================================
-- 20260805120433_68b46fd8-a56d-4c7c-ad7f-02a0f15fb845.sql
-- =============================================================

INSERT INTO public.contents (content_type, title, description, video_id, video_url, category, difficulty, xp_reward, author_name, tags) VALUES
('video','Le bang supersonique en 2 minutes','Pourquoi un avion qui dépasse le mur du son fait-il un bang ?','gBHU0QIM3Ik','https://www.youtube.com/watch?v=gBHU0QIM3Ik','Science','debutant',10,'STEMFLOW',ARRAY['physique','son']),
('video','Comprendre : les étoiles','Comment naissent et meurent les étoiles, en moins de 3 minutes.','CDy6kEEClK0','https://www.youtube.com/watch?v=CDy6kEEClK0','Science','debutant',10,'STEMFLOW',ARRAY['astronomie']),
('video','Tout comprendre sur les trous noirs','Un condensé express sur les objets les plus extrêmes de l''univers.','R5SD0JtvBDo','https://www.youtube.com/watch?v=R5SD0JtvBDo','Science','intermediaire',10,'STEMFLOW',ARRAY['astronomie']),
('video','C''est grand comment, l''Univers ?','Une plongée rapide dans les échelles du cosmos.','BjxHfIPBx_w','https://www.youtube.com/watch?v=BjxHfIPBx_w','Science','debutant',10,'STEMFLOW',ARRAY['astronomie']),
('video','Qu''est-ce que l''ADN ?','La molécule de la vie expliquée en 90 secondes.','Pkk49gSRrHY','https://www.youtube.com/watch?v=Pkk49gSRrHY','Science','debutant',10,'STEMFLOW',ARRAY['biologie']),
('video','C''est quoi l''ADN ?','Gènes, chromosomes et hérédité en version courte.','805KLPIZNvA','https://www.youtube.com/watch?v=805KLPIZNvA','Science','debutant',10,'STEMFLOW',ARRAY['biologie']),
('video','La physique quantique par Alain Aspect','Le prix Nobel explique la quantique en 2 minutes.','MblNyMU99hQ','https://www.youtube.com/watch?v=MblNyMU99hQ','Science','avance',10,'STEMFLOW',ARRAY['quantique']),
('video','Le neurone en 2 minutes','Comment fonctionne la cellule de base du cerveau.','6qS83wD29PY','https://www.youtube.com/watch?v=6qS83wD29PY','Science','intermediaire',10,'STEMFLOW',ARRAY['neurosciences']),
('video','Qu''est-ce que l''intelligence artificielle ?','L''IA expliquée en moins de 90 secondes.','cX9V3iNBUoo','https://www.youtube.com/watch?v=cX9V3iNBUoo','Technologie','debutant',10,'STEMFLOW',ARRAY['ia']),
('video','C''est quoi l''intelligence artificielle ?','Une explication claire et rapide de l''IA.','PBJ9_G8d6mo','https://www.youtube.com/watch?v=PBJ9_G8d6mo','Technologie','debutant',10,'STEMFLOW',ARRAY['ia']),
('video','C''est quoi un algorithme ?','La notion d''algorithme en 2 minutes.','ioCiS980Dbg','https://www.youtube.com/watch?v=ioCiS980Dbg','Technologie','debutant',10,'STEMFLOW',ARRAY['code']),
('video','Un algorithme, c''est quoi ?','Définition simple et exemples concrets.','oBNqOGAWH0k','https://www.youtube.com/watch?v=oBNqOGAWH0k','Technologie','debutant',10,'STEMFLOW',ARRAY['code']),
('video','Comment fonctionne un moteur à réaction ?','Le principe du réacteur en 90 secondes.','kMZ7Hu8TNps','https://www.youtube.com/watch?v=kMZ7Hu8TNps','Ingénierie','debutant',10,'STEMFLOW',ARRAY['mecanique']),
('video','Qu''est-ce qu''un moteur à deux temps ?','Un format ultra court pour comprendre le 2-temps.','bT44MMgdM9Y','https://www.youtube.com/watch?v=bT44MMgdM9Y','Ingénierie','debutant',10,'STEMFLOW',ARRAY['mecanique']),
('video','Construction des ponts en génie civil','Les grandes étapes d''un chantier de pont.','4976ZEB7aEI','https://www.youtube.com/watch?v=4976ZEB7aEI','Ingénierie','intermediaire',10,'STEMFLOW',ARRAY['genie-civil']),
('video','Structure des ponts','Comment les forces circulent dans un pont.','AJmv6PfcQeg','https://www.youtube.com/watch?v=AJmv6PfcQeg','Ingénierie','intermediaire',10,'STEMFLOW',ARRAY['genie-civil']),
('video','Les phases d''exécution d''un pont à poutres','Un chantier expliqué étape par étape.','sFXh4-pbL2A','https://www.youtube.com/watch?v=sFXh4-pbL2A','Ingénierie','avance',10,'STEMFLOW',ARRAY['genie-civil']),
('video','Les suites arithmétiques en 2 minutes','L''essentiel des suites arithmétiques.','4696gJoJaAk','https://www.youtube.com/watch?v=4696gJoJaAk','Mathématiques','intermediaire',10,'STEMFLOW',ARRAY['algebre']),
('video','Comprendre les fractions en 1 minute','Une révision express des fractions.','EqzgQb9vdN0','https://www.youtube.com/watch?v=EqzgQb9vdN0','Mathématiques','debutant',10,'STEMFLOW',ARRAY['fractions']),
('video','Toutes les maths expliquées en 2 minutes','Un panorama rapide des branches des mathématiques.','wercBIRDR9Q','https://www.youtube.com/watch?v=wercBIRDR9Q','Mathématiques','debutant',10,'STEMFLOW',ARRAY['culture-maths']),
('video','Proportions et pourcentages en 2 min','Méthode et exemples pour les pourcentages.','jEYznOEEZrc','https://www.youtube.com/watch?v=jEYznOEEZrc','Mathématiques','debutant',10,'STEMFLOW',ARRAY['pourcentages']),
('video','La meilleure explication de Pi','Le nombre Pi en 73 secondes.','TlY-Sh9Rzas','https://www.youtube.com/watch?v=TlY-Sh9Rzas','Mathématiques','debutant',10,'STEMFLOW',ARRAY['pi']);


-- =============================================================
-- 20260806120315_ced8ab18-960a-42cc-a287-a36ade11ab19.sql
-- =============================================================

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


-- =============================================================
-- 20260817000000_fix_share_count_and_quiz_replay.sql
-- =============================================================

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


-- =============================================================
-- 20260817010000_restore_table_grants.sql
-- =============================================================

-- Rétablit les privilèges de table de l'application.
--
-- Symptôme constaté en production : « permission denied for table profiles » au
-- chargement du profil. Ce message n'est pas un refus de politique RLS — une RLS
-- qui refuse une lecture renvoie zéro ligne, et sur écriture lève « new row
-- violates row-level security policy ». « permission denied for table » est
-- strictement une erreur de privilèges (GRANT/ACL) : le rôle appelant n'a aucun
-- droit sur la table.
--
-- Les migrations initiales accordent bien ces privilèges, mais la base en ligne
-- ne les porte pas : son schéma y a été provisionné séparément. Cette migration
-- les réaffirme.
--
-- GRANT est idempotent : réaccorder un privilège déjà présent ne fait rien.
-- Ces droits ne contournent pas la sécurité — RLS reste active sur chaque table
-- et continue de filtrer les lignes. Les deux mécanismes sont complémentaires :
-- sans GRANT aucune requête ne passe, sans RLS toutes les lignes seraient
-- visibles.
--
-- Les objets absents sont ignorés au lieu d'interrompre le script : la base en
-- ligne peut ne pas porter exactement le même schéma que ces migrations.

DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT *
      FROM (VALUES
        -- table,                     privilèges anon, privilèges authenticated
        ('profiles',                 'SELECT', 'SELECT, INSERT, UPDATE, DELETE'),
        ('contents',                 'SELECT', 'SELECT, INSERT, UPDATE, DELETE'),
        ('comments',                 'SELECT', 'SELECT, INSERT, UPDATE, DELETE'),
        ('content_likes',            'SELECT', 'SELECT, INSERT, DELETE'),
        ('content_saves',            '',       'SELECT, INSERT, DELETE'),
        ('follows',                  'SELECT', 'SELECT, INSERT, DELETE'),
        ('rooms',                    'SELECT', 'SELECT'),
        ('room_members',             'SELECT', 'SELECT, INSERT, UPDATE, DELETE'),
        ('room_posts',               'SELECT', 'SELECT, INSERT, UPDATE, DELETE'),
        ('quiz_questions',           'SELECT', 'SELECT, INSERT, UPDATE, DELETE'),
        ('quiz_attempts',            '',       'SELECT, INSERT, UPDATE, DELETE'),
        ('badges',                   'SELECT', 'SELECT'),
        ('user_badges',              'SELECT', 'SELECT, INSERT, DELETE'),
        ('missions',                 '',       'SELECT, INSERT, UPDATE, DELETE'),
        ('notifications',            '',       'SELECT, INSERT, UPDATE, DELETE'),
        ('video_engagements',        '',       'SELECT, INSERT, UPDATE, DELETE'),
        ('competitions',             'SELECT', 'SELECT, INSERT, UPDATE, DELETE'),
        ('competition_questions',    'SELECT', 'SELECT, INSERT, UPDATE, DELETE'),
        ('competition_participants', 'SELECT', 'SELECT, INSERT, UPDATE, DELETE')
      ) AS t(tbl, anon_privs, auth_privs)
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = r.tbl
    ) THEN
      RAISE NOTICE 'table public.% absente, ignorée', r.tbl;
      CONTINUE;
    END IF;

    IF r.anon_privs <> '' THEN
      EXECUTE format('GRANT %s ON public.%I TO anon', r.anon_privs, r.tbl);
    END IF;
    EXECUTE format('GRANT %s ON public.%I TO authenticated', r.auth_privs, r.tbl);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', r.tbl);
  END LOOP;
END $$;

GRANT USAGE ON SCHEMA public TO anon, authenticated;

-- Fonctions appelées depuis le client. Elles sont en SECURITY DEFINER : sans
-- EXECUTE, l'appel échoue de la même manière qu'une table sans GRANT.
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT *
      FROM (VALUES
        ('add_xp',           'integer'),
        ('increment_shares', 'uuid')
      ) AS t(fn, arg)
  LOOP
    -- to_regprocedure résout la signature exacte et renvoie NULL si elle
    -- n'existe pas. Comparer pg_get_function_identity_arguments à « integer »
    -- ne marchait pas : cette fonction renvoie « amount integer », nom du
    -- paramètre inclus, et les GRANT étaient donc ignorés en silence.
    IF to_regprocedure(format('public.%I(%s)', r.fn, r.arg)) IS NOT NULL THEN
      EXECUTE format('GRANT EXECUTE ON FUNCTION public.%I(%s) TO authenticated', r.fn, r.arg);
    ELSE
      RAISE NOTICE 'fonction public.%(%) absente, ignorée', r.fn, r.arg;
    END IF;
  END LOOP;
END $$;

-- Contrôle après application : doit lister au moins SELECT pour authenticated.
--   SELECT grantee, privilege_type
--     FROM information_schema.role_table_grants
--    WHERE table_schema = 'public' AND table_name = 'profiles'
--    ORDER BY grantee, privilege_type;


-- =============================================================
-- 20260817020000_courses_and_certificates.sql
-- =============================================================

-- Parcours de cours à partir de playlists YouTube, avec suivi de progression
-- et délivrance de certificats.
--
-- Principe de confiance : la progression est décidée par la base, jamais par
-- le client. Le navigateur ne peut que déclarer « j'ai regardé N secondes de
-- plus » ; la fonction record_lesson_progress plafonne cet incrément, cumule
-- côté serveur et décide seule de l'achèvement d'une leçon, de la progression
-- du cours et de l'émission du certificat. Un client modifié ne peut donc pas
-- s'auto-déclarer diplômé.

-- ---------------------------------------------------------------- cours
CREATE TABLE IF NOT EXISTS public.courses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  description text,
  category text NOT NULL DEFAULT 'Science',
  difficulty text NOT NULL DEFAULT 'debutant',
  -- Renseigné pour un cours importé d'une playlist, NULL pour un cours composé à la main.
  youtube_playlist_id text UNIQUE,
  thumbnail_url text,
  lesson_count integer NOT NULL DEFAULT 0,
  total_duration_seconds integer NOT NULL DEFAULT 0,
  xp_reward integer NOT NULL DEFAULT 200,
  -- Fraction de chaque vidéo à visionner pour valider la leçon.
  passing_ratio numeric NOT NULL DEFAULT 0.9 CHECK (passing_ratio > 0 AND passing_ratio <= 1),
  published boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.course_lessons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id uuid NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
  video_id text NOT NULL,
  title text NOT NULL,
  description text,
  duration_seconds integer NOT NULL DEFAULT 0,
  sort_order integer NOT NULL DEFAULT 0,
  UNIQUE (course_id, video_id)
);
CREATE INDEX IF NOT EXISTS course_lessons_course_idx ON public.course_lessons (course_id, sort_order);

CREATE TABLE IF NOT EXISTS public.course_enrollments (
  course_id uuid NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  progress_percent integer NOT NULL DEFAULT 0,
  completed_lessons integer NOT NULL DEFAULT 0,
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  PRIMARY KEY (course_id, user_id)
);

CREATE TABLE IF NOT EXISTS public.lesson_progress (
  lesson_id uuid NOT NULL REFERENCES public.course_lessons(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  watched_seconds integer NOT NULL DEFAULT 0,
  last_position_seconds integer NOT NULL DEFAULT 0,
  completed boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (lesson_id, user_id)
);

CREATE TABLE IF NOT EXISTS public.certificates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Code public de vérification, imprimé sur le certificat.
  serial text UNIQUE NOT NULL,
  course_id uuid NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  recipient_name text NOT NULL,
  course_title text NOT NULL,
  issued_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (course_id, user_id)
);

-- ------------------------------------------------------- droits et RLS
GRANT SELECT ON public.courses, public.course_lessons, public.certificates TO anon;
GRANT SELECT ON public.courses, public.course_lessons TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.course_enrollments TO authenticated;
GRANT SELECT ON public.lesson_progress TO authenticated;
GRANT SELECT ON public.certificates TO authenticated;
GRANT ALL ON public.courses, public.course_lessons, public.course_enrollments,
             public.lesson_progress, public.certificates TO service_role;

ALTER TABLE public.courses            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.course_lessons     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.course_enrollments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lesson_progress    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.certificates       ENABLE ROW LEVEL SECURITY;

CREATE POLICY courses_read_published ON public.courses
  FOR SELECT USING (published);
CREATE POLICY course_lessons_read_all ON public.course_lessons
  FOR SELECT USING (true);

CREATE POLICY enrollments_read_own ON public.course_enrollments
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY enrollments_write_own ON public.course_enrollments
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY enrollments_delete_own ON public.course_enrollments
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE POLICY lesson_progress_read_own ON public.lesson_progress
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

-- Les certificats sont publics : leur code de série doit pouvoir être vérifié
-- par un tiers (recruteur, établissement) sans compte sur l'application.
CREATE POLICY certificates_read_all ON public.certificates
  FOR SELECT USING (true);

-- Aucune politique d'écriture sur lesson_progress ni certificates : ces tables
-- ne sont alimentées que par record_lesson_progress, en SECURITY DEFINER.

-- --------------------------------------------------- compteurs du cours
CREATE OR REPLACE FUNCTION public.sync_course_totals()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE target uuid := COALESCE(NEW.course_id, OLD.course_id);
BEGIN
  UPDATE public.courses c
     SET lesson_count = (SELECT count(*) FROM public.course_lessons l WHERE l.course_id = target),
         total_duration_seconds = (SELECT COALESCE(sum(l.duration_seconds), 0)
                                     FROM public.course_lessons l WHERE l.course_id = target),
         updated_at = now()
   WHERE c.id = target;
  RETURN NULL;
END; $$;
REVOKE EXECUTE ON FUNCTION public.sync_course_totals() FROM anon, authenticated, public;

DROP TRIGGER IF EXISTS trg_course_totals ON public.course_lessons;
CREATE TRIGGER trg_course_totals
  AFTER INSERT OR UPDATE OR DELETE ON public.course_lessons
  FOR EACH ROW EXECUTE FUNCTION public.sync_course_totals();

-- ------------------------------------------- progression et certificat
--
-- Appelée par le lecteur toutes les quelques secondes. Le client ne transmet
-- qu'un incrément de temps visionné ; tout le reste est calculé ici.
--
--   p_watched_delta : secondes réellement écoulées depuis le dernier appel.
--                     Plafonné : une avance rapide ou un appel forgé ne peut
--                     pas créditer plus que MAX_DELTA à la fois.
--   p_duration      : durée de la vidéo, connue du lecteur. Elle n'est
--                     enregistrée que si elle manque encore, car un import de
--                     playlist ne la fournit pas toujours.
CREATE OR REPLACE FUNCTION public.record_lesson_progress(
  p_lesson_id uuid,
  p_watched_delta integer,
  p_position integer DEFAULT 0,
  p_duration integer DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  MAX_DELTA constant integer := 30;
  uid uuid := auth.uid();
  lesson public.course_lessons%ROWTYPE;
  course public.courses%ROWTYPE;
  delta integer;
  needed integer;
  total_done integer;
  percent integer;
  was_complete boolean;
  new_serial text;
  existing_serial text;
  attempt integer := 0;
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'authentification requise';
  END IF;

  SELECT * INTO lesson FROM public.course_lessons WHERE id = p_lesson_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'leçon introuvable';
  END IF;
  SELECT * INTO course FROM public.courses WHERE id = lesson.course_id;

  -- La durée réelle vient du lecteur, une seule fois.
  IF lesson.duration_seconds = 0 AND p_duration IS NOT NULL
     AND p_duration BETWEEN 1 AND 86400 THEN
    UPDATE public.course_lessons SET duration_seconds = p_duration WHERE id = lesson.id;
    lesson.duration_seconds := p_duration;
  END IF;

  delta := LEAST(GREATEST(COALESCE(p_watched_delta, 0), 0), MAX_DELTA);
  needed := CASE WHEN lesson.duration_seconds > 0
                 THEN ceil(course.passing_ratio * lesson.duration_seconds)::integer
                 ELSE NULL END;

  INSERT INTO public.lesson_progress (lesson_id, user_id, watched_seconds, last_position_seconds)
  VALUES (lesson.id, uid, delta, GREATEST(COALESCE(p_position, 0), 0))
  ON CONFLICT (lesson_id, user_id) DO UPDATE
    SET watched_seconds = LEAST(
          public.lesson_progress.watched_seconds + delta,
          GREATEST(lesson.duration_seconds, public.lesson_progress.watched_seconds + delta)
        ),
        last_position_seconds = GREATEST(COALESCE(p_position, 0), 0),
        updated_at = now();

  -- Le cumul ne peut pas dépasser la durée de la vidéo.
  IF lesson.duration_seconds > 0 THEN
    UPDATE public.lesson_progress
       SET watched_seconds = LEAST(watched_seconds, lesson.duration_seconds)
     WHERE lesson_id = lesson.id AND user_id = uid;
  END IF;

  UPDATE public.lesson_progress
     SET completed = (needed IS NOT NULL AND watched_seconds >= needed)
   WHERE lesson_id = lesson.id AND user_id = uid
   RETURNING completed INTO was_complete;

  -- Progression du cours
  SELECT count(*) INTO total_done
    FROM public.lesson_progress lp
    JOIN public.course_lessons l ON l.id = lp.lesson_id
   WHERE l.course_id = course.id AND lp.user_id = uid AND lp.completed;

  percent := CASE WHEN course.lesson_count > 0
                  THEN LEAST(100, (total_done * 100) / course.lesson_count)
                  ELSE 0 END;

  INSERT INTO public.course_enrollments (course_id, user_id, progress_percent, completed_lessons)
  VALUES (course.id, uid, percent, total_done)
  ON CONFLICT (course_id, user_id) DO UPDATE
    SET progress_percent = EXCLUDED.progress_percent,
        completed_lessons = EXCLUDED.completed_lessons,
        completed_at = CASE WHEN EXCLUDED.progress_percent >= 100
                            THEN COALESCE(public.course_enrollments.completed_at, now())
                            ELSE NULL END;

  SELECT serial INTO existing_serial
    FROM public.certificates WHERE course_id = course.id AND user_id = uid;

  -- Certificat : toutes les leçons validées, et le cours en compte au moins une.
  IF existing_serial IS NULL AND course.lesson_count > 0 AND total_done >= course.lesson_count THEN
    LOOP
      attempt := attempt + 1;
      new_serial := 'STF-' || upper(substr(md5(gen_random_uuid()::text), 1, 5))
                          || '-' || upper(substr(md5(gen_random_uuid()::text), 1, 5));
      BEGIN
        INSERT INTO public.certificates (serial, course_id, user_id, recipient_name, course_title)
        SELECT new_serial, course.id, uid, p.username, course.title
          FROM public.profiles p WHERE p.id = uid;
        existing_serial := new_serial;
        EXIT;
      EXCEPTION WHEN unique_violation THEN
        -- Collision de série : on retente. Au-delà, la course est perdue contre
        -- un autre appel concurrent, qui a déjà créé le certificat.
        IF attempt >= 5 THEN
          SELECT serial INTO existing_serial
            FROM public.certificates WHERE course_id = course.id AND user_id = uid;
          EXIT;
        END IF;
      END;
    END LOOP;

    IF existing_serial = new_serial THEN
      PERFORM public.add_xp(course.xp_reward);
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'lesson_completed', COALESCE(was_complete, false),
    'course_percent', percent,
    'completed_lessons', total_done,
    'lesson_count', course.lesson_count,
    'certificate_serial', existing_serial
  );
END; $$;

REVOKE EXECUTE ON FUNCTION public.record_lesson_progress(uuid, integer, integer, integer) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.record_lesson_progress(uuid, integer, integer, integer) TO authenticated;

-- ------------------------------------------------- cours de démarrage
--
-- Construits à partir des vidéos déjà présentes dans public.contents : leurs
-- identifiants YouTube sont réels et déjà utilisés par le fil. Aucun cours
-- n'est créé si la catégorie compte moins de trois vidéos.
DO $$
DECLARE
  c record;
  cid uuid;
  n integer;
  first_video text;
BEGIN
  FOR c IN
    SELECT * FROM (VALUES
      ('Science', 'Parcours Sciences — du neurone aux trous noirs',
       'Un panorama guidé de la physique, de l''astronomie et du vivant. Visionne chaque vidéo jusqu''au bout pour obtenir ton certificat.'),
      ('Technologie', 'Parcours Technologie — algorithmes et intelligence artificielle',
       'Des bases de l''algorithmique aux grands modèles de langage, en vidéos courtes.'),
      ('Ingénierie', 'Parcours Ingénierie — moteurs, ponts et structures',
       'Comment tiennent les ponts, comment tournent les moteurs : l''ingénierie expliquée simplement.'),
      ('Mathématiques', 'Parcours Mathématiques — les notions essentielles',
       'Fractions, proportions, suites et nombres remarquables, une notion par vidéo.')
    ) AS t(category, title, description)
  LOOP
    CONTINUE WHEN EXISTS (SELECT 1 FROM public.courses WHERE title = c.title);

    SELECT count(*) INTO n
      FROM public.contents
     WHERE content_type = 'video' AND category = c.category AND video_id IS NOT NULL;
    CONTINUE WHEN n < 3;

    SELECT video_id INTO first_video
      FROM public.contents
     WHERE content_type = 'video' AND category = c.category AND video_id IS NOT NULL
     ORDER BY created_at LIMIT 1;

    INSERT INTO public.courses (title, description, category, difficulty, thumbnail_url, xp_reward)
    VALUES (c.title, c.description, c.category, 'debutant',
            'https://i.ytimg.com/vi/' || first_video || '/hqdefault.jpg', 200)
    RETURNING id INTO cid;

    INSERT INTO public.course_lessons (course_id, video_id, title, description, sort_order)
    SELECT cid, v.video_id, v.title, v.description,
           row_number() OVER (ORDER BY v.created_at)
      FROM (SELECT DISTINCT ON (video_id) video_id, title, description, created_at
              FROM public.contents
             WHERE content_type = 'video' AND category = c.category AND video_id IS NOT NULL
             ORDER BY video_id, created_at) v;
  END LOOP;
END $$;

-- Contrôle après application :
--   SELECT title, category, lesson_count FROM public.courses ORDER BY category;


-- =============================================================
-- 20260817030000_competitions_from_courses.sql
-- =============================================================

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


-- =============================================================
-- 20260817040000_course_duels.sql
-- =============================================================

-- Progression visible entre apprenants d'un même cours, et duels entre deux
-- d'entre eux.
--
-- Choix de confidentialité : voir la progression d'autrui est une exposition de
-- données personnelles. Elle est donc conditionnée à un consentement explicite,
-- porté par profiles.share_progress. La valeur par défaut est `true` parce que
-- l'application est conçue autour de l'émulation entre apprenants, mais chacun
-- peut se retirer sans perdre l'accès aux cours.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS share_progress boolean NOT NULL DEFAULT true;

-- Un défi peut viser une personne précise, et rester privé entre les deux.
ALTER TABLE public.competitions
  ADD COLUMN IF NOT EXISTS opponent_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL;

ALTER TABLE public.competitions
  ADD COLUMN IF NOT EXISTS visibility text NOT NULL DEFAULT 'public';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'competitions_visibility_check') THEN
    ALTER TABLE public.competitions
      ADD CONSTRAINT competitions_visibility_check CHECK (visibility IN ('public', 'private'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS competitions_opponent_idx ON public.competitions (opponent_id);

-- ------------------------------------------------------ visibilité RLS
-- La progression d'autrui n'est lisible que si son auteur l'a acceptée.
DROP POLICY IF EXISTS enrollments_read_shared ON public.course_enrollments;
CREATE POLICY enrollments_read_shared ON public.course_enrollments
  FOR SELECT TO authenticated
  USING (
    auth.uid() = user_id
    OR EXISTS (
      SELECT 1 FROM public.profiles p
       WHERE p.id = public.course_enrollments.user_id AND p.share_progress
    )
  );

-- Un défi privé ne concerne que ses deux protagonistes.
DROP POLICY IF EXISTS competitions_read_all ON public.competitions;
DROP POLICY IF EXISTS competitions_read_visible ON public.competitions;
CREATE POLICY competitions_read_visible ON public.competitions
  FOR SELECT
  USING (
    visibility = 'public'
    OR auth.uid() = host_id
    OR auth.uid() = opponent_id
  );

-- ------------------------------------------------------------- le duel
--
-- Créer un duel touche à plusieurs tables et doit notifier des tiers : la
-- politique d'insertion des notifications restreint chacun à ses propres
-- lignes, ce qui interdit au client de prévenir qui que ce soit. D'où une
-- fonction SECURITY DEFINER, seule habilitée à écrire ces notifications.
CREATE OR REPLACE FUNCTION public.create_course_duel(
  p_course_id uuid,
  p_opponent_id uuid,
  p_visibility text DEFAULT 'public',
  p_question_count integer DEFAULT 5
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  uid uuid := auth.uid();
  me public.profiles%ROWTYPE;
  foe public.profiles%ROWTYPE;
  course public.courses%ROWTYPE;
  vis text := CASE WHEN p_visibility = 'private' THEN 'private' ELSE 'public' END;
  new_id uuid;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'authentification requise'; END IF;
  IF uid = p_opponent_id THEN RAISE EXCEPTION 'on ne se défie pas soi-même'; END IF;

  SELECT * INTO me FROM public.profiles WHERE id = uid;
  IF NOT FOUND THEN RAISE EXCEPTION 'profil introuvable'; END IF;
  SELECT * INTO foe FROM public.profiles WHERE id = p_opponent_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'adversaire introuvable'; END IF;
  SELECT * INTO course FROM public.courses WHERE id = p_course_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'cours introuvable'; END IF;

  -- Défier suppose de suivre le cours : sans quoi le défi ne porterait sur
  -- rien de commun aux deux personnes.
  IF NOT EXISTS (
    SELECT 1 FROM public.course_enrollments
     WHERE course_id = p_course_id AND user_id = uid
  ) THEN
    RAISE EXCEPTION 'commence le cours avant de lancer un défi dessus';
  END IF;

  INSERT INTO public.competitions (
    host_id, host_name, topic, category, difficulty,
    question_count, xp_reward, source_course_id, opponent_id, visibility
  ) VALUES (
    uid, me.username, course.title, course.category, course.difficulty,
    GREATEST(LEAST(COALESCE(p_question_count, 5), 12), 3), 60, course.id, p_opponent_id, vis
  ) RETURNING id INTO new_id;

  -- Les deux protagonistes sont inscrits d'emblée.
  INSERT INTO public.competition_participants (competition_id, user_id, username, avatar_url)
  VALUES (new_id, uid, me.username, me.profile_image_url),
         (new_id, p_opponent_id, foe.username, foe.profile_image_url)
  ON CONFLICT DO NOTHING;

  -- L'adversaire est prévenu dans tous les cas.
  INSERT INTO public.notifications (user_id, type, title, message)
  VALUES (
    p_opponent_id, 'duel',
    format('%s te défie sur « %s »', me.username, course.title),
    'Rejoins le défi et réponds plus vite que ton adversaire.'
  );

  -- Défi public : les autres apprenants du cours en sont informés. Plafonné,
  -- pour qu'un cours très suivi ne déclenche pas des milliers d'écritures.
  IF vis = 'public' THEN
    INSERT INTO public.notifications (user_id, type, title, message)
    SELECT e.user_id, 'duel_public',
           format('%s et %s s''affrontent sur « %s »', me.username, foe.username, course.title),
           'Ouvre le défi pour suivre le duel en direct.'
      FROM public.course_enrollments e
     WHERE e.course_id = p_course_id
       AND e.user_id NOT IN (uid, p_opponent_id)
     LIMIT 200;
  END IF;

  RETURN new_id;
END; $$;

REVOKE EXECUTE ON FUNCTION public.create_course_duel(uuid, uuid, text, integer) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.create_course_duel(uuid, uuid, text, integer) TO authenticated;


-- =============================================================
-- 20260817050000_competition_modes.sql
-- =============================================================

-- Modes de compétition et invitations.
--
--   solo  — s'entraîner seul sur un cours ;
--   duel  — affrontement entre deux personnes désignées ;
--   open  — salon ouvert, que n'importe qui peut rejoindre.
--
-- Jusqu'ici toute compétition était implicitement ouverte : la politique
-- d'insertion des participants n'exigeait que `auth.uid() = user_id`, si bien
-- qu'un tiers pouvait s'inviter dans un duel privé en devinant son
-- identifiant. Le mode devient donc une règle d'accès, pas un simple libellé.

-- Cette migration s'appuie sur 20260817040000_course_duels.sql (colonnes
-- opponent_id et visibility). Sans elle, PostgreSQL échouerait plus bas sur un
-- « column does not exist » qui n'indique pas la marche à suivre.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'competitions'
       AND column_name = 'opponent_id'
  ) THEN
    RAISE EXCEPTION 'Applique d''abord 20260817040000_course_duels.sql : la colonne competitions.opponent_id est absente.';
  END IF;
END $$;

ALTER TABLE public.competitions
  ADD COLUMN IF NOT EXISTS mode text NOT NULL DEFAULT 'open';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'competitions_mode_check') THEN
    ALTER TABLE public.competitions
      ADD CONSTRAINT competitions_mode_check CHECK (mode IN ('solo', 'duel', 'open'));
  END IF;
END $$;

-- Les duels déjà créés désignent un adversaire : ils relèvent du mode duel.
UPDATE public.competitions SET mode = 'duel' WHERE opponent_id IS NOT NULL AND mode = 'open';

-- ------------------------------------------------------- invitations
CREATE TABLE IF NOT EXISTS public.competition_invites (
  competition_id uuid NOT NULL REFERENCES public.competitions(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  invited_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (competition_id, user_id)
);

GRANT SELECT ON public.competition_invites TO authenticated;
GRANT ALL ON public.competition_invites TO service_role;
ALTER TABLE public.competition_invites ENABLE ROW LEVEL SECURITY;


-- --------------------------------------------- sortir de la récursion
--
-- Une politique sur `competitions` qui interroge `competition_invites`, et une
-- politique sur `competition_invites` qui interroge `competitions`, forment un
-- cycle : PostgreSQL lève « infinite recursion detected in policy ».
--
-- Ces deux fonctions sont en SECURITY DEFINER, donc exécutées avec les droits
-- du propriétaire et hors RLS. Les politiques les appellent au lieu de lire
-- directement l'autre table, ce qui rompt le cycle. Elles ne divulguent rien :
-- l'une répond par un booléen sur une invitation que l'appelant désigne, la
-- seconde ne renvoie qu'un identifiant d'hôte.
CREATE OR REPLACE FUNCTION public.is_invited_to(p_competition_id uuid, p_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.competition_invites
     WHERE competition_id = p_competition_id AND user_id = p_user_id
  );
$$;

CREATE OR REPLACE FUNCTION public.competition_host(p_competition_id uuid)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT host_id FROM public.competitions WHERE id = p_competition_id;
$$;

REVOKE EXECUTE ON FUNCTION public.is_invited_to(uuid, uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.competition_host(uuid) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.is_invited_to(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.competition_host(uuid) TO authenticated;

-- Chacun voit les invitations qui le concernent ; l'hôte voit celles qu'il a
-- envoyées. Aucune politique d'écriture : seule invite_to_competition insère.
DROP POLICY IF EXISTS invites_read_involved ON public.competition_invites;
CREATE POLICY invites_read_involved ON public.competition_invites
  FOR SELECT TO authenticated
  USING (
    auth.uid() = user_id
    OR auth.uid() = invited_by
    OR auth.uid() = public.competition_host(public.competition_invites.competition_id)
  );

-- --------------------------------------------------- accès aux défis
-- Une personne invitée doit voir le défi auquel on la convie.
DROP POLICY IF EXISTS competitions_read_visible ON public.competitions;
CREATE POLICY competitions_read_visible ON public.competitions
  FOR SELECT
  USING (
    visibility = 'public'
    OR auth.uid() = host_id
    OR auth.uid() = opponent_id
    OR public.is_invited_to(public.competitions.id, auth.uid())
  );

-- Rejoindre n'est plus libre : le mode et les invitations en décident.
DROP POLICY IF EXISTS competition_participants_insert_own ON public.competition_participants;
DROP POLICY IF EXISTS competition_participants_insert_allowed ON public.competition_participants;
CREATE POLICY competition_participants_insert_allowed ON public.competition_participants
  FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM public.competitions c
       WHERE c.id = public.competition_participants.competition_id
         AND (
           c.mode = 'open'
           OR c.host_id = auth.uid()
           OR c.opponent_id = auth.uid()
           OR public.is_invited_to(c.id, auth.uid())
         )
    )
  );

-- ------------------------------------------------------ inviter
--
-- Comme pour les duels, prévenir un tiers est impossible depuis le client :
-- la politique des notifications restreint chacun à ses propres lignes.
CREATE OR REPLACE FUNCTION public.invite_to_competition(
  p_competition_id uuid,
  p_user_id uuid
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  uid uuid := auth.uid();
  comp public.competitions%ROWTYPE;
  me public.profiles%ROWTYPE;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'authentification requise'; END IF;
  IF uid = p_user_id THEN RAISE EXCEPTION 'tu participes déjà'; END IF;

  SELECT * INTO comp FROM public.competitions WHERE id = p_competition_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'défi introuvable'; END IF;
  IF comp.host_id <> uid THEN RAISE EXCEPTION 'seul l''hôte peut inviter'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = p_user_id) THEN
    RAISE EXCEPTION 'personne introuvable';
  END IF;

  SELECT * INTO me FROM public.profiles WHERE id = uid;

  INSERT INTO public.competition_invites (competition_id, user_id, invited_by)
  VALUES (p_competition_id, p_user_id, uid)
  ON CONFLICT (competition_id, user_id) DO NOTHING;

  INSERT INTO public.notifications (user_id, type, title, message)
  VALUES (
    p_user_id, 'invitation',
    format('%s t''invite au défi « %s »', me.username, comp.topic),
    'Rejoins le salon pour participer.'
  );

  RETURN true;
END; $$;

REVOKE EXECUTE ON FUNCTION public.invite_to_competition(uuid, uuid) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.invite_to_competition(uuid, uuid) TO authenticated;

-- Un duel créé depuis un cours relève désormais explicitement du mode duel.
CREATE OR REPLACE FUNCTION public.create_course_duel(
  p_course_id uuid,
  p_opponent_id uuid,
  p_visibility text DEFAULT 'public',
  p_question_count integer DEFAULT 5
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  uid uuid := auth.uid();
  me public.profiles%ROWTYPE;
  foe public.profiles%ROWTYPE;
  course public.courses%ROWTYPE;
  vis text := CASE WHEN p_visibility = 'private' THEN 'private' ELSE 'public' END;
  new_id uuid;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'authentification requise'; END IF;
  IF uid = p_opponent_id THEN RAISE EXCEPTION 'on ne se défie pas soi-même'; END IF;

  SELECT * INTO me FROM public.profiles WHERE id = uid;
  IF NOT FOUND THEN RAISE EXCEPTION 'profil introuvable'; END IF;
  SELECT * INTO foe FROM public.profiles WHERE id = p_opponent_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'adversaire introuvable'; END IF;
  SELECT * INTO course FROM public.courses WHERE id = p_course_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'cours introuvable'; END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.course_enrollments
     WHERE course_id = p_course_id AND user_id = uid
  ) THEN
    RAISE EXCEPTION 'commence le cours avant de lancer un défi dessus';
  END IF;

  INSERT INTO public.competitions (
    host_id, host_name, topic, category, difficulty,
    question_count, xp_reward, source_course_id, opponent_id, visibility, mode
  ) VALUES (
    uid, me.username, course.title, course.category, course.difficulty,
    GREATEST(LEAST(COALESCE(p_question_count, 5), 12), 3), 60,
    course.id, p_opponent_id, vis, 'duel'
  ) RETURNING id INTO new_id;

  INSERT INTO public.competition_participants (competition_id, user_id, username, avatar_url)
  VALUES (new_id, uid, me.username, me.profile_image_url),
         (new_id, p_opponent_id, foe.username, foe.profile_image_url)
  ON CONFLICT DO NOTHING;

  INSERT INTO public.notifications (user_id, type, title, message)
  VALUES (
    p_opponent_id, 'duel',
    format('%s te défie sur « %s »', me.username, course.title),
    'Rejoins le défi et réponds plus vite que ton adversaire.'
  );

  IF vis = 'public' THEN
    INSERT INTO public.notifications (user_id, type, title, message)
    SELECT e.user_id, 'duel_public',
           format('%s et %s s''affrontent sur « %s »', me.username, foe.username, course.title),
           'Ouvre le défi pour suivre le duel en direct.'
      FROM public.course_enrollments e
     WHERE e.course_id = p_course_id
       AND e.user_id NOT IN (uid, p_opponent_id)
     LIMIT 200;
  END IF;

  RETURN new_id;
END; $$;

REVOKE EXECUTE ON FUNCTION public.create_course_duel(uuid, uuid, text, integer) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.create_course_duel(uuid, uuid, text, integer) TO authenticated;


-- =============================================================
-- 20260817060000_avatars_storage.sql
-- =============================================================

-- Photos de profil, stockées dans Supabase Storage.
--
-- Le compartiment est public en lecture : un avatar s'affiche dans le fil, les
-- commentaires et les classements, y compris pour un visiteur non connecté.
-- L'écriture, elle, est cloisonnée par utilisateur : le premier segment du
-- chemin doit être son identifiant, ce qui empêche de remplacer la photo d'un
-- autre.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'avatars', 'avatars', true, 2097152,
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
ON CONFLICT (id) DO UPDATE
  SET public = true,
      file_size_limit = 2097152,
      allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

DROP POLICY IF EXISTS avatars_read_all ON storage.objects;
CREATE POLICY avatars_read_all ON storage.objects
  FOR SELECT USING (bucket_id = 'avatars');

DROP POLICY IF EXISTS avatars_insert_own ON storage.objects;
CREATE POLICY avatars_insert_own ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);

DROP POLICY IF EXISTS avatars_update_own ON storage.objects;
CREATE POLICY avatars_update_own ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text)
  WITH CHECK (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);

DROP POLICY IF EXISTS avatars_delete_own ON storage.objects;
CREATE POLICY avatars_delete_own ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);


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
