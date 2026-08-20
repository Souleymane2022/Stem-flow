-- Abonnements aux notifications poussées.
--
-- Une notification poussée s'adresse à un navigateur, pas à un compte : la
-- même personne sur son téléphone et sur son ordinateur a deux abonnements.
-- L'adresse d'émission (`endpoint`) est unique et sert donc de clé — se
-- réabonner depuis le même appareil met la ligne à jour au lieu d'en empiler
-- une seconde.
CREATE TABLE IF NOT EXISTS public.push_subscriptions (
  endpoint text PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  -- Clés de chiffrement du navigateur : sans elles, le service de push ne
  -- peut pas déchiffrer le message.
  p256dh text NOT NULL,
  auth text NOT NULL,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS push_subscriptions_user_idx ON public.push_subscriptions (user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.push_subscriptions TO authenticated;
GRANT ALL ON public.push_subscriptions TO service_role;
ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;

-- Chacun ne voit et ne gère que ses propres appareils. L'envoi passe par le
-- rôle de service, qui lit la table sans être soumis à ces politiques.
DROP POLICY IF EXISTS push_subscriptions_read_own ON public.push_subscriptions;
CREATE POLICY push_subscriptions_read_own ON public.push_subscriptions
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS push_subscriptions_write_own ON public.push_subscriptions;
CREATE POLICY push_subscriptions_write_own ON public.push_subscriptions
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS push_subscriptions_update_own ON public.push_subscriptions;
CREATE POLICY push_subscriptions_update_own ON public.push_subscriptions
  FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS push_subscriptions_delete_own ON public.push_subscriptions;
CREATE POLICY push_subscriptions_delete_own ON public.push_subscriptions
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

NOTIFY pgrst, 'reload schema';
