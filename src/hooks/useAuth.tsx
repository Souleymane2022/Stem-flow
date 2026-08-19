import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { XP_REWARDS } from "@/lib/xp";

export type Profile = {
  id: string;
  username: string;
  email: string;
  profile_image_url: string | null;
  preferred_language: string | null;
  education_level: string | null;
  interests: string[] | null;
  bio: string | null;
  level: string | null;
  xp: number;
  streak: number;
  last_login_date: string | null;
  onboarding_completed: boolean;
  share_progress: boolean;
  created_at: string;
};

type AuthContextValue = {
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  loading: boolean;
  /** Renvoie la fiche rechargée (et la recrée si elle manque), ou null en cas d'échec. */
  refreshProfile: () => Promise<Profile | null>;
  /** Motif du dernier échec de lecture/création du profil, pour l'afficher à l'utilisateur. */
  profileError: string | null;
  awardXp: (amount: number) => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

const DAILY_MISSIONS = [
  {
    mission_type: "watch_videos",
    title: "Regarde 3 vidéos",
    description: "Apprends en scrollant",
    target_value: 3,
    xp_reward: 30,
  },
  {
    mission_type: "complete_quiz",
    title: "Complète 1 quiz",
    description: "Teste tes connaissances",
    target_value: 1,
    xp_reward: 40,
  },
  {
    mission_type: "comment",
    title: "Poste 1 commentaire",
    description: "Participe à la discussion",
    target_value: 1,
    xp_reward: 20,
  },
];

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [profileError, setProfileError] = useState<string | null>(null);
  const dailyDone = useRef<string | null>(null);

  const repaired = useRef<string | null>(null);

  /**
   * Recrée la ligne `profiles` si elle manque. Le trigger `handle_new_user` la
   * pose normalement à l'inscription, mais un compte créé avant son installation
   * — ou dont l'insertion a échoué — restait sans profil, laissant l'application
   * bloquée sur « Chargement… ». La politique RLS `profiles_insert_own` autorise
   * l'utilisateur à insérer sa propre ligne. Une seule tentative par session.
   */
  const readProfile = useCallback(async (userId: string) => {
    // L'erreur était ignorée : une lecture en échec (RLS, réseau) devenait
    // indiscernable d'une ligne absente, et déclenchait une création inutile.
    const { data, error } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", userId)
      .maybeSingle();
    if (error) {
      console.error("[auth] lecture du profil impossible", error);
      setProfileError(`lecture: ${error.message}`);
      return { profile: null, failed: true as const };
    }
    return { profile: (data as Profile) ?? null, failed: false as const };
  }, []);

  const repairProfile = useCallback(
    async (user: User): Promise<Profile | null> => {
      if (repaired.current === user.id) return null;
      repaired.current = user.id;

      const email = user.email ?? "";
      const meta = user.user_metadata as { username?: string; full_name?: string; name?: string };
      const base =
        meta.username ?? meta.full_name ?? meta.name ?? email.split("@")[0] ?? "stemflow";
      const stem = base.replace(/\s+/g, "_").slice(0, 20);

      const insert = async (username: string) =>
        supabase
          .from("profiles")
          .insert({ id: user.id, username, email })
          .select("*")
          .maybeSingle();

      let { data, error } = await insert(`${stem}_${user.id.slice(0, 4)}`);

      // 23505 = violation d'unicité. Deux cas très différents se cachent
      // derrière ce code, et les confondre menait à l'abandon.
      if (error?.code === "23505") {
        // a) La ligne existe déjà (clé primaire) : c'est la lecture qui avait
        //    échoué, pas la ligne qui manquait. On relit.
        const existing = await readProfile(user.id);
        if (existing.profile) return existing.profile;
        // b) Le nom d'utilisateur est pris : on réessaie avec un suffixe plus long.
        ({ data, error } = await insert(`${stem}_${user.id.slice(0, 12)}`));
      }

      if (error) {
        console.error("[auth] création du profil impossible", error);
        setProfileError(`création: ${error.message}`);
        return null;
      }
      setProfileError(null);
      return (data as Profile) ?? null;
    },
    [readProfile],
  );

  const loadProfile = useCallback(
    async (userId: string) => {
      const { profile: found } = await readProfile(userId);
      setProfile(found);
      if (found) setProfileError(null);
      return found;
    },
    [readProfile],
  );

  const runDailyRoutine = useCallback(
    async (current: Profile) => {
      const today = todayISO();
      if (dailyDone.current === current.id + today) return;
      dailyDone.current = current.id + today;

      // Streak
      if (current.last_login_date !== today) {
        const yesterday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
        let streak = 1;
        if (current.last_login_date === yesterday) streak = (current.streak ?? 0) + 1;
        const bonus = streak > 1 ? XP_REWARDS.dailyStreak : 0;
        // On n'écrit pas `xp` ici : la valeur de `current` a pu être lue avant un
        // gain d'XP concurrent, et la réécrire l'effacerait. `add_xp` incrémente
        // côté base et recalcule le niveau.
        await supabase
          .from("profiles")
          .update({ streak, last_login_date: today })
          .eq("id", current.id);
        if (bonus > 0) await supabase.rpc("add_xp", { amount: bonus });
      }

      // Daily missions
      const { data: existing } = await supabase
        .from("missions")
        .select("id")
        .eq("user_id", current.id)
        .gte("created_at", `${today}T00:00:00Z`)
        .limit(1);

      if (!existing || existing.length === 0) {
        await supabase
          .from("missions")
          .insert(DAILY_MISSIONS.map((m) => ({ ...m, user_id: current.id, frequency: "daily" })));
      }

      await loadProfile(current.id);
    },
    [loadProfile],
  );

  useEffect(() => {
    // `loading` doit retomber à false quoi qu'il arrive : une erreur réseau sur
    // le chargement du profil laissait sinon toute l'app bloquée sur « Chargement… ».
    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
      if (!next) {
        setProfile(null);
        setLoading(false);
        return;
      }
      setTimeout(async () => {
        try {
          let p: Profile | null = await loadProfile(next.user.id);
          if (!p) {
            p = await repairProfile(next.user);
            if (p) setProfile(p);
          }
          if (p) void runDailyRoutine(p);
        } catch (error) {
          console.error("[auth] chargement du profil impossible", error);
          setProfile(null);
        } finally {
          setLoading(false);
        }
      }, 0);
    });

    void (async () => {
      try {
        const { data } = await supabase.auth.getSession();
        setSession(data.session);
        if (data.session) {
          let p: Profile | null = await loadProfile(data.session.user.id);
          if (!p) {
            p = await repairProfile(data.session.user);
            if (p) setProfile(p);
          }
          if (p) void runDailyRoutine(p);
        }
      } catch (error) {
        console.error("[auth] session illisible", error);
      } finally {
        setLoading(false);
      }
    })();

    return () => sub.subscription.unsubscribe();
  }, [loadProfile, repairProfile, runDailyRoutine]);

  const refreshProfile = useCallback(async () => {
    if (!session) return null;
    const p = await loadProfile(session.user.id);
    if (p) return p;
    // Le bouton « Réessayer » du profil doit pouvoir relancer la réparation.
    repaired.current = null;
    const created = await repairProfile(session.user);
    if (created) setProfile(created);
    return created;
  }, [session, loadProfile, repairProfile]);

  const awardXp = useCallback(
    async (amount: number) => {
      if (!session?.user.id) return;
      setProfile((p) => (p ? { ...p, xp: p.xp + amount } : p));
      await supabase.rpc("add_xp", { amount });
    },
    [session],
  );

  // La déconnexion doit aboutir même si l'appel réseau échoue, sinon l'utilisateur
  // reste prisonnier d'une session qu'il ne peut plus quitter.
  const signOut = useCallback(async () => {
    try {
      await supabase.auth.signOut();
    } catch (error) {
      console.error("[auth] déconnexion distante impossible", error);
    } finally {
      setProfile(null);
      setSession(null);
      dailyDone.current = null;
      repaired.current = null;
      setProfileError(null);
    }
  }, []);

  const value = useMemo(
    () => ({
      session,
      user: session?.user ?? null,
      profile,
      loading,
      refreshProfile,
      profileError,
      awardXp,
      signOut,
    }),
    [session, profile, loading, refreshProfile, profileError, awardXp, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth doit être utilisé dans AuthProvider");
  return ctx;
}
