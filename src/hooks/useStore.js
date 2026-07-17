import { useCallback, useEffect, useMemo } from "react";
import { useLocalStorage } from "./useLocalStorage.js";
import { taskDone, habitDone } from "../lib/uiSounds.js";
import { queueTaskDelete, queueTaskUpsert } from "../lib/taskRecordSync.js";
import {
  seedData,
  createGoal,
  createTask,
  createHabit,
  createReflection,
  createCountUp,
  createNote,
  createAlarm,
  createWorkout,
  createWorkoutTemplate,
  createScheduledWorkout,
  createFitnessProfile,
  createMeal,
  createDayBlock,
  createActivity,
  createSong,
  shiftDay,
  todayKey,
  toggleCheckIn,
  recurringResetDue,
} from "../lib/model.js";

const STORAGE_KEY = "ligand.data";

/* ============================================================
   useStore — the single source of truth for app data.

   Holds { goals, tasks, countUps } in one localStorage key and
   exposes immutable CRUD actions. Later build steps (Tasks tab,
   Productivity tab, Journal, etc.) consume this instead of
   touching localStorage directly.
   ============================================================ */
export function useStore() {
  const [data, setData] = useLocalStorage(STORAGE_KEY, seedData);

  // Recurring tasks: on load (and when the tab regains focus, e.g. across a
  // day boundary) reset any whose next occurrence has arrived back to not-done.
  // The updater returns the same object when nothing changed, so this is inert
  // (no re-render, no sync echo) on the common path.
  useEffect(() => {
    const runReset = () => {
      const due = (data.tasks || []).filter((task) => recurringResetDue(task));
      if (!due.length) return;
      due.forEach((task) => queueTaskUpsert(task.id, task.version));
      const updatedAt = new Date().toISOString();
      setData((d) => ({
        ...d,
        tasks: d.tasks.map((t) =>
          recurringResetDue(t)
            ? { ...t, done: false, completedOn: null, updatedAt }
            : t
        ),
      }));
    };
    runReset();
    window.addEventListener("focus", runReset);
    return () => window.removeEventListener("focus", runReset);
  }, [data.tasks, setData]);

  // -- goals -----------------------------------------------------
  const addGoal = useCallback(
    (opts) => {
      const { starterHabits = [], ...goalOpts } = opts || {};
      const goal = {
        ...createGoal(goalOpts),
        habits: starterHabits
          .map((name) => name.trim())
          .filter(Boolean)
          .slice(0, 3)
          .map((name) => createHabit({ name })),
      };
      setData((d) => ({ ...d, goals: [...d.goals, goal] }));
      return goal;
    },
    [setData]
  );

  const updateGoal = useCallback(
    (id, patch) =>
      setData((d) => ({
        ...d,
        goals: d.goals.map((g) => (g.id === id ? { ...g, ...patch } : g)),
      })),
    [setData]
  );

  const snoozeGoalReview = useCallback(
    (id, days = 7) =>
      setData((d) => ({
        ...d,
        goals: d.goals.map((g) =>
          g.id === id ? { ...g, overdueSnoozedUntil: shiftDay(todayKey(), days) } : g
        ),
      })),
    [setData]
  );

  const reviseGoalTargetDate = useCallback(
    (id, targetDate) =>
      setData((d) => ({
        ...d,
        goals: d.goals.map((g) =>
          g.id === id
            ? {
                ...g,
                deadline: targetDate || null,
                overdueSnoozedUntil: null,
                smartFields: {
                  ...(g.smartFields || {}),
                  timeBound: targetDate || "",
                },
              }
            : g
        ),
      })),
    [setData]
  );

  // Soft-delete: move a goal to the archive (recycle bin). Reversible.
  const archiveGoal = useCallback(
    (id) =>
      setData((d) => ({
        ...d,
        goals: d.goals.map((g) =>
          g.id === id ? { ...g, status: "archived" } : g
        ),
      })),
    [setData]
  );

  // Bring a goal back from the archive.
  const restoreGoal = useCallback(
    (id) =>
      setData((d) => ({
        ...d,
        goals: d.goals.map((g) =>
          g.id === id ? { ...g, status: "active" } : g
        ),
      })),
    [setData]
  );

  // Permanent delete (used from the archive). Also drops the goal's tasks;
  // its habits live inside the goal object, so they go with it.
  const removeGoal = useCallback(
    (id) => {
      data.tasks
        .filter((task) => task.goalId === id)
        .forEach((task) => queueTaskDelete(task.id, task.version));
      setData((d) => ({
        ...d,
        goals: d.goals.filter((g) => g.id !== id),
        tasks: d.tasks.filter((t) => t.goalId !== id),
      }));
    },
    [data.tasks, setData]
  );

  // -- tasks -----------------------------------------------------
  const addTask = useCallback(
    (opts) => {
      const task = createTask(opts);
      queueTaskUpsert(task.id, task.version);
      setData((d) => ({ ...d, tasks: [...d.tasks, task] }));
      return task;
    },
    [setData]
  );

  const updateTask = useCallback(
    (id, patch) => {
      const task = data.tasks.find((candidate) => candidate.id === id);
      if (task) queueTaskUpsert(id, task.version);
      setData((d) => ({
        ...d,
        tasks: d.tasks.map((t) =>
          t.id === id ? { ...t, ...patch, updatedAt: new Date().toISOString() } : t
        ),
      }));
    },
    [data.tasks, setData]
  );

  const toggleTask = useCallback(
    (id) => {
      // Ding when a task is freshly completed (not un-completed). Decided from
      // the current snapshot and fired OUTSIDE the updater — state updaters must
      // stay pure (StrictMode invokes them twice, which double-fired the sound).
      const wasUndone = data.tasks.some((t) => t.id === id && !t.done);
      if (wasUndone) taskDone();
      const task = data.tasks.find((candidate) => candidate.id === id);
      if (task) queueTaskUpsert(id, task.version);
      const updatedAt = new Date().toISOString();
      setData((d) => ({
        ...d,
        tasks: d.tasks.map((t) =>
          t.id === id
            ? {
                ...t,
                done: !t.done,
                // Record when a recurring task was completed so it can reset on
                // its next occurrence; clear it when un-completing.
                completedOn: !t.done ? todayKey() : null,
                updatedAt,
              }
            : t
        ),
      }));
    },
    [data.tasks, setData]
  );

  const removeTask = useCallback(
    (id) => {
      const task = data.tasks.find((candidate) => candidate.id === id);
      if (task) queueTaskDelete(id, task.version);
      setData((d) => ({ ...d, tasks: d.tasks.filter((t) => t.id !== id) }));
    },
    [data.tasks, setData]
  );

  // -- habits (live inside a goal) -------------------------------
  const addHabit = useCallback(
    (goalId, opts) => {
      const habit = createHabit(opts);
      setData((d) => ({
        ...d,
        goals: d.goals.map((g) =>
          g.id === goalId ? { ...g, habits: [...g.habits, habit] } : g
        ),
      }));
      return habit;
    },
    [setData]
  );

  // Forgiving check-in: toggles a day on/off, never records a miss.
  // Ding only when a day is freshly checked ON (not when correcting it off).
  const checkInHabit = useCallback(
    (goalId, habitId, dayKey) => {
      // Ding only when a day is freshly checked ON. Decided from the current
      // snapshot and fired OUTSIDE the updater — keeping the updater pure avoids
      // the double-fire StrictMode caused by calling ding() inside it.
      const habit = data.goals
        .find((g) => g.id === goalId)
        ?.habits.find((h) => h.id === habitId);
      const turnedOn = habit ? !habit.checkIns?.includes(dayKey) : false;
      if (turnedOn) habitDone();
      setData((d) => ({
        ...d,
        goals: d.goals.map((g) =>
          g.id !== goalId
            ? g
            : {
                ...g,
                habits: g.habits.map((h) =>
                  h.id !== habitId ? h : toggleCheckIn(h, dayKey)
                ),
              }
        ),
      }));
    },
    [data.goals, setData]
  );

  // Edit a habit in place (e.g. rename). The patch is shallow-merged, so the
  // name change shows up everywhere the habit is read (goal tab, Overview).
  const updateHabit = useCallback(
    (goalId, habitId, patch) =>
      setData((d) => ({
        ...d,
        goals: d.goals.map((g) =>
          g.id !== goalId
            ? g
            : {
                ...g,
                habits: g.habits.map((h) =>
                  h.id !== habitId ? h : { ...h, ...patch }
                ),
              }
        ),
      })),
    [setData]
  );

  const removeHabit = useCallback(
    (goalId, habitId) =>
      setData((d) => ({
        ...d,
        goals: d.goals.map((g) =>
          g.id !== goalId
            ? g
            : { ...g, habits: g.habits.filter((h) => h.id !== habitId) }
        ),
      })),
    [setData]
  );

  // -- reflections (live inside a goal) --------------------------
  const addReflection = useCallback(
    (goalId, opts) => {
      const reflection = createReflection(opts);
      setData((d) => ({
        ...d,
        goals: d.goals.map((g) =>
          g.id === goalId
            ? { ...g, reflections: [reflection, ...g.reflections] }
            : g
        ),
      }));
      return reflection;
    },
    [setData]
  );

  // -- journal (app-wide reflections) ----------------------------
  const addJournalEntry = useCallback(
    (opts) => {
      const entry = createReflection(opts);
      setData((d) => ({ ...d, journal: [entry, ...(d.journal || [])] }));
      return entry;
    },
    [setData]
  );

  const removeJournalEntry = useCallback(
    (id) =>
      setData((d) => ({
        ...d,
        journal: (d.journal || []).filter((e) => e.id !== id),
      })),
    [setData]
  );

  // -- song log (lightweight "what I was listening to" log) ------
  const addSong = useCallback(
    (opts) => {
      const song = createSong(opts);
      setData((d) => ({ ...d, songLog: [song, ...(d.songLog || [])] }));
      return song;
    },
    [setData]
  );

  const updateSong = useCallback(
    (id, patch) =>
      setData((d) => ({
        ...d,
        songLog: (d.songLog || []).map((s) => (s.id === id ? { ...s, ...patch } : s)),
      })),
    [setData]
  );

  const deleteSong = useCallback(
    (id) =>
      setData((d) => ({
        ...d,
        songLog: (d.songLog || []).filter((s) => s.id !== id),
      })),
    [setData]
  );

  const removeReflection = useCallback(
    (goalId, reflectionId) =>
      setData((d) => ({
        ...d,
        goals: d.goals.map((g) =>
          g.id !== goalId
            ? g
            : { ...g, reflections: g.reflections.filter((r) => r.id !== reflectionId) }
        ),
      })),
    [setData]
  );

  // -- count-ups (app-wide "what I'm proud of" trackers) ---------
  const addCountUp = useCallback(
    (opts) => {
      const countUp = createCountUp(opts);
      setData((d) => ({ ...d, countUps: [...(d.countUps || []), countUp] }));
      return countUp;
    },
    [setData]
  );

  const updateCountUp = useCallback(
    (id, patch) =>
      setData((d) => ({
        ...d,
        countUps: (d.countUps || []).map((c) => (c.id === id ? { ...c, ...patch } : c)),
      })),
    [setData]
  );

  const removeCountUp = useCallback(
    (id) =>
      setData((d) => ({
        ...d,
        countUps: (d.countUps || []).filter((c) => c.id !== id),
      })),
    [setData]
  );

  // -- notes (frictionless plain-text scratchpad) ----------------
  // New notes are prepended; the Notes tab sorts by updatedAt so an edited
  // note floats to the top. updatedAt advances on every text change.
  const addNote = useCallback(
    (opts) => {
      const note = createNote(opts);
      setData((d) => ({ ...d, notes: [note, ...(d.notes || [])] }));
      return note;
    },
    [setData]
  );

  const updateNote = useCallback(
    (id, patch) =>
      setData((d) => ({
        ...d,
        notes: (d.notes || []).map((n) =>
          n.id === id ? { ...n, ...patch, updatedAt: new Date().toISOString() } : n
        ),
      })),
    [setData]
  );

  const removeNote = useCallback(
    (id) =>
      setData((d) => ({
        ...d,
        notes: (d.notes || []).filter((n) => n.id !== id),
      })),
    [setData]
  );

  // -- alarms (photo-scan alarms) --------------------------------
  const addAlarm = useCallback(
    (opts) => {
      const alarm = createAlarm(opts);
      setData((d) => ({ ...d, alarms: [alarm, ...(d.alarms || [])] }));
      return alarm;
    },
    [setData]
  );
  const updateAlarm = useCallback(
    (id, patch) =>
      setData((d) => ({
        ...d,
        alarms: (d.alarms || []).map((a) => (a.id === id ? { ...a, ...patch } : a)),
      })),
    [setData]
  );
  const removeAlarm = useCallback(
    (id) =>
      setData((d) => ({ ...d, alarms: (d.alarms || []).filter((a) => a.id !== id) })),
    [setData]
  );

  // -- workouts (logged sessions) --------------------------------
  // A completed session can be passed pre-built (from the logger) or by opts.
  const addWorkout = useCallback(
    (workoutOrOpts) => {
      const workout =
        workoutOrOpts && workoutOrOpts.id
          ? workoutOrOpts
          : createWorkout(workoutOrOpts);
      setData((d) => ({ ...d, workouts: [workout, ...(d.workouts || [])] }));
      return workout;
    },
    [setData]
  );

  const updateWorkout = useCallback(
    (id, patch) =>
      setData((d) => ({
        ...d,
        workouts: (d.workouts || []).map((w) =>
          w.id === id ? { ...w, ...patch } : w
        ),
      })),
    [setData]
  );

  const deleteWorkout = useCallback(
    (id) =>
      setData((d) => ({
        ...d,
        workouts: (d.workouts || []).filter((w) => w.id !== id),
      })),
    [setData]
  );

  // -- workout templates (saved routines) ------------------------
  const addTemplate = useCallback(
    (tmplOrOpts) => {
      const tmpl =
        tmplOrOpts && tmplOrOpts.id ? tmplOrOpts : createWorkoutTemplate(tmplOrOpts);
      setData((d) => ({
        ...d,
        workoutTemplates: [...(d.workoutTemplates || []), tmpl],
      }));
      return tmpl;
    },
    [setData]
  );

  const updateTemplate = useCallback(
    (id, patch) =>
      setData((d) => ({
        ...d,
        workoutTemplates: (d.workoutTemplates || []).map((t) =>
          t.id === id ? { ...t, ...patch } : t
        ),
      })),
    [setData]
  );

  const deleteTemplate = useCallback(
    (id) =>
      setData((d) => ({
        ...d,
        workoutTemplates: (d.workoutTemplates || []).filter((t) => t.id !== id),
      })),
    [setData]
  );

  // -- scheduled workouts (dated planned instances) ---------------
  const addScheduledWorkout = useCallback(
    (schedOrOpts) => {
      const sched =
        schedOrOpts && schedOrOpts.id
          ? schedOrOpts
          : createScheduledWorkout(schedOrOpts);
      setData((d) => ({
        ...d,
        scheduledWorkouts: [...(d.scheduledWorkouts || []), sched],
      }));
      return sched;
    },
    [setData]
  );

  const updateScheduledWorkout = useCallback(
    (id, patch) =>
      setData((d) => ({
        ...d,
        scheduledWorkouts: (d.scheduledWorkouts || []).map((s) =>
          s.id === id
            ? { ...s, ...patch, updatedAt: new Date().toISOString() }
            : s
        ),
      })),
    [setData]
  );

  const deleteScheduledWorkout = useCallback(
    (id) =>
      setData((d) => ({
        ...d,
        scheduledWorkouts: (d.scheduledWorkouts || []).filter((s) => s.id !== id),
      })),
    [setData]
  );

  // -- day blocks (timed day-dial planner) -------------------------
  const addDayBlock = useCallback(
    (opts) => {
      const block = opts && opts.id ? opts : createDayBlock(opts);
      setData((d) => ({ ...d, dayBlocks: [...(d.dayBlocks || []), block] }));
      return block;
    },
    [setData]
  );

  const updateDayBlock = useCallback(
    (id, patch) =>
      setData((d) => ({
        ...d,
        dayBlocks: (d.dayBlocks || []).map((b) =>
          b.id === id
            ? {
                ...b,
                ...patch,
                version: Math.max(1, Number(b.version) || 1) + 1,
                updatedAt: new Date().toISOString(),
              }
            : b
        ),
      })),
    [setData]
  );

  const deleteDayBlock = useCallback(
    (id) =>
      setData((d) => ({
        ...d,
        dayBlocks: (d.dayBlocks || []).filter((b) => b.id !== id),
      })),
    [setData]
  );

  // A repeating event materializes as one block per occurrence, all sharing
  // a seriesId — added atomically so a long series can't half-save.
  const addDayBlockSeries = useCallback(
    (blocks) => {
      setData((d) => ({ ...d, dayBlocks: [...(d.dayBlocks || []), ...blocks] }));
      return blocks;
    },
    [setData]
  );

  // "Delete all in the series." fromDate limits it to this-and-future so
  // past occurrences (already lived) stay in the record.
  const deleteDayBlockSeries = useCallback(
    (seriesId, fromDate = null) =>
      setData((d) => ({
        ...d,
        dayBlocks: (d.dayBlocks || []).filter(
          (b) =>
            b.seriesId !== seriesId || (fromDate != null && b.date < fromDate)
        ),
      })),
    [setData]
  );

  // -- activities (universal "what did I just do?" log) -----------
  const addActivity = useCallback(
    (opts) => {
      const activity = opts && opts.id ? opts : createActivity(opts);
      setData((d) => ({ ...d, activities: [activity, ...(d.activities || [])] }));
      return activity;
    },
    [setData]
  );

  const updateActivity = useCallback(
    (id, patch) =>
      setData((d) => ({
        ...d,
        activities: (d.activities || []).map((a) =>
          a.id === id ? { ...a, ...patch } : a
        ),
      })),
    [setData]
  );

  // Deleting an activity also deletes the workout it mirrors (a sport logged
  // "as a workout") — that record only exists as the activity's shadow, and
  // leaving it behind would resurface the same session in day views.
  const removeActivity = useCallback(
    (id) =>
      setData((d) => {
        const target = (d.activities || []).find((a) => a.id === id);
        const linkedWorkoutId =
          target?.linkType === "workout" ? target.linkId : null;
        return {
          ...d,
          activities: (d.activities || []).filter((a) => a.id !== id),
          workouts: linkedWorkoutId
            ? (d.workouts || []).filter((w) => w.id !== linkedWorkoutId)
            : d.workouts,
        };
      }),
    [setData]
  );

  // -- meals + water (gentle nutrition log) -----------------------
  const addMeal = useCallback(
    (opts) => {
      const meal = opts && opts.id ? opts : createMeal(opts);
      setData((d) => ({ ...d, meals: [...(d.meals || []), meal] }));
      return meal;
    },
    [setData]
  );

  const removeMeal = useCallback(
    (id) =>
      setData((d) => ({
        ...d,
        meals: (d.meals || []).filter((m) => m.id !== id),
      })),
    [setData]
  );

  // Glasses of water for a given day. Delta-based on purpose: rapid +/+/+
  // taps land as three atomic updates instead of racing a stale absolute
  // count. Clamped so a stuck button can't run away.
  const addWater = useCallback(
    (date, delta) =>
      setData((d) => {
        const cur = (d.waterLog || {})[date] || 0;
        return {
          ...d,
          waterLog: {
            ...(d.waterLog || {}),
            [date]: Math.max(0, Math.min(24, cur + delta)),
          },
        };
      }),
    [setData]
  );

  // -- fitness profile (one per app) -----------------------------
  // Shallow-merges a patch onto the existing profile, creating a default one
  // first if none exists yet (so onboarding steps can patch incrementally).
  const updateFitnessProfile = useCallback(
    (patch) =>
      setData((d) => ({
        ...d,
        fitnessProfile: { ...(d.fitnessProfile || createFitnessProfile()), ...patch },
      })),
    [setData]
  );

  // -- escape hatch / reset --------------------------------------
  const resetData = useCallback(() => {
    data.tasks.forEach((task) => queueTaskDelete(task.id, task.version));
    setData(seedData());
  }, [data.tasks, setData]);

  // -- goal order (display only, does not affect goal IDs/data) ---
  // goalOrder is an array of goal IDs in the desired display order.
  // If absent or incomplete (old users), the natural goals array order
  // is used as the default — no migration needed.
  const setGoalOrder = useCallback(
    (ids) =>
      setData((d) => ({ ...d, goalOrder: ids })),
    [setData]
  );

  // -- focus log (Pomodoro time tracking) ------------------------
  // Each entry: { date: "YYYY-MM-DD", minutes, goalId|null }. Sessions not
  // linked to a goal are still logged (goalId null) but count toward no goal.
  const logFocusSession = useCallback(
    ({ minutes, goalId = null, date = null }) => {
      if (!minutes || minutes <= 0) return;
      setData((d) => ({
        ...d,
        focusLog: [
          ...(d.focusLog || []),
          { date: date || todayKey(), minutes, goalId },
        ],
      }));
    },
    [setData]
  );

  // Pomodoro pause tracking: how long the timer sat stopped, per day.
  // Separate from focusLog so focus totals stay honest.
  const logPause = useCallback(
    ({ seconds }) => {
      if (!seconds || seconds < 5) return; // ignore sub-5s fumbles
      setData((d) => ({
        ...d,
        pauseLog: [...(d.pauseLog || []), { date: todayKey(), seconds: Math.round(seconds) }],
      }));
    },
    [setData]
  );

  const actions = useMemo(
    () => ({
      addGoal,
      updateGoal,
      snoozeGoalReview,
      reviseGoalTargetDate,
      archiveGoal,
      restoreGoal,
      removeGoal,
      addTask,
      updateTask,
      toggleTask,
      removeTask,
      addHabit,
      checkInHabit,
      updateHabit,
      removeHabit,
      addReflection,
      removeReflection,
      addJournalEntry,
      removeJournalEntry,
      addCountUp,
      updateCountUp,
      removeCountUp,
      addNote,
      updateNote,
      removeNote,
      addAlarm,
      updateAlarm,
      removeAlarm,
      addWorkout,
      updateWorkout,
      deleteWorkout,
      addTemplate,
      updateTemplate,
      deleteTemplate,
      addScheduledWorkout,
      updateScheduledWorkout,
      deleteScheduledWorkout,
      addMeal,
      removeMeal,
      addWater,
      addDayBlock,
      updateDayBlock,
      deleteDayBlock,
      addDayBlockSeries,
      deleteDayBlockSeries,
      addActivity,
      updateActivity,
      removeActivity,
      updateFitnessProfile,
      addSong,
      updateSong,
      deleteSong,
      resetData,
      setGoalOrder,
      logFocusSession,
      logPause,
    }),
    [
      addGoal,
      updateGoal,
      snoozeGoalReview,
      reviseGoalTargetDate,
      archiveGoal,
      restoreGoal,
      removeGoal,
      addTask,
      updateTask,
      toggleTask,
      removeTask,
      addHabit,
      checkInHabit,
      updateHabit,
      removeHabit,
      addReflection,
      removeReflection,
      addJournalEntry,
      removeJournalEntry,
      addCountUp,
      updateCountUp,
      removeCountUp,
      addNote,
      updateNote,
      removeNote,
      addAlarm,
      updateAlarm,
      removeAlarm,
      addWorkout,
      updateWorkout,
      deleteWorkout,
      addTemplate,
      updateTemplate,
      deleteTemplate,
      addScheduledWorkout,
      updateScheduledWorkout,
      deleteScheduledWorkout,
      addMeal,
      removeMeal,
      addWater,
      addDayBlock,
      updateDayBlock,
      deleteDayBlock,
      addDayBlockSeries,
      deleteDayBlockSeries,
      addActivity,
      updateActivity,
      removeActivity,
      updateFitnessProfile,
      addSong,
      updateSong,
      deleteSong,
      resetData,
      setGoalOrder,
      logFocusSession,
      logPause,
    ]
  );

  return {
    data,
    goals: data.goals,
    tasks: data.tasks,
    countUps: data.countUps,
    journal: data.journal || [],
    notes: data.notes || [],
    alarms: data.alarms || [],
    focusLog: data.focusLog || [],
    workouts: data.workouts || [],
    workoutTemplates: data.workoutTemplates || [],
    scheduledWorkouts: data.scheduledWorkouts || [],
    fitnessProfile: data.fitnessProfile || null,
    meals: data.meals || [],
    waterLog: data.waterLog || {},
    dayBlocks: data.dayBlocks || [],
    pauseLog: data.pauseLog || [],
    activities: data.activities || [],
    songLog: data.songLog || [],
    ...actions,
  };
}

export default useStore;
