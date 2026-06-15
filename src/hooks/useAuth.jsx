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
  // True after the user follows a password-reset email link. Supabase fires a
  // PASSWORD_RECOVERY event and establishes a temporary session; the app shows
  // a "set a new password" screen until this clears.
  const [recovery, setRecovery] = useState(false);

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

    const { data: sub } = supabase.auth.onAuthStateChange((event, next) => {
      setSession(next ?? null);
      if (event === "PASSWORD_RECOVERY") setRecovery(true);
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

    // Send a password-reset email. The link returns the user to this app,
    // where detectSessionInUrl processes the token and fires PASSWORD_RECOVERY.
    const resetPassword = async (email) => {
      if (!supabase) return NOT_CONFIGURED;
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: window.location.origin,
      });
      return { error };
    };

    // Set a new password for the recovery (or current) session.
    const updatePassword = async (password) => {
      if (!supabase) return NOT_CONFIGURED;
      const { error } = await supabase.auth.updateUser({ password });
      return { error };
    };

    const clearRecovery = () => setRecovery(false);

    return {
      session,
      user: session?.user ?? null,
      loading,
      recovery,
      isConfigured: isSupabaseConfigured,
      signUp,
      signIn,
      signOut,
      resetPassword,
      updatePassword,
      clearRecovery,
    };
  }, [session, loading, recovery]);

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
