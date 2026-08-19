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
