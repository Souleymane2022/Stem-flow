import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

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
  created_at: string;
};

type AuthContextValue = {
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  loading: boolean;
  refreshProfile: () => Promise<void>;
  awardXp: (amount: number) => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

const DAILY_MISSIONS = [
  { mission_type: "watch_videos", title: "Regarde 3 vidéos", description: "Apprends en scrollant", target_value: 3, xp_reward: 30 },
  { mission_type: "complete_quiz", title: "Complète 1 quiz", description: "Teste tes connaissances", target_value: 1, xp_reward: 40 },
  { mission_type: "comment", title: "Poste 1 commentaire", description: "Participe à la discussion", target_value: 1, xp_reward: 20 },
];

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const dailyDone = useRef<string | null>(null);

  const loadProfile = useCallback(async (userId: string) => {
    const { data } = await supabase.from("profiles").select("*").eq("id", userId).maybeSingle();
    setProfile((data as Profile) ?? null);
    return (data as Profile) ?? null;
  }, []);

  const runDailyRoutine = useCallback(async (current: Profile) => {
    const today = todayISO();
    if (dailyDone.current === current.id + today) return;
    dailyDone.current = current.id + today;

    // Streak
    if (current.last_login_date !== today) {
      const yesterday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
      let streak = 1;
      if (current.last_login_date === yesterday) streak = (current.streak ?? 0) + 1;
      const bonus = streak > 1 ? 15 : 0;
      await supabase
        .from("profiles")
        .update({ streak, last_login_date: today, xp: (current.xp ?? 0) + bonus })
        .eq("id", current.id);
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
  }, [loadProfile]);

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
      if (!next) {
        setProfile(null);
        setLoading(false);
        return;
      }
      setTimeout(async () => {
        const p = await loadProfile(next.user.id);
        setLoading(false);
        if (p) void runDailyRoutine(p);
      }, 0);
    });

    supabase.auth.getSession().then(async ({ data }) => {
      setSession(data.session);
      if (data.session) {
        const p = await loadProfile(data.session.user.id);
        if (p) void runDailyRoutine(p);
      }
      setLoading(false);
    });

    return () => sub.subscription.unsubscribe();
  }, [loadProfile, runDailyRoutine]);

  const refreshProfile = useCallback(async () => {
    if (session?.user.id) await loadProfile(session.user.id);
  }, [session, loadProfile]);

  const awardXp = useCallback(
    async (amount: number) => {
      if (!session?.user.id) return;
      setProfile((p) => (p ? { ...p, xp: p.xp + amount } : p));
      await supabase.rpc("add_xp", { amount });
    },
    [session],
  );

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    setProfile(null);
    setSession(null);
  }, []);

  const value = useMemo(
    () => ({ session, user: session?.user ?? null, profile, loading, refreshProfile, awardXp, signOut }),
    [session, profile, loading, refreshProfile, awardXp, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth doit être utilisé dans AuthProvider");
  return ctx;
}
