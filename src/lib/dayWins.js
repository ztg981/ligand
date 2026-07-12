/* dayWins — sum up what actually happened today, for the evening wind-down.

   Sunsama's best idea: end the day by SEEING what you did, not what's left.
   This collects only real recorded facts (completed tasks, habit check-ins,
   focus minutes, workouts, journal entries) — it never guesses and never
   shames. Zero wins is still a valid day; the widget words it gently. */

/** Collect today's wins from store slices. Pure; pass todayStr for tests. */
export function collectDayWins(
  { tasks = [], goals = [], focusLog = [], workouts = [], journal = [] } = {},
  todayStr
) {
  const tasksDone = tasks.filter(
    (t) => t.done && t.completedOn === todayStr
  ).length;

  let habitsChecked = 0;
  let habitsTotal = 0;
  for (const g of goals) {
    for (const h of g.habits || []) {
      habitsTotal++;
      if (h.checkIns?.includes(todayStr)) habitsChecked++;
    }
  }

  const focusMin = focusLog
    .filter((f) => f.date === todayStr)
    .reduce((n, f) => n + (f.minutes || 0), 0);

  const workoutsDone = workouts.filter((w) => w.date === todayStr).length;

  const journaled = journal.some((e) => {
    const ts = e?.createdAt || e?.date;
    if (!ts) return false;
    const d = new Date(ts);
    if (Number.isNaN(d.getTime())) return false;
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    return key === todayStr;
  });

  return { tasksDone, habitsChecked, habitsTotal, focusMin, workoutsDone, journaled };
}

/** Turn wins into display lines: [{ id, text }] — only for things that
 *  actually happened. Empty array = quiet day (the widget words that itself). */
export function winLines(wins) {
  const out = [];
  if (wins.tasksDone > 0)
    out.push({
      id: "tasks",
      text: `Cleared ${wins.tasksDone} task${wins.tasksDone === 1 ? "" : "s"}`,
    });
  if (wins.habitsChecked > 0)
    out.push({
      id: "habits",
      text: `Checked ${wins.habitsChecked} of ${wins.habitsTotal} habits`,
    });
  if (wins.focusMin > 0)
    out.push({ id: "focus", text: `Focused for ${wins.focusMin} min` });
  if (wins.workoutsDone > 0)
    out.push({
      id: "workout",
      text: wins.workoutsDone === 1 ? "Finished a workout" : `Finished ${wins.workoutsDone} workouts`,
    });
  if (wins.journaled) out.push({ id: "journal", text: "Wrote in your journal" });
  return out;
}
