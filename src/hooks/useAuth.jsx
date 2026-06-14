import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { supabase, isSupabaseConfigured } from "../lib/supabaseClient.js";

/* ============================================================
   useAuth — thin context around Supabase auth.

   Exposes the current session/user, a one-time `loading` flag
   while the initial session is resolved, and signUp / signIn /
   signOut helpers that return { error } for the UI to surface.

   When Supabase isn't configured (no env vars), this degrades
   gracefully: loading resolves immediately, session stays null,
   and the auth helpers return a friendly error. The app then
   runs exactly as before in guest / localStorage mode.
   ============================================================ */

const AuthContext = createContext(null);

const NOT_CONFIGURED = {
  error: { message: "Cloud accounts aren't available in this build." },
};

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!supabase) {
      setLoading(false);
      return;
    }
    let active = true;

    supabase.auth
      .getSession()
      .then(({ data }) => {
        if (!active) return;
        setSession(data.session ?? null);
        setLoading(false);
      })
      .catch(() => {
        if (!active) return;
        setLoading(false);
      });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next ?? null);
    });

    return () => {
      active = false;
      sub?.subscription?.unsubscribe();
    };
  }, []);

  const value = useMemo(() => {
    const signUp = async (email, password) => {
      if (!supabase) return NOT_CONFIGURED;
      const { data, error } = await supabase.auth.signUp({ email, password });
      // If email confirmation is required, data.session will be null even on
      // success — the caller checks `needsConfirmation` to message the user.
      return { error, needsConfirmation: !error && !data.session };
    };

    const signIn = async (email, password) => {
      if (!supabase) return NOT_CONFIGURED;
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      return { error };
    };

    const signOut = async () => {
      if (!supabase) return NOT_CONFIGURED;
      const { error } = await supabase.auth.signOut();
      return { error };
    };

    return {
      session,
      user: session?.user ?? null,
      loading,
      isConfigured: isSupabaseConfigured,
      signUp,
      signIn,
      signOut,
    };
  }, [session, loading]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within <AuthProvider>");
  }
  return ctx;
}

export default useAuth;
