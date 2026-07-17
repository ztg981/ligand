import { useEffect, useMemo, useState } from "react";
import AuthScreen from "./AuthScreen.jsx";
import { useAuth } from "../hooks/useAuth.jsx";
import { supabase } from "../lib/supabaseClient.js";
import {
  assistantAccessRow,
  normalizeAssistantAccess,
  shareableGoalsFromUserData,
  validateOAuthAuthorization,
} from "../lib/assistantAccess.js";
import "./OAuthConsent.css";

const EXPECTED_CLIENT_ID = import.meta.env.VITE_LIGAND_MCP_OAUTH_CLIENT_ID || "";
const WRITE_FEATURE_ENABLED = import.meta.env.VITE_LIGAND_MCP_ENABLE_TASK_WRITES === "true";

function LoadingCard({ text = "Checking this connection…" }) {
  return (
    <main className="oauth-consent-screen">
      <section className="oauth-consent-card" aria-live="polite">
        <div className="oauth-consent-brand"><span />Ligand</div>
        <p className="oauth-consent-loading">{text}</p>
      </section>
    </main>
  );
}

export default function OAuthConsent() {
  const { user, loading: authLoading } = useAuth();
  const authorizationId = useMemo(
    () => new URLSearchParams(window.location.search).get("authorization_id") || "",
    []
  );
  const [details, setDetails] = useState(null);
  const [goals, setGoals] = useState([]);
  const [selectedGoalIds, setSelectedGoalIds] = useState([]);
  const [allowUnassigned, setAllowUnassigned] = useState(false);
  const [tasksRead, setTasksRead] = useState(false);
  const [tasksWrite, setTasksWrite] = useState(false);
  const [dayRead, setDayRead] = useState(false);
  const [dayWrite, setDayWrite] = useState(false);
  const [workoutsWrite, setWorkoutsWrite] = useState(false);
  const [reviewWrite, setReviewWrite] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (authLoading || !user || !supabase) return;
    let active = true;

    const load = async () => {
      try {
        if (!authorizationId || authorizationId.length > 1000) {
          if (active) {
            setError("This authorization request is missing or invalid.");
            setLoading(false);
          }
          return;
        }

        const { data: authorization, error: authorizationError } =
          await supabase.auth.oauth.getAuthorizationDetails(authorizationId);
        if (!active) return;
        if (authorizationError || !authorization) {
          setError(authorizationError?.message || "This authorization request is no longer valid.");
          setLoading(false);
          return;
        }
        if (!("authorization_id" in authorization)) {
          window.location.assign(authorization.redirect_url);
          return;
        }

        const authorizationProblem = validateOAuthAuthorization(
          authorization,
          EXPECTED_CLIENT_ID,
          user.id
        );
        if (authorizationProblem) {
          setError(authorizationProblem);
          setLoading(false);
          return;
        }

        const [accessResult, dataResult] = await Promise.all([
          supabase
            .from("assistant_access")
            .select("enabled,tasks_read,tasks_write,day_read,day_write,workouts_write,review_write,allow_unassigned_tasks,allowed_goal_ids")
            .eq("user_id", user.id)
            .maybeSingle(),
          supabase.from("user_data").select("data").eq("user_id", user.id).maybeSingle(),
        ]);
        if (!active) return;
        if (accessResult.error || dataResult.error) {
          setError("Ligand could not load your sharing choices. No access was granted.");
          setLoading(false);
          return;
        }

        const shareableGoals = shareableGoalsFromUserData(dataResult.data?.data);
        const access = normalizeAssistantAccess(accessResult.data, shareableGoals);
        setDetails(authorization);
        setGoals(shareableGoals);
        setSelectedGoalIds(access.allowedGoalIds);
        setAllowUnassigned(access.allowUnassignedTasks);
        setTasksRead(access.tasksRead);
        setTasksWrite(WRITE_FEATURE_ENABLED && access.tasksWrite);
        setDayRead(access.dayRead);
        setDayWrite(WRITE_FEATURE_ENABLED && access.dayWrite);
        setWorkoutsWrite(WRITE_FEATURE_ENABLED && access.workoutsWrite);
        setReviewWrite(WRITE_FEATURE_ENABLED && access.reviewWrite);
        setLoading(false);
      } catch {
        if (!active) return;
        setError("Ligand could not load this authorization request. No access was granted.");
        setLoading(false);
      }
    };

    load();
    return () => {
      active = false;
    };
  }, [authLoading, authorizationId, user]);

  if (authLoading) return <LoadingCard />;
  if (!user) return <AuthScreen />;
  if (loading) return <LoadingCard />;

  const toggleGoal = (goalId) => {
    setSelectedGoalIds((current) =>
      current.includes(goalId)
        ? current.filter((id) => id !== goalId)
        : [...current, goalId]
    );
  };

  const deny = async () => {
    if (!authorizationId || !supabase) return;
    setBusy(true);
    setError("");
    const { data, error: denyError } = await supabase.auth.oauth.denyAuthorization(
      authorizationId,
      { skipBrowserRedirect: true }
    );
    if (denyError || !data?.redirect_url) {
      setError(denyError?.message || "Ligand could not decline this request safely.");
      setBusy(false);
      return;
    }
    window.location.assign(data.redirect_url);
  };

  const approve = async () => {
    if (!details || !supabase) return;
    setBusy(true);
    setError("");

    const shareRow = assistantAccessRow({
      userId: user.id,
      tasksRead,
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
    if (!shareRow.enabled) {
      setError("Choose at least one goal or unassigned tasks before connecting.");
      setBusy(false);
      return;
    }

    const { error: saveError } = await supabase
      .from("assistant_access")
      .upsert(shareRow, { onConflict: "user_id" });
    if (saveError) {
      setError("Ligand could not save your sharing choices. No access was granted.");
      setBusy(false);
      return;
    }

    const { data, error: approveError } = await supabase.auth.oauth.approveAuthorization(
      authorizationId,
      { skipBrowserRedirect: true }
    );
    if (approveError || !data?.redirect_url) {
      setError(approveError?.message || "Ligand could not approve this request.");
      setBusy(false);
      return;
    }
    window.location.assign(data.redirect_url);
  };

  return (
    <main className="oauth-consent-screen">
      <section className="oauth-consent-card">
        <div className="oauth-consent-brand"><span />Ligand</div>
        <p className="oauth-consent-eyebrow">Private ChatGPT connection</p>
        <h1>Choose exactly what ChatGPT can access</h1>
        <p className="oauth-consent-copy">
          {details?.client?.name || "ChatGPT"} is asking to access selected Ligand tasks and the capabilities you approve below.
          You can change or revoke this later.
        </p>

        <div className="oauth-consent-boundary">
          <strong>Never shared</strong>
          <span>Journal, notes, recovery goals, settings, backups, meals, workout history, and raw account data.</span>
        </div>

        <label className="oauth-consent-master">
          <input
            type="checkbox"
            checked={tasksRead}
            onChange={(event) => {
              setTasksRead(event.target.checked);
              if (!event.target.checked) {
                setTasksWrite(false);
                setDayRead(false);
                setDayWrite(false);
                setWorkoutsWrite(false);
                setReviewWrite(false);
              }
            }}
            disabled={busy}
          />
          <span><strong>Allow task reading</strong><small>Only tasks in the goals you select below are visible.</small></span>
        </label>

        {WRITE_FEATURE_ENABLED && (
          <label className="oauth-consent-master">
            <input
              type="checkbox"
              checked={tasksWrite}
              onChange={(event) => setTasksWrite(event.target.checked)}
              disabled={!tasksRead || busy}
            />
            <span>
              <strong>Allow limited task changes</strong>
              <small>ChatGPT may add, complete, or reschedule selected tasks. It can never delete tasks.</small>
            </span>
          </label>
        )}

        <label className="oauth-consent-master">
          <input
            type="checkbox"
            checked={dayRead}
            onChange={(event) => {
              setDayRead(event.target.checked);
              if (!event.target.checked) setDayWrite(false);
            }}
            disabled={!tasksRead || busy}
          />
          <span>
            <strong>Allow Day planner reading</strong>
            <small>ChatGPT may read approved Day block titles, times, and completion status.</small>
          </span>
        </label>

        {WRITE_FEATURE_ENABLED && (
          <>
            <label className="oauth-consent-master">
              <input
                type="checkbox"
                checked={dayWrite}
                onChange={(event) => setDayWrite(event.target.checked)}
                disabled={!tasksRead || !dayRead || busy}
              />
              <span>
                <strong>Allow Day planner changes</strong>
                <small>ChatGPT may add or complete Day blocks after a preview and confirmation.</small>
              </span>
            </label>
            <label className="oauth-consent-master">
              <input
                type="checkbox"
                checked={workoutsWrite}
                onChange={(event) => setWorkoutsWrite(event.target.checked)}
                disabled={!tasksRead || busy}
              />
              <span>
                <strong>Allow workout-plan imports</strong>
                <small>ChatGPT may add a structured planned workout. Existing workout history is never read.</small>
              </span>
            </label>
            <label className="oauth-consent-master">
              <input
                type="checkbox"
                checked={reviewWrite}
                onChange={(event) => setReviewWrite(event.target.checked)}
                disabled={!tasksRead || busy}
              />
              <span>
                <strong>Allow review marks</strong>
                <small>Removal requests become marks for you to review in Ligand. ChatGPT cannot delete anything.</small>
              </span>
            </label>
          </>
        )}

        <fieldset disabled={!tasksRead || busy}>
          <legend>Goals whose tasks may be read</legend>
          {goals.length === 0 ? (
            <p className="oauth-consent-empty">No shareable goals were found.</p>
          ) : (
            goals.map((goal) => (
              <label className="oauth-consent-goal" key={goal.id}>
                <input
                  type="checkbox"
                  checked={selectedGoalIds.includes(goal.id)}
                  onChange={() => toggleGoal(goal.id)}
                />
                <span>{goal.name}</span>
              </label>
            ))
          )}
          <label className="oauth-consent-goal oauth-consent-unassigned">
            <input
              type="checkbox"
              checked={allowUnassigned}
              onChange={(event) => setAllowUnassigned(event.target.checked)}
            />
            <span>Tasks not assigned to a goal</span>
          </label>
        </fieldset>

        {error && <div className="oauth-consent-error" role="alert">{error}</div>}

        <div className="oauth-consent-actions">
          <button type="button" className="btn" onClick={deny} disabled={busy}>
            Don’t connect
          </button>
          <button type="button" className="btn primary" onClick={approve} disabled={busy || !details}>
            {busy ? "Working…" : "Connect selected access"}
          </button>
        </div>
        <p className="oauth-consent-footnote">
          Requested account information: identity and email. Task access is limited to your choices above.
        </p>
      </section>
    </main>
  );
}
