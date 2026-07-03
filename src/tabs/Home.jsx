import { useMemo, useState } from "react";
import { todayKey, goalTargetDate, isGoalOverdue } from "../lib/model.js";
import { encouragingMessage, summarizeProgress, reentryMessage } from "../lib/ai.js";
import ProgressTracker from "../widgets/ProgressTracker.jsx";
import EncouragingMsg from "../widgets/EncouragingMsg.jsx";
import DidYouKnow from "../widgets/DidYouKnow.jsx";
import UpcomingDeadlines from "../widgets/UpcomingDeadlines.jsx";
import WeeklyReview from "../widgets/WeeklyReview.jsx";
import DailyFocus from "../widgets/DailyFocus.jsx";
import { Icon } from "../components/Icons.jsx";

// Rotating late-night greetings for the 12am–4:59am crowd. Kept gentle and
// a little warm - never scolding someone for being up late.
const NIGHT_OWL_GREETINGS = [
  "Still up?",
  "Burning the midnight oil",
  "Hey, night owl",
];

function greeting(now = new Date()) {
  const h = now.getHours();
  if (h >= 5 && h < 12) return "Good morning";
  if (h >= 12 && h < 17) return "Good afternoon";
  if (h >= 17 && h < 21) return "Good evening";
  if (h >= 21) return "Winding down";
  // 12am–4:59am - rotate by day so it varies but doesn't flicker on re-render.
  const dayIndex = Math.floor((now - new Date(now.getFullYear(), 0, 0)) / 86400000);
  return NIGHT_OWL_GREETINGS[dayIndex % NIGHT_OWL_GREETINGS.length];
}

function prettyDate() {
  return new Date().toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

export default function Home({
  goals,
  tasks,
  journal = [],
  toggleTask,
  onGoToTasks,
  onGoToHabits,
  onSnoozeGoal,
  onReviseGoalDate,
  onArchiveGoal,
  onOpenGoal,
  userName = "friend",
  showEncouragement = true,
  tone = "warm",
  daysAway = 0,
  weekVisits = 0,
  activeDays = 0,
  checkInHabit,
  updateHabit,
  onQuickCapture,
}) {
  const [reviewDates, setReviewDates] = useState({});

  const activeTasks = useMemo(() => tasks.filter((t) => !t.done), [tasks]);
  const doneCount = tasks.length - activeTasks.length;

  // Small win: the easiest next thing. Prefer Today, then General, then anything;
  // among those, the shortest wording (feels least daunting).
  const smallWin = useMemo(() => {
    const rank = (t) => (t.label === "Today" ? 0 : t.label === "General" ? 1 : 2);
    return [...activeTasks]
      .sort((a, b) => rank(a) - rank(b) || a.text.length - b.text.length)[0];
  }, [activeTasks]);

  const urgent = useMemo(() => activeTasks.filter((t) => t.label === "Urgent"), [activeTasks]);
  // Recovery goals are excluded from the overdue list - they're private by design
  // and don't have target dates anyway, so they can never become overdue.
  const overdueGoals = useMemo(
    () => goals.filter((g) => g.type !== "recovery" && isGoalOverdue(g)),
    [goals]
  );

  const message = encouragingMessage({ doneCount, activeCount: activeTasks.length, tone });
  const summary = summarizeProgress({ goals, tasks });

  return (
    <>
      <div className="page-head">
        <div>
          <div className="eyebrow">Dashboard · {prettyDate()}</div>
          <h1 className="page-title">
            {greeting()}, {userName}.
          </h1>
          <p className="page-sub">{showEncouragement ? message : prettyDate()}</p>
        </div>
      </div>

      {/* Gentle re-entry banner - only after a real gap away. */}
      {daysAway >= 2 && (
        <div
          className="card"
          style={{
            background: "var(--accent-soft)",
            borderColor: "transparent",
            marginBottom: 14,
          }}
        >
          <div className="row" style={{ gap: 10, alignItems: "flex-start" }}>
            <span style={{ color: "var(--accent-ink)", flex: "none", marginTop: 1 }}>
              <Icon.Heart />
            </span>
            <div style={{ color: "var(--accent-ink)", fontSize: 13.5, lineHeight: 1.45 }}>
              {reentryMessage(daysAway)}
            </div>
          </div>
        </div>
      )}

      {/* ---- Phone-only daily driver: one focus section, a quick-capture
         button, and a compact goals row - not a squished dashboard. The full
         desktop grid below is hidden <768px via CSS (.home-desktop-grid). ---- */}
      <div className="home-mobile-only">
        <DailyFocus
          goals={goals}
          tasks={tasks}
          checkInHabit={checkInHabit}
          updateHabit={updateHabit}
          onOpenGoal={onOpenGoal}
          habitsSummaryOnMobile
          onOpenHabits={onGoToHabits}
        />

        <button
          type="button"
          className="home-quick-capture"
          onClick={onQuickCapture}
        >
          <Icon.Note /> Capture a thought
        </button>

        {goals.length > 0 && (
          <div className="home-goals-glance">
            {goals.map((g) => (
              <button
                key={g.id}
                type="button"
                className="home-glance-pill"
                onClick={() => onOpenGoal?.(g.id)}
              >
                {g.type === "recovery" ? (
                  <span className="gs-leaf">
                    <Icon.Leaf />
                  </span>
                ) : (
                  <span className="gs-dot" style={{ background: g.color }} />
                )}
                {g.name}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="grid grid-12 home-desktop-grid">
        {/* Left column */}
        <div className="col-8 stack" style={{ gap: 12, minWidth: 0 }}>
          {/* Pick one thing */}
          <div className="card">
            <div className="card-head">
              <div className="card-title">
                <Icon.Spark /> Pick one thing
              </div>
            </div>
            {smallWin ? (
              <div className="row between" style={{ gap: 10 }}>
                <div>
                  <div style={{ fontSize: 15, fontWeight: 500 }}>{smallWin.text}</div>
                  <div style={{ fontSize: 11.5, color: "var(--ink-3)", marginTop: 2 }}>
                    One small step is plenty for right now.
                  </div>
                </div>
                <button className="btn primary" onClick={() => toggleTask(smallWin.id)} style={{ flex: "none" }}>
                  <Icon.Check /> Done
                </button>
              </div>
            ) : (
              <div style={{ fontSize: 13, color: "var(--ink-3)" }}>
                Nothing queued up.{" "}
                <button className="btn ghost sm" onClick={onGoToTasks} style={{ display: "inline-flex" }}>
                  <Icon.Plus /> Add a task
                </button>
              </div>
            )}
          </div>

          {overdueGoals.length > 0 && (
            <div className="card">
              <div className="card-head">
                <div className="card-title">
                  <Icon.Calendar /> Goals to review
                </div>
                <span className="mono" style={{ fontSize: 11, color: "var(--ink-3)" }}>
                  {overdueGoals.length}
                </span>
              </div>
              <p style={{ fontSize: 12.5, color: "var(--ink-3)", margin: "0 0 10px", lineHeight: 1.45 }}>
                Plans change. Want to clean this up? You can keep it, revise it, or let it go.
              </p>
              <div className="stack" style={{ gap: 10 }}>
                {overdueGoals.map((g) => {
                  const target = goalTargetDate(g);
                  const draft = reviewDates[g.id] ?? target ?? todayKey();
                  return (
                    <div
                      key={g.id}
                      style={{
                        borderTop: "1px solid var(--line)",
                        paddingTop: 10,
                      }}
                    >
                      <div className="row between" style={{ gap: 10, flexWrap: "wrap" }}>
                        <div style={{ minWidth: 0 }}>
                          <div className="row" style={{ gap: 6, fontSize: 13, flexWrap: "wrap" }}>
                            <span className="chip rose">Review</span>
                            <strong>{g.name}</strong>
                          </div>
                          <div className="mono" style={{ fontSize: 11, color: "var(--ink-3)", marginTop: 3 }}>
                            Target date: {target}
                          </div>
                        </div>
                        <button className="btn ghost sm" onClick={() => onOpenGoal?.(g.id)}>
                          Open
                        </button>
                      </div>

                      <div className="row" style={{ gap: 8, marginTop: 8, flexWrap: "wrap" }}>
                        <button className="btn ghost sm" onClick={() => onSnoozeGoal?.(g.id)}>
                          Keep goal
                        </button>
                        <input
                          type="date"
                          className="input"
                          value={draft}
                          onChange={(e) =>
                            setReviewDates((dates) => ({ ...dates, [g.id]: e.target.value }))
                          }
                          style={{ width: 140, flex: "none" }}
                        />
                        <button
                          className="btn ghost sm"
                          onClick={() => draft && onReviseGoalDate?.(g.id, draft)}
                        >
                          Revise target date
                        </button>
                        {g.type !== "built-in" && (
                          <button
                            className="btn ghost sm"
                            onClick={() => onArchiveGoal?.(g.id)}
                            style={{ color: "oklch(0.55 0.16 20)" }}
                          >
                            Archive goal
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Urgent */}
          <div className="card">
            <div className="card-head">
              <div className="card-title">
                <Icon.Bell /> Needs attention
              </div>
              <span className="mono" style={{ fontSize: 11, color: "var(--ink-3)" }}>
                {urgent.length || ""}
              </span>
            </div>
            {urgent.length === 0 ? (
              <div style={{ fontSize: 13, color: "var(--ink-3)" }}>
                Nothing urgent right now. Take a breath.
              </div>
            ) : (
              <div className="stack" style={{ gap: 8 }}>
                {urgent.map((t) => (
                  <div key={t.id} className="row between">
                    <span className="row" style={{ gap: 6, fontSize: 13 }}>
                      <span className="chip rose">Urgent</span>
                      {t.text}
                    </span>
                    <button className="btn ghost sm" onClick={() => toggleTask(t.id)}>
                      <Icon.Check /> Done
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <ProgressTracker goals={goals} tasks={tasks} />
        </div>

        {/* Right column */}
        <div className="col-4 stack" style={{ gap: 12, minWidth: 0 }}>
          <WeeklyReview goals={goals} tasks={tasks} journal={journal} />

          {/* Days showing up - distinct calendar days the app was actually
              opened (never elapsed days, never more than once per day). */}
          {activeDays > 0 && (
            <div className="card">
              <div className="card-head">
                <div className="card-title">
                  <Icon.Flame /> Days showing up
                </div>
              </div>
              <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
                <div
                  className="mono"
                  style={{ fontSize: 40, fontWeight: 500, letterSpacing: "-0.02em" }}
                >
                  {activeDays}
                </div>
                <div style={{ fontSize: 13, color: "var(--ink-2)" }}>
                  {activeDays === 1 ? "day" : "days"}
                </div>
              </div>
              <div style={{ fontSize: 11.5, color: "var(--ink-4)", marginTop: 8 }}>
                Distinct days you've opened the app. Quiet days never count against you.
              </div>
            </div>
          )}

          {showEncouragement && <EncouragingMsg message={message} sub={summary} />}

          {/* Visit streak stat - gentle, framed as "showing up" not performance */}
          {weekVisits > 0 && (
            <div className="card" style={{ textAlign: "center", padding: "14px 16px" }}>
              <div
                style={{
                  fontSize: 30,
                  fontWeight: 700,
                  letterSpacing: "-0.03em",
                  color: "var(--accent)",
                  lineHeight: 1,
                }}
              >
                {weekVisits}
              </div>
              <div style={{ fontSize: 12.5, color: "var(--ink-2)", fontWeight: 500, marginTop: 4 }}>
                {weekVisits === 7
                  ? "every day this week"
                  : `day${weekVisits > 1 ? "s" : ""} this week`}
              </div>
              <div style={{ fontSize: 11, color: "var(--ink-4)", marginTop: 3 }}>
                showing up
              </div>
            </div>
          )}

          <UpcomingDeadlines goals={goals} onOpenGoal={onOpenGoal} />

          <DidYouKnow />
        </div>
      </div>
    </>
  );
}
