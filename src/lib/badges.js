/* ============================================================
   Achievement badges — small, gentle milestones. Pure data +
   predicates (no React), so they can be evaluated anywhere.

   Each badge: { id, name, desc, icon } where `icon` is a key into
   the shared Icon set, plus earned(stats) → boolean. The stats
   object is assembled by the app from existing persisted data, so
   badges need no new tracking of their own.

   Tone stays kind: badges celebrate showing up, never shame gaps.
   ============================================================ */

export const BADGES = [
  {
    id: "trailblazer",
    name: "Trailblazer",
    desc: "Created your own goal.",
    icon: "Target",
    earned: (s) => s.ownGoal,
  },
  {
    id: "finisher",
    name: "Finisher",
    desc: "Marked a goal complete.",
    icon: "Trophy",
    earned: (s) => s.goalDone,
  },
  {
    id: "first-win",
    name: "First win",
    desc: "Completed your first task.",
    icon: "Check",
    earned: (s) => s.tasksDone >= 1,
  },
  {
    id: "on-a-roll",
    name: "On a roll",
    desc: "Completed 10 tasks.",
    icon: "Bolt",
    earned: (s) => s.tasksDone >= 10,
  },
  {
    id: "habit-former",
    name: "Habit former",
    desc: "Started tracking a habit.",
    icon: "Flame",
    earned: (s) => s.habitCount >= 1,
  },
  {
    id: "seven-days",
    name: "Seven days",
    desc: "Kept a habit going 7 days.",
    icon: "Star",
    earned: (s) => s.maxStreak >= 7,
  },
  {
    id: "first-reflection",
    name: "First reflection",
    desc: "Wrote your first journal entry.",
    icon: "Book",
    earned: (s) => s.reflectionCount >= 1,
  },
  {
    id: "reflective",
    name: "Reflective",
    desc: "Wrote 7 reflections.",
    icon: "Spark",
    earned: (s) => s.reflectionCount >= 7,
  },
  {
    id: "thirty-up",
    name: "Thirty up",
    desc: "A count-up reached 30 days.",
    icon: "Calendar",
    earned: (s) => s.maxCountUp >= 30,
  },
  {
    id: "deep-focus",
    name: "Deep focus",
    desc: "Completed 10 focus sessions.",
    icon: "Timer",
    earned: (s) => (s.focusSessions || 0) >= 10,
  },
  {
    id: "showing-up",
    name: "Showing up",
    desc: "Used Ligand on 7 different days.",
    icon: "Heart",
    earned: (s) => s.visitDays >= 7,
  },
];

/** Ids of every badge currently earned for the given stats. */
export function earnedBadgeIds(stats) {
  if (!stats) return [];
  return BADGES.filter((b) => {
    try {
      return b.earned(stats);
    } catch {
      return false;
    }
  }).map((b) => b.id);
}
