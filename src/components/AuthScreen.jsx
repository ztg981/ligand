import { useState } from "react";
import { useAuth } from "../hooks/useAuth.jsx";

/* ============================================================
   AuthScreen - the sign-in / sign-up gate.

   Shown when there's no session and the user hasn't chosen to
   continue as a guest. Email + password, a toggle between Sign
   in and Create account, and a prominent "Continue without an
   account" escape hatch that drops straight into the existing
   local-only experience.

   This screen NEVER blocks the app permanently: guest mode is
   always one click away, so the app behaves exactly as before
   for anyone who doesn't want an account.
   ============================================================ */
export default function AuthScreen({ onContinueAsGuest }) {
  const { signIn, signUp, resetPassword, isConfigured } = useAuth();
  const [mode, setMode] = useState("signin"); // "signin" | "signup" | "reset"
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const isSignup = mode === "signup";
  const isReset = mode === "reset";

  const switchMode = () => {
    setMode((m) => (m === "signin" ? "signup" : "signin"));
    setError("");
    setNotice("");
  };

  const goReset = () => {
    setMode("reset");
    setError("");
    setNotice("");
  };

  const backToSignIn = () => {
    setMode("signin");
    setError("");
    setNotice("");
  };

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    setNotice("");

    const mail = email.trim();

    // Reset mode only needs an email.
    if (isReset) {
      if (!mail) {
        setError("Enter the email for your account.");
        return;
      }
      setBusy(true);
      try {
        const { error } = await resetPassword(mail);
        if (error) {
          setError(error.message || "Could not send the reset email.");
        } else {
          setNotice(
            "If an account exists for that email, a password-reset link is on its way. Open it on this device to set a new password."
          );
        }
      } catch (err) {
        setError(err?.message || "Something went wrong. Please try again.");
      } finally {
        setBusy(false);
      }
      return;
    }

    if (!mail || !password) {
      setError("Enter your email and a password.");
      return;
    }
    if (isSignup && password.length < 6) {
      setError("Use a password of at least 6 characters.");
      return;
    }

    setBusy(true);
    try {
      if (isSignup) {
        const { error, needsConfirmation } = await signUp(mail, password);
        if (error) {
          setError(error.message || "Could not create your account.");
        } else if (needsConfirmation) {
          setNotice(
            "Account created. Check your email to confirm it, then sign in."
          );
          setMode("signin");
        }
        // On success without confirmation, the auth listener flips us into
        // the app automatically - nothing more to do here.
      } else {
        const { error } = await signIn(mail, password);
        if (error) {
          setError(error.message || "Could not sign you in.");
        }
      }
    } catch (err) {
      setError(err?.message || "Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="auth-screen">
      <div className="auth-card card">
        <div className="auth-brand">
          <span className="brand-dot" />
          <span>Ligand</span>
        </div>

        <h1 className="auth-title">
          {isReset
            ? "Reset your password"
            : isSignup
              ? "Create your account"
              : "Welcome back"}
        </h1>
        <p className="auth-sub">
          {isReset
            ? "Enter your email and we'll send you a link to set a new password."
            : isSignup
              ? "Sync your goals, tasks and journal across devices. Free, and private to you."
              : "Sign in to pick up where you left off on any device."}
        </p>

        {!isConfigured && (
          <div className="auth-error" role="alert">
            Cloud accounts aren't configured in this build. You can still
            continue without an account.
          </div>
        )}

        <form onSubmit={submit} className="auth-form">
          <label className="auth-field">
            <span>Email</span>
            <input
              className="input"
              type="email"
              autoComplete="email"
              inputMode="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={busy || !isConfigured}
            />
          </label>

          {!isReset && (
            <label className="auth-field">
              <span>Password</span>
              <input
                className="input"
                type="password"
                autoComplete={isSignup ? "new-password" : "current-password"}
                placeholder={isSignup ? "At least 6 characters" : "Your password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={busy || !isConfigured}
              />
            </label>
          )}

          {mode === "signin" && (
            <button
              type="button"
              className="auth-link auth-forgot"
              onClick={goReset}
              disabled={busy}
            >
              Forgot password?
            </button>
          )}

          {error && (
            <div className="auth-error" role="alert">
              {error}
            </div>
          )}
          {notice && (
            <div className="auth-notice" role="status">
              {notice}
            </div>
          )}

          <button
            type="submit"
            className="btn primary auth-submit"
            disabled={busy || !isConfigured}
          >
            {busy
              ? "Just a moment…"
              : isReset
                ? "Send reset link"
                : isSignup
                  ? "Create account"
                  : "Sign in"}
          </button>
        </form>

        <div className="auth-toggle">
          {isReset ? (
            <>
              Remembered it?{" "}
              <button type="button" className="auth-link" onClick={backToSignIn}>
                Back to sign in
              </button>
            </>
          ) : (
            <>
              {isSignup ? "Already have an account?" : "New to Ligand?"}{" "}
              <button type="button" className="auth-link" onClick={switchMode}>
                {isSignup ? "Sign in" : "Create one"}
              </button>
            </>
          )}
        </div>

        <div className="auth-divider">
          <span>or</span>
        </div>

        <button
          type="button"
          className="btn auth-guest"
          onClick={onContinueAsGuest}
        >
          Continue without an account
        </button>
        <p className="auth-guest-note">
          Everything stays on this device. You can create an account later from
          the profile menu.
        </p>
      </div>
    </div>
  );
}
