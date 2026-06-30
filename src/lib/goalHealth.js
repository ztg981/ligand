import { todayKey, isGoalOverdue, daysBetween } from "./model.js";

/* Shared goal-health logic so the Overview cards and the desktop goal sidebar
   always agree on a goal's status. Health is gentle: a "red" never shames, it
   just means "this could use a look." */

// When did this goal last show any activity? Looks at habit check-ins, task
// completion/creation, and reflections. Returns a day-key or null.
export function lastActivityKey(goal, tasks = []) {
  let latest = null;
  const bump = (key) => {
    if (key && (!latest || key > latest)) latest = key;
  };
  (goal.habits || []).forEach((h) =>
    (h.checkIns || []).forEach((d) => bump(d))
  );
  (goal.reflections || []).forEach((r) => {
    if (r.createdAt) bump(r.createdAt.slice(0, 10));
  });
  tasks
    .filter((t) => t.goalId === goal.id)
    .forEach((t) => {
      if (t.completedOn) bump(t.completedOn);
      if (t.createdAt) bump(t.createdAt);
    });
  return latest;
}

// Health: green (on track), amber (behind), red (overdue / quiet 7+ days).
export function goalHealth(goal, tasks = [], today = todayKey()) {
  if (isGoalOverdue(goal)) return { level: "red", label: "Needs a look" };
  // Recovery goals are inherently "active" — staying present is the win.
  if (goal.type === "recovery") return { level: "green", label: "On track" };
  const last = lastActivityKey(goal, tasks);
  if (!last) return { level: "amber", label: "Not started" };
  const gap = daysBetween(last, today);
  if (gap <= 2) return { level: "green", label: "On track" };
  if (gap <= 6) return { level: "amber", label: "Slowing down" };
  return { level: "red", label: "Quiet lately" };
}
