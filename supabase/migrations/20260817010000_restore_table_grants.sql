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
