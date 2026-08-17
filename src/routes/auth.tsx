import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";
import { useAuth } from "@/hooks/useAuth";
import { InfinityMark, Wordmark } from "@/components/brand/InfinityMark";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Connexion — STEMFLOW" },
      {
        name: "description",
        content: "Connecte-toi à STEMFLOW pour suivre ton fil STEM, gagner de l'XP et débloquer des badges.",
      },
      { property: "og:title", content: "Connexion — STEMFLOW" },
      { property: "og:description", content: "Crée ton compte STEMFLOW et commence à apprendre." },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const { session, profile, loading } = useAuth();
  const [mode, setMode] = useState<"signin" | "signup">("signup");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (loading || !session) return;
    navigate({ to: profile?.onboarding_completed ? "/feed" : "/onboarding" });
  }, [session, profile, loading, navigate]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    if (mode === "signup") {
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: `${window.location.origin}/onboarding`,
          data: { username: username || email.split("@")[0] },
        },
      });
      if (error) toast.error(error.message);
      else toast.success("Compte créé ! Bienvenue sur STEMFLOW.");
    } else {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) toast.error("Identifiants incorrects.");
    }
    setBusy(false);
  };

  const google = async () => {
    const result = await lovable.auth.signInWithOAuth("google", {
      redirect_uri: window.location.origin,
    });
    if (result.error) {
      toast.error("Connexion Google impossible pour le moment.");
      return;
    }
  };

  return (
    <main className="relative flex min-h-dvh flex-col items-center justify-center overflow-hidden bg-background px-6 py-12">
      <div className="pointer-events-none absolute -top-40 left-1/2 h-96 w-96 -translate-x-1/2 rounded-full bg-primary/20 blur-[120px]" />
      <div className="relative w-full max-w-sm">
        <div className="flex flex-col items-center">
          <InfinityMark className="h-14 w-14" glow />
          <Wordmark />
          <p className="mt-2 text-[11px] font-semibold tracking-[0.3em] text-muted-foreground">
            SCROLL. LEARN. LEVEL UP.
          </p>
        </div>

        <div className="mt-8 grid grid-cols-2 rounded-full border border-border bg-surface-2 p-1">
          {(["signup", "signin"] as const).map((m) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={`rounded-full py-2 text-sm font-bold transition-colors ${
                mode === m ? "bg-gradient-brand text-primary-foreground" : "text-muted-foreground"
              }`}
            >
              {m === "signup" ? "Inscription" : "Connexion"}
            </button>
          ))}
        </div>

        <form onSubmit={submit} className="mt-6 space-y-3">
          {mode === "signup" && (
            <Field label="Nom d'utilisateur" value={username} onChange={setUsername} placeholder="amina_stem" />
          )}
          <Field label="Email" type="email" value={email} onChange={setEmail} placeholder="toi@exemple.com" required />
          <Field
            label="Mot de passe"
            type="password"
            value={password}
            onChange={setPassword}
            placeholder="••••••••"
            required
          />
          <button
            type="submit"
            disabled={busy}
            className="w-full rounded-xl bg-gradient-brand py-3.5 text-sm font-black text-primary-foreground disabled:opacity-50"
          >
            {busy ? "Patiente…" : mode === "signup" ? "Créer mon compte" : "Se connecter"}
          </button>
        </form>

        <div className="my-5 flex items-center gap-3 text-[11px] font-semibold text-muted-foreground">
          <span className="h-px flex-1 bg-border" /> OU <span className="h-px flex-1 bg-border" />
        </div>

        <button
          onClick={google}
          className="flex w-full items-center justify-center gap-2 rounded-xl border border-border bg-surface-2 py-3.5 text-sm font-bold hover:border-primary/40"
        >
          <svg viewBox="0 0 24 24" className="h-4 w-4">
            <path fill="#4285F4" d="M23 12.3c0-.8-.1-1.6-.2-2.3H12v4.5h6.2a5.3 5.3 0 0 1-2.3 3.5v2.9h3.7c2.2-2 3.4-5 3.4-8.6Z" />
            <path fill="#34A853" d="M12 24c3.1 0 5.7-1 7.6-2.8l-3.7-2.9c-1 .7-2.3 1.1-3.9 1.1-3 0-5.5-2-6.4-4.7H1.8v3A12 12 0 0 0 12 24Z" />
            <path fill="#FBBC05" d="M5.6 14.7a7.2 7.2 0 0 1 0-4.6v-3H1.8a12 12 0 0 0 0 10.7l3.8-3Z" />
            <path fill="#EA4335" d="M12 4.8c1.7 0 3.2.6 4.4 1.7l3.2-3.2A12 12 0 0 0 1.8 7.1l3.8 3C6.5 7.4 9 4.8 12 4.8Z" />
          </svg>
          Continuer avec Google
        </button>

        <p className="mt-6 text-center text-[11px] leading-relaxed text-muted-foreground">
          En continuant, tu acceptes nos conditions d'utilisation et notre politique de confidentialité.
        </p>
      </div>
    </main>
  );
}

function Field({
  label,
  value,
  onChange,
  type = "text",
  placeholder,
  required,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  placeholder?: string;
  required?: boolean;
}) {
  return (
    <label className="block">
      <span className="label-xs">{label}</span>
      <input
        type={type}
        value={value}
        required={required}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1.5 w-full rounded-xl border border-border bg-surface-2 px-4 py-3 text-sm outline-none transition-colors focus:border-primary/60"
      />
    </label>
  );
}
