import { useMemo, useState } from "react";
import { todayKey, goalTargetDate, isGoalOverdue } from "../lib/model.js";
import { useLocalStorage } from "../hooks/useLocalStorage.js";
import { encouragingMessage, summarizeProgress, reentryMessage } from "../lib/ai.js";
import ProgressTracker from "../widgets/ProgressTracker.jsx";
import EncouragingMsg from "../widgets/EncouragingMsg.jsx";
import DidYouKnow from "../widgets/DidYouKnow.jsx";
import UpcomingDeadlines from "../widgets/UpcomingDeadlines.jsx";
import WeeklyReview from "../widgets/WeeklyReview.jsx";
import DailyFocus from "../widgets/DailyFocus.jsx";
import GoalsGrid from "../widgets/GoalsGrid.jsx";
import DayRing from "../widgets/DayRing.jsx";
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
  workouts = [],
  alarms = [],
  focusLog = [],
  scheduledWorkouts = [],
  onOpenWorkout,
  onOpenAlarms,
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

  // The overdue-goals review card - shared by the mobile stack and the desktop
  // left column so plans-changed cleanup lives in one place.
  const goalsToReview = overdueGoals.length > 0 && (
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
            <div key={g.id} style={{ borderTop: "1px solid var(--line)", paddingTop: 10 }}>
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
  );

  // Needs attention - urgent, undone tasks. Shared between layouts.
  const needsAttention = (
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
  );

  // "Pick one thing" is a gentle, occasional SUGGESTION - not a task you act on
  // here. It surfaces the single easiest next action only when there's an open
  // task and it hasn't been dismissed today; Hide is the only action, and it
  // never completes/edits the task. Once hidden it stays gone for the rest of
  // the local day (persisted date), then becomes eligible again tomorrow.
  const [pickOneHiddenDate, setPickOneHiddenDate] = useLocalStorage(
    "ligand.pickOneHiddenDate",
    null
  );
  const [pickOneCollapsing, setPickOneCollapsing] = useState(false);
  const hiddenToday = pickOneHiddenDate === todayKey();
  const showPickOne = Boolean(smallWin) && !hiddenToday;

  const hidePickOne = () => {
    // Collapse first, then commit the hidden date so it animates out cleanly.
    setPickOneCollapsing(true);
    window.setTimeout(() => {
      setPickOneHiddenDate(todayKey());
      setPickOneCollapsing(false);
    }, 320);
  };

  const pickOneCard = (
    <div className={"card pick-one-card" + (pickOneCollapsing ? " collapsing" : "")}>
      <div className="pick-one-body">
        <span className="pick-one-ic"><Icon.Spark /></span>
        <div className="pick-one-text">
          <div className="pick-one-title">Pick one thing</div>
          <div className="pick-one-suggestion">{smallWin?.text}</div>
        </div>
        <button
          className="pick-one-hide"
          onClick={hidePickOne}
          title="Hide for today"
          aria-label="Hide for today"
        >
          <Icon.Close width={14} height={14} />
        </button>
      </div>
    </div>
  );

  const goalsSection = (
    <div>
      <div className="ov-section-label">
        <Icon.Target /> Your goals
      </div>
      <GoalsGrid goals={goals} tasks={tasks} onOpenGoal={onOpenGoal} />
    </div>
  );

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

      {/* ---- Phone-only single-column stack. Keeps the calm Today's-focus card
         (with the "X of Y habits done today ->" line that jumps to Habits), then
         needs-attention, the compact goals grid, and one motivating stat - light
         and motivating, not a squished desktop dashboard. The full desktop grid
         below is hidden <768px via CSS (.home-desktop-grid). ---- */}
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

        {/* Compact "days showing up" — same activeDays source as desktop, always
            visible (a zero-state when there's no streak yet). */}
        <div className="card home-streak-mobile">
          <span className="home-streak-ic"><Icon.Flame /></span>
          <div className="home-streak-text">
            {activeDays > 0 ? (
              <>
                <div className="home-streak-num">
                  {activeDays} {activeDays === 1 ? "day" : "days"} showing up
                </div>
                <div className="home-streak-sub">Quiet days never count against you.</div>
              </>
            ) : (
              <>
                <div className="home-streak-num">Start your streak today</div>
                <div className="home-streak-sub">Just opening the app is enough to count.</div>
              </>
            )}
          </div>
        </div>

        <DayRing
          workouts={workouts}
          alarms={alarms}
          focusLog={focusLog}
          scheduledWorkouts={scheduledWorkouts}
          onOpenWorkout={onOpenWorkout}
          onOpenAlarms={onOpenAlarms}
        />
        {goalsToReview}
        {urgent.length > 0 && needsAttention}
        {showPickOne && pickOneCard}
        {goalsSection}
        <ProgressTracker goals={goals} tasks={tasks} />
        <UpcomingDeadlines goals={goals} onOpenGoal={onOpenGoal} />
        {showEncouragement && <EncouragingMsg message={message} sub={summary} />}
        <DidYouKnow />
      </div>

      <div className="grid grid-12 home-desktop-grid">
        {/* Left column - the main content */}
        <div className="col-8 stack" style={{ gap: 12, minWidth: 0 }}>
          {needsAttention}
          {goalsToReview}
          {showPickOne && pickOneCard}
          {goalsSection}
          <ProgressTracker goals={goals} tasks={tasks} />
          <UpcomingDeadlines goals={goals} onOpenGoal={onOpenGoal} />
        </div>

        {/* Right column - secondary info */}
        <div className="col-4 stack" style={{ gap: 12, minWidth: 0 }}>
          <DayRing
            workouts={workouts}
            alarms={alarms}
            focusLog={focusLog}
            scheduledWorkouts={scheduledWorkouts}
            onOpenWorkout={onOpenWorkout}
            onOpenAlarms={onOpenAlarms}
          />
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

          <WeeklyReview goals={goals} tasks={tasks} journal={journal} />

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

          <DidYouKnow />
        </div>
      </div>
    </>
  );
}
