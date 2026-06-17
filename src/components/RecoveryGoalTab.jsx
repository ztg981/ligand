import { useEffect, useRef, useState } from "react";
import { Icon } from "./Icons.jsx";
import {
  recoveryDays,
  nextMilestone,
  newlyReachedMilestones,
  encouragingLine,
  RECOVERY_PROMPTS,
  recoveryFallback,
  RECOVERY_MILESTONES,
} from "../lib/recovery.js";
import { todayKey } from "../lib/model.js";
import { fetchAiInsight } from "../lib/aiApi.js";
import { ding } from "../lib/uiSounds.js";

/* ============================================================
   RecoveryGoalTab — the full UI for a recovery/sobriety goal.

   Tone: compassionate, zero shame, entirely forward-facing.
   A setback is not a failure — it's a reason to start fresh.
   ============================================================ */

function MilestoneToast({ milestone, onDismiss }) {
  useEffect(() => {
    const id = setTimeout(onDismiss, 5000);
    return () => clearTimeout(id);
  }, [onDismiss]);

  return (
    <div className="recovery-milestone-toast">
      <Icon.Star width={16} height={16} />
      <span>
        <strong>{milestone.label}</strong> — a real milestone. You earned this.
      </span>
      <button
        type="button"
        onClick={onDismiss}
        style={{ marginLeft: "auto", background: "none", border: "none", cursor: "pointer", opacity: 0.6, padding: 2 }}
        title="Dismiss"
      >
        <Icon.Close width={13} height={13} />
      </button>
    </div>
  );
}

function ResetConfirmOverlay({ label, onConfirm, onBack }) {
  return (
    <div className="recovery-reset-overlay" role="dialog" aria-modal="true" aria-labelledby="reset-title">
      <div className="recovery-reset-card">
        <div className="recovery-reset-icon">
          <Icon.Leaf />
        </div>
        <h2 className="recovery-reset-title" id="reset-title">
          Setbacks are part of recovery, not the end of it.
        </h2>
        <p className="recovery-reset-body">
          Every day you tried counts. The path isn't straight, and that's normal.
          Your journal and the milestones you've reached stay with you — nothing is erased.
          Ready to start your next streak?
        </p>
        <div className="recovery-reset-actions">
          <button type="button" className="btn primary" onClick={onConfirm}>
            Start fresh from today
          </button>
          <button type="button" className="btn ghost" onClick={onBack}>
            Go back
          </button>
        </div>
      </div>
    </div>
  );
}

function HeroCounter({ days, label, milestoneToast, onDismissToast }) {
  const next = nextMilestone(days);
  const prev = RECOVERY_MILESTONES.slice().reverse().find((m) => days >= m.days);
  const progressPct = next
    ? Math.min(100, ((days - (prev?.days ?? 0)) / (next.days - (prev?.days ?? 0))) * 100)
    : 100;

  return (
    <div className="recovery-hero">
      <div className="recovery-hero-days">{days}</div>
      <div className="recovery-hero-label">
        {days === 1 ? "day" : "days"} free from <em>{label}</em>
      </div>
      <div className="recovery-hero-enc">{encouragingLine(days)}</div>

      {milestoneToast && (
        <MilestoneToast milestone={milestoneToast} onDismiss={onDismissToast} />
      )}

      <div className="recovery-milestone-track" style={{ marginTop: milestoneToast ? 12 : 20 }}>
        <div className="recovery-milestone-fill" style={{ width: `${progressPct}%` }} />
      </div>

      <div className="recovery-milestone-labels">
        <span style={{ fontSize: 11.5, color: "var(--ink-3)" }}>
          {prev ? prev.label : "Day 1"}
        </span>
        {next ? (
          <span style={{ fontSize: 11.5, color: "var(--ink-3)" }}>
            {next.days - days} day{next.days - days === 1 ? "" : "s"} to {next.label}
          </span>
        ) : (
          <span style={{ fontSize: 11.5, color: "var(--accent)", fontWeight: 500 }}>
            5 years free ✦
          </span>
        )}
      </div>
    </div>
  );
}

function WhyCard({ why, onSave }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(why || "");
  const textareaRef = useRef(null);

  useEffect(() => {
    if (editing && textareaRef.current) textareaRef.current.focus();
  }, [editing]);

  const commit = () => {
    onSave(draft.trim());
    setEditing(false);
  };

  return (
    <div className="card">
      <div className="row between" style={{ alignItems: "flex-start", gap: 10 }}>
        <div className="card-title">
          <Icon.Heart /> Why this matters
        </div>
        {!editing && (
          <button
            type="button"
            className="btn ghost sm"
            onClick={() => { setDraft(why || ""); setEditing(true); }}
          >
            {why ? "Edit" : "Add"}
          </button>
        )}
      </div>

      {editing ? (
        <>
          <textarea
            ref={textareaRef}
            className="input"
            rows={3}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="For my family, my health, the person I'm becoming…"
            style={{ marginTop: 10, resize: "vertical", lineHeight: 1.55 }}
          />
          <div className="row" style={{ gap: 8, marginTop: 10, justifyContent: "flex-end" }}>
            <button type="button" className="btn ghost sm" onClick={() => setEditing(false)}>Cancel</button>
            <button type="button" className="btn primary sm" onClick={commit}>
              <Icon.Check /> Save
            </button>
          </div>
        </>
      ) : why ? (
        <div
          style={{ fontSize: 14, color: "var(--ink-2)", lineHeight: 1.6, marginTop: 8, fontStyle: "italic" }}
        >
          "{why}"
        </div>
      ) : (
        <div style={{ fontSize: 13, color: "var(--ink-3)", marginTop: 8, lineHeight: 1.45 }}>
          Adding a "why" can help on harder days. Tap Add to write it.
        </div>
      )}
    </div>
  );
}

function AIInsightCard({ goal, days }) {
  const [insight, setInsight] = useState(null);
  const [loading, setLoading] = useState(false);

  const rd = goal.recoveryData || {};

  const load = (force = false) => {
    setLoading(true);
    const context = {
      days,
      label: rd.label || goal.name,
      why: rd.why || "",
      recentJournal: (goal.reflections || [])
        .slice(-3)
        .map((r) => r.text)
        .join(" | "),
    };
    fetchAiInsight(goal.id, "recovery_insight", context, force)
      .then((res) => setInsight(res))
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    if (!goal?.id) return;
    load(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [goal?.id]);

  const text = insight?.text;
  // When recovery AI is toggled off, the call is skipped (source "off") — show
  // the line quietly with no refresh and no "fallback" badge.
  const isOff = insight?.source === "off";
  const isFallback =
    !isOff && (!text || insight?.source === "fallback" || insight?.source === "logged-out");
  const displayText = text || recoveryFallback(days);

  return (
    <div className="card">
      <div className="row between" style={{ alignItems: "flex-start", gap: 10 }}>
        <div className="card-title">
          <Icon.Spark /> A thought for today
        </div>
        {!isOff && (
          <button
            type="button"
            className="btn ghost sm"
            onClick={() => load(true)}
            disabled={loading}
            title="Refresh"
            style={{ opacity: loading ? 0.55 : 1 }}
          >
            {loading ? "…" : <><Icon.Reset width={13} height={13} /> Refresh</>}
          </button>
        )}
      </div>
      <div
        style={{ fontSize: 14, color: "var(--accent-ink)", lineHeight: 1.6, marginTop: 8, fontStyle: "italic" }}
      >
        "{displayText}"
      </div>
      {isFallback && (
        <div style={{ fontSize: 11, color: "var(--ink-4)", marginTop: 6 }}>(Using fallback)</div>
      )}
    </div>
  );
}

function JournalSection({ goal, addReflection, removeReflection }) {
  const [text, setText] = useState("");
  const [promptIdx, setPromptIdx] = useState(
    () => Math.floor(Math.random() * RECOVERY_PROMPTS.length)
  );
  const reflections = goal.reflections || [];
  const prompt = RECOVERY_PROMPTS[promptIdx];

  const submit = () => {
    const t = text.trim();
    if (!t) return;
    addReflection(goal.id, { text: t, prompt });
    setText("");
  };

  const nextPrompt = () =>
    setPromptIdx((i) => (i + 1) % RECOVERY_PROMPTS.length);

  return (
    <div className="card">
      <div className="card-title">
        <Icon.Book /> Journal
      </div>

      <div
        style={{
          fontSize: 12.5, color: "var(--accent-ink)", lineHeight: 1.5,
          background: "var(--accent-soft)", borderRadius: "var(--r-sm)",
          padding: "8px 10px", marginTop: 10,
          display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8,
        }}
      >
        <span>{prompt}</span>
        <button
          type="button"
          className="btn ghost sm"
          onClick={nextPrompt}
          title="Different prompt"
          style={{ flex: "none", fontSize: 11, padding: "2px 8px" }}
        >
          Different
        </button>
      </div>

      <div style={{ marginTop: 10, display: "flex", gap: 8, flexWrap: "wrap" }}>
        <textarea
          className="input"
          rows={3}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Write whatever comes up…"
          style={{ flex: "1 1 240px", resize: "vertical", lineHeight: 1.55 }}
        />
        <div style={{ flex: "none", alignSelf: "flex-end" }}>
          <button
            type="button"
            className="btn primary"
            onClick={submit}
            disabled={!text.trim()}
            style={{ opacity: text.trim() ? 1 : 0.55 }}
          >
            <Icon.Check /> Save
          </button>
        </div>
      </div>

      {reflections.length > 0 && (
        <div className="stack" style={{ gap: 10, marginTop: 16 }}>
          {[...reflections].reverse().map((r) => (
            <div
              key={r.id}
              style={{
                borderTop: "1px solid var(--line)", paddingTop: 10,
                fontSize: 13, color: "var(--ink-2)", lineHeight: 1.6,
              }}
            >
              {r.prompt && (
                <div style={{ fontSize: 11, color: "var(--ink-4)", marginBottom: 4 }}>
                  {r.prompt}
                </div>
              )}
              <div style={{ whiteSpace: "pre-wrap" }}>{r.text}</div>
              <div className="row between" style={{ marginTop: 6 }}>
                <span style={{ fontSize: 11, color: "var(--ink-4)" }}>
                  {r.createdAt ? r.createdAt.slice(0, 10) : ""}
                </span>
                {removeReflection && (
                  <button
                    type="button"
                    className="btn ghost sm"
                    onClick={() => removeReflection(goal.id, r.id)}
                    style={{ fontSize: 11, color: "var(--ink-3)" }}
                  >
                    <Icon.Trash width={12} height={12} />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function RecoveryGoalTab({
  goal,
  updateGoal,
  onArchiveGoal,
  addReflection,
  removeReflection,
}) {
  const [milestoneToast, setMilestoneToast] = useState(null);
  const [showReset, setShowReset] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [draft, setDraft] = useState("");
  const inputRef = useRef(null);
  const celebratedRef = useRef(false);

  if (!goal) return null;

  const rd = goal.recoveryData || {};
  const days = recoveryDays(rd.startDate);
  const label = rd.label || goal.name;
  const reachedDays = rd.milestonesReached || [];

  // Celebrate newly reached milestones once per mount.
  useEffect(() => {
    if (celebratedRef.current) return;
    celebratedRef.current = true;
    const fresh = newlyReachedMilestones(days, reachedDays);
    if (fresh.length === 0) return;
    // Chime and show the highest newly reached milestone.
    ding(0.4);
    setMilestoneToast(fresh[fresh.length - 1]);
    // Persist all newly reached milestones.
    updateGoal(goal.id, {
      recoveryData: {
        ...rd,
        milestonesReached: [...reachedDays, ...fresh.map((m) => m.days)],
      },
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (renaming && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [renaming]);

  const saveRename = () => {
    const name = draft.trim();
    if (name && name !== goal.name) {
      updateGoal(goal.id, { name, recoveryData: { ...rd, label: name } });
    }
    setRenaming(false);
  };

  const saveWhy = (why) => {
    updateGoal(goal.id, { recoveryData: { ...rd, why } });
  };

  const handleReset = () => {
    const today = todayKey();
    // Add a compassionate journal entry automatically.
    addReflection(goal.id, {
      text: "New streak started. Everything before this still counts.",
      prompt: null,
    });
    // Update start date but KEEP milestonesReached (they earned them).
    updateGoal(goal.id, {
      recoveryData: { ...rd, startDate: today },
    });
    setShowReset(false);
  };

  return (
    <>
      {showReset && (
        <ResetConfirmOverlay
          label={label}
          onConfirm={handleReset}
          onBack={() => setShowReset(false)}
        />
      )}

      <div className="page-head">
        <div style={{ minWidth: 0 }}>
          <div className="eyebrow" style={{ display: "flex", alignItems: "center", gap: 5 }}>
            <Icon.Leaf width={12} height={12} style={{ color: "oklch(0.5 0.14 150)" }} />
            Recovery tracker
          </div>

          {renaming ? (
            <input
              ref={inputRef}
              className="input"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") saveRename();
                if (e.key === "Escape") setRenaming(false);
              }}
              onBlur={saveRename}
              style={{ fontSize: 22, fontWeight: 600, maxWidth: 360, marginTop: 4 }}
            />
          ) : (
            <h1 className="page-title row" style={{ gap: 8, alignItems: "center" }}>
              {goal.name}
              <span className="row" style={{ gap: 2 }}>
                <button
                  type="button"
                  className="iconbtn"
                  title="Rename"
                  onClick={() => { setDraft(goal.name); setRenaming(true); }}
                  style={{ width: 26, height: 26, color: "var(--ink-3)" }}
                >
                  <Icon.Edit />
                </button>
                <button
                  type="button"
                  className="iconbtn"
                  title="Archive"
                  onClick={() => onArchiveGoal(goal.id)}
                  style={{ width: 26, height: 26, color: "var(--ink-3)" }}
                >
                  <Icon.Trash />
                </button>
              </span>
            </h1>
          )}

          <p className="page-sub">A private space for your journey. Only you can see this.</p>
        </div>
      </div>

      <div className="stack" style={{ gap: 14 }}>
        <HeroCounter
          days={days}
          label={label}
          milestoneToast={milestoneToast}
          onDismissToast={() => setMilestoneToast(null)}
        />

        <div className="grid grid-12" style={{ gap: 14 }}>
          <div className="col-8 stack" style={{ gap: 14, minWidth: 0 }}>
            <WhyCard why={rd.why} onSave={saveWhy} />
            <JournalSection
              goal={goal}
              addReflection={addReflection}
              removeReflection={removeReflection}
            />
          </div>

          <div className="col-4 stack" style={{ gap: 14, minWidth: 0 }}>
            <AIInsightCard goal={goal} days={days} />

            {/* Milestones earned — a gentle log */}
            {reachedDays.length > 0 && (
              <div className="card">
                <div className="card-title">
                  <Icon.Star /> Milestones reached
                </div>
                <div className="stack" style={{ gap: 6, marginTop: 10 }}>
                  {RECOVERY_MILESTONES
                    .filter((m) => reachedDays.includes(m.days))
                    .map((m) => (
                      <div key={m.days} className="row" style={{ gap: 8, fontSize: 13 }}>
                        <Icon.Check width={13} height={13} style={{ color: "var(--accent)", flex: "none" }} />
                        <span style={{ color: "var(--ink-2)" }}>{m.label}</span>
                      </div>
                    ))}
                </div>
              </div>
            )}

            {/* Start a new streak — placed at the bottom, never prominent */}
            <div
              style={{
                textAlign: "center", paddingTop: 8,
                borderTop: "1px solid var(--line)", marginTop: 4,
              }}
            >
              <div style={{ fontSize: 11.5, color: "var(--ink-4)", marginBottom: 8, lineHeight: 1.45 }}>
                Setbacks are part of the journey.
              </div>
              <button
                type="button"
                className="btn ghost sm"
                onClick={() => setShowReset(true)}
                style={{ color: "var(--ink-3)", fontSize: 12 }}
              >
                Start a new streak
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
