import { useEffect, useRef, useState } from "react";
import { Icon } from "../components/Icons.jsx";
import { todayKey, isCheckedOn, isGoalOverdue } from "../lib/model.js";
import { useIsMobile } from "../hooks/useIsMobile.js";

const CHECK_HOLD_MS = 300;
const CHECK_TOUCH_MOVE_TOLERANCE = 10;
const COMPLETE_ANIM_MS = 450;

/* DailyFocus - "what needs attention today" across every goal: habits not
   yet checked in (with inline quick check-in), Today/Urgent tasks not done,
   and overdue goals. Originally part of Overview; extracted so the mobile
   Home screen can show the same calm, single-section daily-focus view as
   its primary content instead of a dense multi-card dashboard. */
export default function DailyFocus({
  goals = [],
  tasks = [],
  checkInHabit,
  updateHabit,
  onOpenGoal,
  hideHabits = false,
}) {
  const today = todayKey();
  const isMobile = useIsMobile(640);

  // Inline habit-name editing for the quick check-in list.
  const [editingHabit, setEditingHabit] = useState(null); // { goalId, habitId }
  const [editText, setEditText] = useState("");
  const cancelEditRef = useRef(false);

  // Mobile: the habit list defaults to unchecked-only (see openHabits below);
  // this reveals the already-checked ones too, so today's check-ins aren't
  // just gone with no way to glance back at them.
  const [showAllHabits, setShowAllHabits] = useState(false);

  // Hold-to-check on mobile: press AND HOLD the checkbox for 300ms before a
  // check-in registers, with a fill animation on the circle giving live
  // feedback. Releasing early — or moving (a scroll) past a few px — cancels
  // with no check, so a stray scroll-tap can never toggle a habit. On desktop
  // there's no touchstart, so onClick fires an instant check as before.
  const checkPressTimer = useRef(null);
  const checkWasTouch = useRef(false); // suppress the click that follows a touch
  const checkPressStart = useRef({ x: 0, y: 0 });
  // Which habit's checkbox is currently mid-hold (drives the fill animation).
  const [pressingId, setPressingId] = useState(null);
  const [settlingHabits, setSettlingHabits] = useState({});
  const settleTimers = useRef({});
  const cancelHold = () => {
    clearTimeout(checkPressTimer.current);
    checkPressTimer.current = null;
    setPressingId(null);
  };
  useEffect(
    () => () => {
      clearTimeout(checkPressTimer.current);
      Object.values(settleTimers.current).forEach(clearTimeout);
    },
    []
  );

  const habitKey = (goalId, habitId) => goalId + "-" + habitId;
  const markHabitSettling = (goalId, habitId, mode = "completing") => {
    const key = habitKey(goalId, habitId);
    clearTimeout(settleTimers.current[key]);
    setSettlingHabits((current) => ({ ...current, [key]: mode }));
    settleTimers.current[key] = setTimeout(() => {
      setSettlingHabits((current) => {
        const next = { ...current };
        delete next[key];
        return next;
      });
      delete settleTimers.current[key];
    }, COMPLETE_ANIM_MS);
  };

  const completeHabit = (goalId, habitId) => {
    markHabitSettling(goalId, habitId, "completing");
    checkInHabit(goalId, habitId, today);
  };

  const handleCheckTouchStart = (goalId, habitId) => (e) => {
    const pt = e.touches[0];
    checkWasTouch.current = true;
    checkPressStart.current = { x: pt.clientX, y: pt.clientY };
    clearTimeout(checkPressTimer.current);
    setPressingId(goalId + "-" + habitId);
    checkPressTimer.current = setTimeout(() => {
      checkPressTimer.current = null;
      setPressingId(null);
      completeHabit(goalId, habitId);
    }, CHECK_HOLD_MS);
  };
  const handleCheckTouchMove = (e) => {
    if (!checkPressTimer.current) return;
    const pt = e.touches[0];
    const dx = Math.abs(pt.clientX - checkPressStart.current.x);
    const dy = Math.abs(pt.clientY - checkPressStart.current.y);
    if (dx > CHECK_TOUCH_MOVE_TOLERANCE || dy > CHECK_TOUCH_MOVE_TOLERANCE) {
      cancelHold();
    }
  };
  const handleCheckTouchEnd = () => cancelHold();
  const handleCheckClick = (goalId, habitId) => () => {
    // A click that follows a touch is owned by the hold logic above — the
    // hold either already fired the check or was cancelled, so ignore it.
    if (checkWasTouch.current) {
      checkWasTouch.current = false;
      return;
    }
    completeHabit(goalId, habitId);
  };

  const startEditHabit = (goalId, habit) => {
    setEditingHabit({ goalId, habitId: habit.id });
    setEditText(habit.name);
  };
  const commitEditHabit = () => {
    if (cancelEditRef.current) {
      cancelEditRef.current = false;
      setEditingHabit(null);
      setEditText("");
      return;
    }
    if (editingHabit) {
      const t = editText.trim();
      if (t) updateHabit?.(editingHabit.goalId, editingHabit.habitId, { name: t });
    }
    setEditingHabit(null);
    setEditText("");
  };

  // Habits across all goals not yet checked in today (each gets a quick check).
  const openHabits = [];
  const allHabits = [];
  goals.forEach((g) => {
    (g.habits || []).forEach((h) => {
      const checked = isCheckedOn(h, today);
      allHabits.push({ goalId: g.id, goalName: g.name, habit: h, checked });
      if (!checked) openHabits.push({ goalId: g.id, goalName: g.name, habit: h, checked: false });
    });
  });
  const hasCheckedHabits = allHabits.length > openHabits.length;
  const displayOpenHabits = hideHabits ? [] : openHabits;
  const habitsToShow = !hideHabits && isMobile && showAllHabits ? allHabits : displayOpenHabits;
  const hasSettlingHabits = Object.keys(settlingHabits).length > 0;
  const visibleHabitKeys = new Set(habitsToShow.map(({ goalId, habit }) => habitKey(goalId, habit.id)));
  const settlingHabitItems = allHabits.filter(({ goalId, habit }) => {
    const key = habitKey(goalId, habit.id);
    return settlingHabits[key] && !visibleHabitKeys.has(key);
  });
  const visibleHabits = [...habitsToShow, ...settlingHabitItems];

  // Tasks labeled Today/Urgent that aren't done yet.
  const focusTasks = tasks.filter(
    (t) => !t.done && (t.label === "Today" || t.label === "Urgent")
  );

  const overdue = goals.filter((g) => isGoalOverdue(g));

  const allCaughtUp =
    displayOpenHabits.length === 0 && !hasSettlingHabits && focusTasks.length === 0 && overdue.length === 0;

  const habitRowClass = (goalId, habit, checked = false, extra = "") =>
    [
      "ov-habit-row",
      checked && "checked",
      settlingHabits[habitKey(goalId, habit.id)],
      extra,
    ]
      .filter(Boolean)
      .join(" ");

  if (hideHabits && focusTasks.length === 0 && overdue.length === 0) {
    return null;
  }

  return (
    <div className="card ov-focus-card">
      <div className="card-head">
        <div className="card-title">
          <Icon.Spark /> Today's focus
        </div>
      </div>

      {allCaughtUp ? (
        <div className="ov-caught-up">
          <span className="ov-caught-ic">
            <Icon.Check />
          </span>
          <div>
            <div className="ov-caught-title">You're all caught up.</div>
            <div className="ov-caught-sub">Great work today.</div>
          </div>
          {!hideHabits && isMobile && hasCheckedHabits && (
            <button
              type="button"
              className="ov-habits-toggle ov-habits-toggle-caughtup"
              onClick={() => setShowAllHabits((s) => !s)}
            >
              {showAllHabits ? "Hide habits" : `Show all ${allHabits.length} habits`}
            </button>
          )}
          {!hideHabits && isMobile && showAllHabits && hasCheckedHabits && (
            <div className="stack" style={{ gap: 6, width: "100%" }}>
              {allHabits.map(({ goalId, goalName, habit }) => (
                <div key={goalId + "-" + habit.id} className={habitRowClass(goalId, habit, true)}>
                  <span className="ov-habit-check" style={{ cursor: "default" }}>
                    <span className="ov-habit-box checked" aria-hidden="true">
                      <Icon.Check width={11} height={11} />
                    </span>
                    <span className="ov-habit-text">
                      <span className="ov-habit-name">{habit.name}</span>
                      <span className="ov-habit-goal">{goalName}</span>
                    </span>
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div className="ov-focus-grid">
          {/* Quick habit check-in */}
          {!hideHabits && (openHabits.length > 0 || (isMobile && showAllHabits)) && (
            <div className="ov-focus-col">
              <div className="ov-focus-label">
                Habits to check in
                <span className="ov-count">{openHabits.length}</span>
              </div>
              <div className="stack" style={{ gap: 6 }}>
                {visibleHabits.map(({ goalId, goalName, habit, checked }) => {
                  const isEditing =
                    editingHabit &&
                    editingHabit.goalId === goalId &&
                    editingHabit.habitId === habit.id;
                  if (isEditing) {
                    return (
                      <div
                        key={goalId + "-" + habit.id}
                        className={habitRowClass(goalId, habit, false, "is-editing")}
                      >
                        <span className="ov-habit-box" aria-hidden="true" />
                        <input
                          className="input ov-habit-edit-input"
                          autoFocus
                          value={editText}
                          onChange={(e) => setEditText(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.preventDefault();
                              commitEditHabit();
                            }
                            if (e.key === "Escape") {
                              cancelEditRef.current = true;
                              setEditingHabit(null);
                            }
                          }}
                          onBlur={commitEditHabit}
                        />
                      </div>
                    );
                  }
                  if (checked) {
                    return (
                      <div key={goalId + "-" + habit.id} className={habitRowClass(goalId, habit, true)}>
                        <span className="ov-habit-check" style={{ cursor: "default" }}>
                          <span className="ov-habit-box checked" aria-hidden="true">
                            <Icon.Check width={11} height={11} />
                          </span>
                          <span className="ov-habit-text">
                            <span className="ov-habit-name">{habit.name}</span>
                            <span className="ov-habit-goal">{goalName}</span>
                          </span>
                        </span>
                      </div>
                    );
                  }
                  return (
                    <div key={goalId + "-" + habit.id} className={habitRowClass(goalId, habit, checked)}>
                      <button
                        type="button"
                        className="ov-habit-check"
                        onClick={handleCheckClick(goalId, habit.id)}
                        onTouchStart={handleCheckTouchStart(goalId, habit.id)}
                        onTouchMove={handleCheckTouchMove}
                        onTouchEnd={handleCheckTouchEnd}
                        onTouchCancel={handleCheckTouchEnd}
                        title={`Check in "${habit.name}"`}
                      >
                        <span
                          className={
                            "ov-habit-box" +
                            (pressingId === goalId + "-" + habit.id ? " pressing" : "")
                          }
                          aria-hidden="true"
                        />
                        <span className="ov-habit-text">
                          <span className="ov-habit-name">{habit.name}</span>
                          <span className="ov-habit-goal">{goalName}</span>
                        </span>
                      </button>
                      {updateHabit && (
                        <button
                          type="button"
                          className="ov-habit-edit"
                          title="Edit habit name"
                          onClick={(e) => {
                            e.stopPropagation();
                            startEditHabit(goalId, habit);
                          }}
                        >
                          <Icon.Pencil width={13} height={13} />
                        </button>
                      )}
                    </div>
                  );
                })}
                {isMobile && hasCheckedHabits && (
                  <button
                    type="button"
                    className="ov-habits-toggle"
                    onClick={() => setShowAllHabits((s) => !s)}
                  >
                    {showAllHabits ? "Show only unchecked" : `Show all ${allHabits.length} habits`}
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Today / Urgent tasks */}
          {focusTasks.length > 0 && (
            <div className="ov-focus-col">
              <div className="ov-focus-label">
                Today &amp; urgent tasks
                <span className="ov-count">{focusTasks.length}</span>
              </div>
              <div className="stack" style={{ gap: 6 }}>
                {focusTasks.map((t) => (
                  <div key={t.id} className="ov-task-row">
                    <span
                      className={"chip " + (t.label === "Urgent" ? "rose" : "")}
                      style={{ flex: "none" }}
                    >
                      {t.label}
                    </span>
                    <span className="ov-task-text">{t.text}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Overdue goals */}
          {overdue.length > 0 && (
            <div className="ov-focus-col">
              <div className="ov-focus-label">
                Goals to review
                <span className="ov-count">{overdue.length}</span>
              </div>
              <div className="stack" style={{ gap: 6 }}>
                {overdue.map((g) => (
                  <button
                    type="button"
                    key={g.id}
                    className="ov-task-row ov-overdue-row"
                    onClick={() => onOpenGoal(g.id)}
                  >
                    <span style={{ color: "var(--accent-ink)", flex: "none" }}>
                      <Icon.Calendar width={13} height={13} />
                    </span>
                    <span className="ov-task-text">{g.name}</span>
                    <Icon.Arrow width={13} height={13} />
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
