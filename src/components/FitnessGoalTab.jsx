import { useMemo, useState } from "react";
import { Icon } from "./Icons.jsx";
import WorkoutLogger from "./WorkoutLogger.jsx";
import {
  workoutsThisWeek,
  weeklyWorkoutStreak,
  workoutVolume,
  todayKey,
} from "../lib/model.js";
import { MUSCLE_LABEL } from "../lib/exercises.js";

/* FitnessGoalTab — the preset layout for a Fitness goal, distinct from the
   regular SMART goal tab. Three sections per the brief:
     TOP     — today's plan / log button, weekly progress, current streak
     MIDDLE  — recent sessions (last 5)
     BOTTOM  — personal records per muscle group

   Stage B: the overview + manual free logging (via WorkoutLogger).
   (Stage C adds the rest timer + PR celebration + start-from-template;
    Stage D adds generation; Stage E adds progress charts.) */

function relDate(key) {
  if (!key) return "";
  const today = todayKey();
  if (key === today) return "Today";
  const d = new Date(key + "T00:00:00");
  const diff = Math.round((new Date(today + "T00:00:00") - d) / 86400000);
  if (diff === 1) return "Yesterday";
  if (diff < 7) return `${diff} days ago`;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function fmtDuration(sec) {
  if (!sec) return "—";
  const m = Math.round(sec / 60);
  return `${m} min`;
}

export default function FitnessGoalTab({
  goal,
  profile,
  workouts = [],
  addWorkout,
  onArchiveGoal,
}) {
  const [logging, setLogging] = useState(false);
  const unit = profile?.weightUnit || "lbs";

  // Only this goal's sessions (fall back to all if none are tagged — a lone
  // fitness goal often logs untagged sessions).
  const myWorkouts = useMemo(() => {
    const tagged = workouts.filter((w) => w.goalId === goal.id);
    return tagged.length ? tagged : workouts;
  }, [workouts, goal.id]);

  const weekCount = useMemo(() => workoutsThisWeek(myWorkouts).length, [myWorkouts]);
  const streak = useMemo(() => weeklyWorkoutStreak(myWorkouts), [myWorkouts]);
  const target = profile?.workoutDaysPerWeek || 3;
  const recent = myWorkouts.slice(0, 5);

  // Personal records: heaviest completed set per muscle group, tagged with the
  // exercise it came from.
  const prsByGroup = useMemo(() => {
    const best = {}; // group -> { name, weight, reps }
    myWorkouts.forEach((w) => {
      (w.exercises || []).forEach((ex) => {
        if (ex.type === "cardio") return;
        (ex.sets || []).forEach((s) => {
          if (!s.done || s.weight == null) return;
          const g = ex.muscleGroup || "other";
          if (!best[g] || s.weight > best[g].weight) {
            best[g] = { name: ex.name, weight: s.weight, reps: s.reps };
          }
        });
      });
    });
    return best;
  }, [myWorkouts]);

  const prGroups = Object.keys(prsByGroup);

  const handleFinish = (workout) => {
    addWorkout({ ...workout, goalId: goal.id });
  };

  if (logging) {
    return (
      <WorkoutLogger
        profile={profile}
        goalId={goal.id}
        onFinish={handleFinish}
        onCancel={() => setLogging(false)}
      />
    );
  }

  return (
    <>
      <div className="page-head">
        <div>
          <div className="eyebrow">Fitness</div>
          <h1 className="page-title">{goal.name}</h1>
          <p className="page-sub">
            Log your sessions, track your lifts, and keep the streak going.
          </p>
        </div>
        {onArchiveGoal && goal.type !== "built-in" && (
          <button
            className="btn ghost sm"
            onClick={() => onArchiveGoal(goal.id)}
            title="Archive this goal"
            style={{ flex: "none" }}
          >
            <Icon.Trash width={13} height={13} /> Archive
          </button>
        )}
      </div>

      {/* TOP: today's plan + weekly progress + streak */}
      <div className="fit-top">
        <div className="card fit-today-card">
          <div className="card-head">
            <div className="card-title"><Icon.Bolt /> Today's workout</div>
          </div>
          <p className="fit-today-sub">
            Ready when you are. Log a session freely, or build one exercise at a time.
          </p>
          <button className="btn primary fit-log-btn" onClick={() => setLogging(true)}>
            <Icon.Plus /> Log a workout
          </button>
        </div>

        <div className="card fit-stat-card">
          <div className="fit-stat-num">
            {weekCount}<span className="fit-stat-den">/{target}</span>
          </div>
          <div className="fit-stat-lbl">workouts this week</div>
          <div className="fit-week-dots" aria-hidden="true">
            {Array.from({ length: target }, (_, i) => (
              <span key={i} className={"fit-week-dot" + (i < weekCount ? " on" : "")} />
            ))}
          </div>
        </div>

        <div className="card fit-stat-card">
          <div className="fit-stat-num fit-streak">
            <Icon.Flame /> {streak}
          </div>
          <div className="fit-stat-lbl">
            week{streak === 1 ? "" : "s"} in a row
          </div>
        </div>
      </div>

      {/* MIDDLE: recent sessions */}
      <div className="fit-section-label"><Icon.Calendar /> Recent sessions</div>
      {recent.length === 0 ? (
        <div className="card fit-empty">
          No sessions yet. Your logged workouts will show up here, newest first.
        </div>
      ) : (
        <div className="stack" style={{ gap: 10 }}>
          {recent.map((w) => {
            const vol = workoutVolume(w);
            const exNames = (w.exercises || []).map((e) => e.name).join(", ");
            return (
              <div key={w.id} className="card fit-session">
                <div className="fit-session-head">
                  <span className="fit-session-date">{relDate(w.date)}</span>
                  <span className="fit-session-type">{w.type}</span>
                </div>
                <div className="fit-session-exs">{exNames || "No exercises"}</div>
                <div className="fit-session-meta">
                  <span>{fmtDuration(w.durationSec)}</span>
                  <span>·</span>
                  <span>
                    {(w.exercises || []).length}{" "}
                    {(w.exercises || []).length === 1 ? "exercise" : "exercises"}
                  </span>
                  {vol > 0 && (
                    <>
                      <span>·</span>
                      <span>{vol.toLocaleString()} {unit}</span>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* BOTTOM: personal records */}
      <div className="fit-section-label" style={{ marginTop: 22 }}>
        <Icon.Trophy /> Personal records
      </div>
      {prGroups.length === 0 ? (
        <div className="card fit-empty">
          Once you complete some weighted sets, your best lift per muscle group
          shows up here.
        </div>
      ) : (
        <div className="fit-pr-grid">
          {prGroups.map((g) => {
            const pr = prsByGroup[g];
            return (
              <div key={g} className="card fit-pr">
                <div className="fit-pr-group">{MUSCLE_LABEL[g] || g}</div>
                <div className="fit-pr-weight">
                  {pr.weight}<span className="fit-pr-unit">{unit}</span>
                </div>
                <div className="fit-pr-ex">
                  {pr.name}{pr.reps ? ` · ${pr.reps} reps` : ""}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}
