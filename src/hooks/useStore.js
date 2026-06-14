import { useCallback, useMemo } from "react";
import { useLocalStorage } from "./useLocalStorage.js";
import { ding } from "../lib/uiSounds.js";
import {
  seedData,
  createGoal,
  createTask,
  createHabit,
  createReflection,
  createCountUp,
  shiftDay,
  todayKey,
  toggleCheckIn,
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
    (id) =>
      setData((d) => ({
        ...d,
        goals: d.goals.filter((g) => g.id !== id),
        tasks: d.tasks.filter((t) => t.goalId !== id),
      })),
    [setData]
  );

  // -- tasks -----------------------------------------------------
  const addTask = useCallback(
    (opts) => {
      const task = createTask(opts);
      setData((d) => ({ ...d, tasks: [...d.tasks, task] }));
      return task;
    },
    [setData]
  );

  const updateTask = useCallback(
    (id, patch) =>
      setData((d) => ({
        ...d,
        tasks: d.tasks.map((t) => (t.id === id ? { ...t, ...patch } : t)),
      })),
    [setData]
  );

  const toggleTask = useCallback(
    (id) =>
      setData((d) => {
        const next = d.tasks.map((t) => (t.id === id ? { ...t, done: !t.done } : t));
        // Ding when a task is freshly completed (not un-completed)
        const wasUndone = d.tasks.find((t) => t.id === id && !t.done);
        if (wasUndone) ding();
        return { ...d, tasks: next };
      }),
    [setData]
  );

  const removeTask = useCallback(
    (id) =>
      setData((d) => ({ ...d, tasks: d.tasks.filter((t) => t.id !== id) })),
    [setData]
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
  const checkInHabit = useCallback(
    (goalId, habitId, dayKey) =>
      setData((d) => ({
        ...d,
        goals: d.goals.map((g) =>
          g.id !== goalId
            ? g
            : {
                ...g,
                habits: g.habits.map((h) =>
                  h.id === habitId ? toggleCheckIn(h, dayKey) : h
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

  // -- escape hatch / reset --------------------------------------
  const resetData = useCallback(() => setData(seedData()), [setData]);

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
      removeHabit,
      addReflection,
      removeReflection,
      addJournalEntry,
      removeJournalEntry,
      addCountUp,
      updateCountUp,
      removeCountUp,
      resetData,
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
      removeHabit,
      addReflection,
      removeReflection,
      addJournalEntry,
      removeJournalEntry,
      addCountUp,
      updateCountUp,
      removeCountUp,
      resetData,
    ]
  );

  return {
    data,
    goals: data.goals,
    tasks: data.tasks,
    countUps: data.countUps,
    journal: data.journal || [],
    ...actions,
  };
}

export default useStore;
