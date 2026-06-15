import { useState } from "react";
import { useAuth } from "../hooks/useAuth.jsx";

/* ============================================================
   SetNewPassword — shown after the user follows a password-reset
   email link. Supabase has already established a temporary
   recovery session (PASSWORD_RECOVERY), so all we need is the new
   password. On success we clear the recovery flag and the app
   drops the user straight in, signed in with their new password.
   ============================================================ */
export default function SetNewPassword() {
  const { updatePassword, clearRecovery, signOut } = useAuth();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError("");

    if (password.length < 6) {
      setError("Use a password of at least 6 characters.");
      return;
    }
    if (password !== confirm) {
      setError("Those passwords don't match.");
      return;
    }

    setBusy(true);
    try {
      const { error } = await updatePassword(password);
      if (error) {
        setError(error.message || "Could not update your password.");
        return;
      }
      // Briefly confirm, then clear recovery so the app renders (the recovery
      // session is now a normal signed-in session with the new password).
      setDone(true);
      setTimeout(() => clearRecovery(), 1200);
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

        <h1 className="auth-title">Set a new password</h1>
        <p className="auth-sub">
          You're resetting the password for your account. Choose a new one below.
        </p>

        {done ? (
          <div className="auth-notice" role="status">
            Password updated — signing you in…
          </div>
        ) : (
          <form onSubmit={submit} className="auth-form">
            <label className="auth-field">
              <span>New password</span>
              <input
                className="input"
                type="password"
                autoComplete="new-password"
                placeholder="At least 6 characters"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={busy}
                autoFocus
              />
            </label>

            <label className="auth-field">
              <span>Confirm new password</span>
              <input
                className="input"
                type="password"
                autoComplete="new-password"
                placeholder="Re-enter your new password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                disabled={busy}
              />
            </label>

            {error && (
              <div className="auth-error" role="alert">
                {error}
              </div>
            )}

            <button
              type="submit"
              className="btn primary auth-submit"
              disabled={busy}
            >
              {busy ? "Saving…" : "Update password"}
            </button>
          </form>
        )}

        {!done && (
          <div className="auth-toggle">
            <button
              type="button"
              className="auth-link"
              onClick={async () => {
                // Abandon the reset: drop the recovery session and return to sign in.
                await signOut?.();
                clearRecovery();
              }}
            >
              Cancel
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
