import { useEffect, useMemo, useState } from "react";
import AuthScreen from "./AuthScreen.jsx";
import { Icon } from "./Icons.jsx";
import { useAuth } from "../hooks/useAuth.jsx";
import { supabase } from "../lib/supabaseClient.js";
import "./AssistantApproval.css";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function friendlyError(error) {
  if (error?.code === "P0002") return "This draft was not found or no longer belongs to this account.";
  if (error?.code === "22023") return "This draft expired or its details are no longer valid.";
  if (error?.code === "40001") return "Ligand changed after this draft was prepared. Ask ChatGPT to prepare a fresh one.";
  if (error?.code === "42501" || error?.code === "28000") {
    return "This draft is outside the ChatGPT access you approved in Ligand.";
  }
  return "Ligand could not load this draft. Please try again.";
}

function LoadingApproval() {
  return (
    <main className="assistant-approval-screen">
      <section className="assistant-approval-card" aria-live="polite">
        <div className="assistant-approval-brand"><span />Ligand</div>
        <div className="assistant-approval-loading"><span className="spinner" />Loading draft...</div>
      </section>
    </main>
  );
}

export default function AssistantApproval() {
  const { user, loading: authLoading } = useAuth();
  const confirmationId = useMemo(
    () => new URLSearchParams(window.location.search).get("confirmation_id") || "",
    []
  );
  const [preview, setPreview] = useState(null);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (authLoading || !user || !supabase) return;
    let active = true;
    const load = async () => {
      if (!UUID_PATTERN.test(confirmationId)) {
        setError("This approval link is incomplete or invalid.");
        setLoading(false);
        return;
      }
      const { data, error: loadError } = await supabase.rpc(
        "assistant_get_change_preview",
        { p_confirmation_id: confirmationId }
      );
      if (!active) return;
      if (loadError || !data) setError(friendlyError(loadError));
      else setPreview(data);
      setLoading(false);
    };
    load();
    return () => { active = false; };
  }, [authLoading, confirmationId, user]);

  const approve = async () => {
    if (!supabase || preview?.status !== "pending") return;
    setBusy(true);
    setError("");
    const { data, error: applyError } = await supabase.rpc(
      "assistant_apply_changes_direct",
      { p_confirmation_id: confirmationId }
    );
    if (applyError || !data) setError(friendlyError(applyError));
    else {
      setResult(data);
      setPreview((current) => ({ ...current, status: "applied" }));
    }
    setBusy(false);
  };

  if (authLoading) return <LoadingApproval />;
  if (!user) return <AuthScreen />;
  if (loading) return <LoadingApproval />;

  const applied = preview?.status === "applied";
  const expired = preview?.status === "expired";
  const dismissed = preview?.status === "dismissed";

  return (
    <main className="assistant-approval-screen">
      <section className="assistant-approval-card">
        <div className="assistant-approval-brand"><span />Ligand</div>
        <p className="assistant-approval-eyebrow">ChatGPT draft</p>
        <h1>{applied ? "Changes saved" : dismissed ? "Draft dismissed" : "Review before saving"}</h1>
        <p className="assistant-approval-copy">
          {applied
            ? `${result?.changeCount || preview?.changeCount || 0} approved changes are now in Ligand.`
            : dismissed
              ? "This draft was dismissed from the Assistant Inbox and cannot be saved."
            : "ChatGPT prepared these changes, but nothing has been changed in Ligand yet."}
        </p>

        {preview?.summary?.length > 0 && (
          <ol className="assistant-approval-summary">
            {preview.summary.map((item, index) => <li key={`${index}-${item}`}>{item}</li>)}
          </ol>
        )}

        {!applied && !expired && (
          <div className="assistant-approval-boundary">
            <Icon.Lock aria-hidden="true" />
            <span>Only the changes listed above can be saved. This page cannot delete Ligand content.</span>
          </div>
        )}

        {expired && (
          <div className="assistant-approval-error" role="alert">
            This draft expired. Ask ChatGPT to prepare a new approval link.
          </div>
        )}
        {dismissed && (
          <div className="assistant-approval-error" role="status">
            Nothing from this draft was applied.
          </div>
        )}
        {error && <div className="assistant-approval-error" role="alert">{error}</div>}

        <div className="assistant-approval-actions">
          {applied ? (
            <button className="btn primary" type="button" onClick={() => window.location.assign("/")}>
              Open Ligand <Icon.Arrow aria-hidden="true" />
            </button>
          ) : (
            <>
              <button className="btn" type="button" onClick={() => window.location.assign("/")} disabled={busy}>
                Cancel
              </button>
              <button className="btn primary" type="button" onClick={approve} disabled={busy || expired || dismissed || preview?.status !== "pending"}>
                <Icon.Check aria-hidden="true" /> {busy ? "Saving..." : "Save these changes"}
              </button>
            </>
          )}
        </div>
      </section>
    </main>
  );
}
