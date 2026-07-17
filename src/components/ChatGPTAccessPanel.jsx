import { useCallback, useEffect, useMemo, useState } from "react";
import { Icon } from "./Icons.jsx";
import { useAuth } from "../hooks/useAuth.jsx";
import { supabase } from "../lib/supabaseClient.js";
import {
  assistantAccessRow,
  normalizeAssistantAccess,
  shareableGoalsFromUserData,
} from "../lib/assistantAccess.js";
import "./ChatGPTAccessPanel.css";

const OAUTH_CLIENT_ID = import.meta.env.VITE_LIGAND_MCP_OAUTH_CLIENT_ID || "";
const WRITE_FEATURE_ENABLED = import.meta.env.VITE_LIGAND_MCP_ENABLE_TASK_WRITES === "true";

const TOOL_LABELS = {
  get_tasks: "Read tasks",
  get_shared_goals: "Read shared goals",
  get_day_plan: "Read a Day plan",
  preview_ligand_changes: "Prepared a draft",
  apply_ligand_changes: "Saved approved changes",
};

function formatTime(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) return "";
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function DraftList({ drafts, busyId, onApply, onDismiss }) {
  if (!drafts.length) {
    return (
      <div className="assistant-empty">
        <Icon.CheckCircle />
        <strong>No waiting drafts</strong>
        <span>Plans from ChatGPT will appear here before anything is saved.</span>
      </div>
    );
  }

  return (
    <div className="assistant-draft-list">
      {drafts.map((draft) => (
        <article className="assistant-draft" key={draft.confirmationId}>
          <div className="assistant-draft-head">
            <div>
              <strong>{draft.changeCount} proposed {draft.changeCount === 1 ? "change" : "changes"}</strong>
              <span>{formatTime(draft.createdAt)}</span>
            </div>
            <span className={`assistant-draft-status ${draft.status}`}>{draft.status}</span>
          </div>
          <ol>
            {(draft.summary || []).map((item, index) => (
              <li key={`${draft.confirmationId}-${index}`}>{item}</li>
            ))}
          </ol>
          {draft.status === "pending" && (
            <div className="assistant-draft-actions">
              <button
                className="btn primary sm"
                type="button"
                disabled={busyId === draft.confirmationId}
                onClick={() => onApply(draft.confirmationId)}
              >
                <Icon.Check /> {busyId === draft.confirmationId ? "Saving..." : "Approve"}
              </button>
              <button
                className="btn ghost sm"
                type="button"
                disabled={busyId === draft.confirmationId}
                onClick={() => onDismiss(draft.confirmationId)}
              >
                Dismiss
              </button>
            </div>
          )}
        </article>
      ))}
    </div>
  );
}

export default function ChatGPTAccessPanel({ goals = [] }) {
  const { user } = useAuth();
  const shareableGoals = useMemo(
    () => shareableGoalsFromUserData({ "ligand.data": { goals } }),
    [goals]
  );
  const [view, setView] = useState("inbox");
  const [connected, setConnected] = useState(false);
  const [selectedGoalIds, setSelectedGoalIds] = useState([]);
  const [allowUnassigned, setAllowUnassigned] = useState(false);
  const [tasksWrite, setTasksWrite] = useState(false);
  const [dayRead, setDayRead] = useState(false);
  const [dayWrite, setDayWrite] = useState(false);
  const [workoutsWrite, setWorkoutsWrite] = useState(false);
  const [reviewWrite, setReviewWrite] = useState(false);
  const [drafts, setDrafts] = useState([]);
  const [reviewMarks, setReviewMarks] = useState([]);
  const [activity, setActivity] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [busyId, setBusyId] = useState(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    if (!user || !supabase || !OAUTH_CLIENT_ID) return;
    setError("");
    const [accessResult, grantsResult, draftsResult, marksResult, activityResult] =
      await Promise.all([
        supabase
          .from("assistant_access")
          .select("enabled,tasks_read,tasks_write,day_read,day_write,workouts_write,review_write,allow_unassigned_tasks,allowed_goal_ids")
          .eq("user_id", user.id)
          .maybeSingle(),
        supabase.auth.oauth.listGrants(),
        supabase.rpc("assistant_list_change_previews", { p_limit: 20 }),
        supabase
          .from("assistant_review_marks")
          .select("id,item_type,item_id,label,reason,status,created_at")
          .eq("user_id", user.id)
          .eq("status", "pending")
          .order("created_at", { ascending: false })
          .limit(20),
        supabase
          .from("assistant_audit_log")
          .select("id,tool_name,action_class,outcome,item_count,created_at")
          .eq("user_id", user.id)
          .order("created_at", { ascending: false })
          .limit(20),
      ]);

    if (accessResult.error || grantsResult.error) {
      setError("Ligand could not load your ChatGPT access settings.");
      setLoading(false);
      return;
    }
    const access = normalizeAssistantAccess(accessResult.data, shareableGoals);
    setConnected(
      (grantsResult.data || []).some((item) => item?.client?.id === OAUTH_CLIENT_ID)
    );
    setSelectedGoalIds(access.allowedGoalIds);
    setAllowUnassigned(access.allowUnassignedTasks);
    setTasksWrite(WRITE_FEATURE_ENABLED && access.tasksWrite);
    setDayRead(access.dayRead);
    setDayWrite(WRITE_FEATURE_ENABLED && access.dayWrite);
    setWorkoutsWrite(WRITE_FEATURE_ENABLED && access.workoutsWrite);
    setReviewWrite(WRITE_FEATURE_ENABLED && access.reviewWrite);
    if (!draftsResult.error) setDrafts(draftsResult.data?.drafts || []);
    if (!marksResult.error) setReviewMarks(marksResult.data || []);
    if (!activityResult.error) setActivity(activityResult.data || []);
    setLoading(false);
  }, [shareableGoals, user]);

  useEffect(() => {
    if (!user || !supabase || !OAUTH_CLIENT_ID) return undefined;
    let active = true;
    const run = () => load().catch(() => {
      if (!active) return;
      setError("Ligand could not load the Assistant center.");
      setLoading(false);
    });
    run();
    window.addEventListener("focus", run);
    return () => {
      active = false;
      window.removeEventListener("focus", run);
    };
  }, [load, user]);

  if (!user) return null;

  const toggleGoal = (goalId) => {
    setSelectedGoalIds((current) =>
      current.includes(goalId)
        ? current.filter((id) => id !== goalId)
        : [...current, goalId]
    );
    setMessage("");
  };

  const save = async () => {
    const row = assistantAccessRow({
      userId: user.id,
      tasksRead: true,
      tasksWrite,
      dayRead,
      dayWrite,
      workoutsWrite,
      reviewWrite,
      writeFeatureEnabled: WRITE_FEATURE_ENABLED,
      allowUnassignedTasks: allowUnassigned,
      allowedGoalIds: selectedGoalIds,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
    });
    if (!row.enabled) {
      setError("Choose at least one goal or unassigned tasks.");
      return;
    }

    setBusy(true);
    setError("");
    setMessage("");
    const { error: saveError } = await supabase
      .from("assistant_access")
      .upsert(row, { onConflict: "user_id" });
    setBusy(false);
    if (saveError) {
      setError("Ligand could not save these access settings.");
      return;
    }
    setMessage("ChatGPT access updated.");
  };

  const applyDraft = async (confirmationId) => {
    setBusyId(confirmationId);
    setError("");
    const { error: applyError } = await supabase.rpc(
      "assistant_apply_changes_direct",
      { p_confirmation_id: confirmationId }
    );
    setBusyId(null);
    if (applyError) {
      setError("That draft expired or Ligand changed. Ask ChatGPT for a fresh preview.");
      return;
    }
    setMessage("Approved changes saved.");
    await load();
  };

  const dismissDraft = async (confirmationId) => {
    setBusyId(confirmationId);
    setError("");
    const { error: dismissError } = await supabase.rpc(
      "assistant_dismiss_change_preview",
      { p_confirmation_id: confirmationId }
    );
    setBusyId(null);
    if (dismissError) {
      setError("Ligand could not dismiss that draft.");
      return;
    }
    setDrafts((current) =>
      current.map((draft) =>
        draft.confirmationId === confirmationId
          ? { ...draft, status: "dismissed" }
          : draft
      )
    );
  };

  const resolveMark = async (id) => {
    setBusyId(id);
    const { error: resolveError } = await supabase
      .from("assistant_review_marks")
      .update({ status: "resolved", resolved_at: new Date().toISOString() })
      .eq("id", id);
    setBusyId(null);
    if (resolveError) {
      setError("Ligand could not resolve that review mark.");
      return;
    }
    setReviewMarks((current) => current.filter((mark) => mark.id !== id));
  };

  const copyDayPrompt = async () => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const date = tomorrow.toISOString().slice(0, 10);
    const prompt =
      `Use Ligand to plan my day for ${date}. Read my open shared tasks and existing Day blocks, ` +
      "avoid conflicts, include reasonable breaks, and show me one complete preview before saving anything.";
    try {
      await navigator.clipboard.writeText(prompt);
      setMessage("Day-planning prompt copied. Paste it into a ChatGPT chat with Ligand selected.");
    } catch {
      setMessage(prompt);
    }
  };

  const disconnect = async () => {
    if (!window.confirm("Disconnect ChatGPT from Ligand?")) return;
    setBusy(true);
    setError("");
    setMessage("");
    const disabledRow = assistantAccessRow({
      userId: user.id,
      tasksRead: false,
      writeFeatureEnabled: WRITE_FEATURE_ENABLED,
      allowUnassignedTasks: false,
      allowedGoalIds: [],
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
    });
    const { error: saveError } = await supabase
      .from("assistant_access")
      .upsert(disabledRow, { onConflict: "user_id" });
    if (saveError) {
      setBusy(false);
      setError("Ligand could not turn off ChatGPT access.");
      return;
    }
    const { error: revokeError } = await supabase.auth.oauth.revokeGrant({
      clientId: OAUTH_CLIENT_ID,
    });
    setBusy(false);
    setConnected(false);
    setSelectedGoalIds([]);
    setAllowUnassigned(false);
    if (revokeError) {
      setError("Access is off. Also disconnect Ligand in ChatGPT Settings to finish revoking it.");
      return;
    }
    setMessage("ChatGPT disconnected.");
  };

  const pendingCount = drafts.filter((draft) => draft.status === "pending").length;

  return (
    <section className="card chatgpt-access-card">
      <div className="card-head assistant-center-head">
        <div>
          <div className="card-title"><Icon.Spark /> Assistant center</div>
          <p>Review ChatGPT drafts, choose access, and see private activity records.</p>
        </div>
        <span className={connected ? "chatgpt-access-status connected" : "chatgpt-access-status"}>
          {loading ? "Checking" : connected ? "Connected" : "Not connected"}
        </span>
      </div>

      <div className="assistant-center-tabs" role="tablist" aria-label="Assistant center">
        {[
          ["inbox", `Inbox${pendingCount ? ` ${pendingCount}` : ""}`],
          ["access", "Access"],
          ["activity", "Activity"],
        ].map(([id, label]) => (
          <button
            key={id}
            type="button"
            className={view === id ? "active" : ""}
            onClick={() => setView(id)}
            role="tab"
            aria-selected={view === id}
          >
            {label}
          </button>
        ))}
      </div>

      {!loading && connected && view === "inbox" && (
        <div className="assistant-center-panel">
          <div className="assistant-plan-row">
            <div>
              <strong>Plan tomorrow with ChatGPT</strong>
              <span>Creates one conflict-aware draft. Nothing saves before approval.</span>
            </div>
            <button className="btn ghost sm" type="button" onClick={copyDayPrompt}>
              <Icon.Spark /> Copy prompt
            </button>
          </div>
          <h3>Drafts</h3>
          <DraftList
            drafts={drafts}
            busyId={busyId}
            onApply={applyDraft}
            onDismiss={dismissDraft}
          />
          <div className="assistant-review-section">
            <h3>Review later</h3>
            {reviewMarks.length === 0 ? (
              <p className="chatgpt-access-note">No items are marked for manual review.</p>
            ) : (
              <div className="assistant-review-list">
                {reviewMarks.map((mark) => (
                  <div className="assistant-review-row" key={mark.id}>
                    <div>
                      <strong>{mark.label}</strong>
                      <span>{mark.reason}</span>
                    </div>
                    <button
                      type="button"
                      className="iconbtn sm"
                      title="Done reviewing"
                      onClick={() => resolveMark(mark.id)}
                      disabled={busyId === mark.id}
                    >
                      <Icon.Check />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {!loading && connected && view === "access" && (
        <div className="assistant-center-panel">
          <div className="assistant-privacy-boundary">
            <Icon.Lock />
            <div>
              <strong>Never shared with ChatGPT</strong>
              <span>Notes, journals, reflections, recovery goals, meals, settings, backups, and raw account data.</span>
            </div>
          </div>
          <fieldset className="chatgpt-access-goals" disabled={busy}>
            <legend>Goals whose tasks may be read</legend>
            {shareableGoals.map((goal) => (
              <label key={goal.id}>
                <input
                  type="checkbox"
                  checked={selectedGoalIds.includes(goal.id)}
                  onChange={() => toggleGoal(goal.id)}
                />
                <span>{goal.name}</span>
              </label>
            ))}
            <label className="chatgpt-access-unassigned">
              <input
                type="checkbox"
                checked={allowUnassigned}
                onChange={(event) => setAllowUnassigned(event.target.checked)}
              />
              <span>Tasks not assigned to a goal</span>
            </label>
          </fieldset>

          <fieldset className="chatgpt-access-goals chatgpt-access-capabilities" disabled={busy}>
            <legend>Allowed actions</legend>
            {WRITE_FEATURE_ENABLED && (
              <label>
                <input type="checkbox" checked={tasksWrite} onChange={(event) => setTasksWrite(event.target.checked)} />
                <span>Task changes after approval</span>
              </label>
            )}
            <label>
              <input
                type="checkbox"
                checked={dayRead}
                onChange={(event) => {
                  setDayRead(event.target.checked);
                  if (!event.target.checked) setDayWrite(false);
                }}
              />
              <span>Read Day plans</span>
            </label>
            {WRITE_FEATURE_ENABLED && (
              <>
                <label>
                  <input type="checkbox" checked={dayWrite} onChange={(event) => setDayWrite(event.target.checked)} disabled={!dayRead} />
                  <span>Change Day plans after approval</span>
                </label>
                <label>
                  <input type="checkbox" checked={workoutsWrite} onChange={(event) => setWorkoutsWrite(event.target.checked)} />
                  <span>Import workout plans after approval</span>
                </label>
                <label>
                  <input type="checkbox" checked={reviewWrite} onChange={(event) => setReviewWrite(event.target.checked)} />
                  <span>Create non-destructive review marks</span>
                </label>
              </>
            )}
          </fieldset>
          <p className="chatgpt-access-note">
            Individual tasks marked <strong>Private</strong> stay hidden even when their goal is shared. ChatGPT can never delete Ligand content.
          </p>
          <div className="chatgpt-access-actions">
            <button className="btn primary sm" type="button" onClick={save} disabled={busy}>
              {busy ? "Saving..." : "Save access"}
            </button>
            <button className="btn ghost sm" type="button" onClick={disconnect} disabled={busy}>
              Disconnect
            </button>
          </div>
        </div>
      )}

      {!loading && connected && view === "activity" && (
        <div className="assistant-center-panel">
          <div className="assistant-privacy-boundary compact">
            <Icon.EyeOff />
            <div>
              <strong>Content-free history</strong>
              <span>This records action names, time, and item counts, never task titles, prompts, notes, or responses.</span>
            </div>
          </div>
          {activity.length === 0 ? (
            <p className="chatgpt-access-note">No ChatGPT activity recorded yet.</p>
          ) : (
            <div className="assistant-activity-list">
              {activity.map((item) => (
                <div key={item.id}>
                  <span className={`assistant-activity-dot ${item.action_class}`} />
                  <div>
                    <strong>{TOOL_LABELS[item.tool_name] || item.tool_name}</strong>
                    <span>{formatTime(item.created_at)}{Number.isInteger(item.item_count) ? ` · ${item.item_count} items` : ""}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {!loading && !connected && (
        <p className="chatgpt-access-note">Connect Ligand from ChatGPT to use the Assistant center.</p>
      )}
      {message && <p className="chatgpt-access-message" role="status">{message}</p>}
      {error && <p className="chatgpt-access-error" role="alert">{error}</p>}
    </section>
  );
}
