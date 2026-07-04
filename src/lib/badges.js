/* ============================================================
   Achievement badges — small, gentle milestones. Pure data +
   predicates (no React), so they can be evaluated anywhere.

   Each badge: { id, name, desc, icon, category, message, req }
     - icon     : a key into the shared Icon set
     - category : Consistency | Milestones | Recovery | Focus | Writing
     - message  : a warm personal line shown in the unlock celebration
     - req      : plain-language requirement (shown while locked)
     - earned(stats) → boolean

   The stats object is assembled by the app from existing persisted data,
   so badges need no new tracking of their own.

   Tone stays kind: badges celebrate showing up, never shame gaps.
   ============================================================ */

export const BADGE_CATEGORIES = [
  "Consistency",
  "Milestones",
  "Recovery",
  "Focus",
  "Writing",
  "Fitness",
];

export const BADGES = [
  // ---- Milestones -------------------------------------------------------
  {
    id: "trailblazer",
    name: "Trailblazer",
    desc: "Created your own goal.",
    icon: "Target",
    category: "Milestones",
    message: "You drew your own map. That first step is the hardest one.",
    req: "Create your own goal",
    earned: (s) => s.ownGoal,
  },
  {
    id: "finisher",
    name: "Finisher",
    desc: "Marked a goal complete.",
    icon: "Trophy",
    category: "Milestones",
    message: "You saw something all the way through. Savour it.",
    req: "Mark a goal complete",
    earned: (s) => s.goalDone,
  },
  {
    id: "first-win",
    name: "First win",
    desc: "Completed your first task.",
    icon: "Check",
    category: "Milestones",
    message: "One done. That's how every big thing starts.",
    req: "Complete your first task",
    earned: (s) => s.tasksDone >= 1,
  },
  {
    id: "on-a-roll",
    name: "On a roll",
    desc: "Completed 10 tasks.",
    icon: "Bolt",
    category: "Milestones",
    message: "Ten down. Momentum looks good on you.",
    req: "Complete 10 tasks",
    earned: (s) => s.tasksDone >= 10,
  },
  {
    id: "thirty-up",
    name: "Thirty up",
    desc: "A count-up reached 30 days.",
    icon: "Calendar",
    category: "Milestones",
    message: "Thirty days carried. That's something to be proud of.",
    req: "Reach 30 days on a count-up",
    earned: (s) => s.maxCountUp >= 30,
  },
  {
    id: "the-long-game",
    name: "The Long Game",
    desc: "Kept a goal going for 30+ days.",
    icon: "Calendar",
    category: "Milestones",
    message: "A month of staying with it. The slow way is still the way.",
    req: "Keep a goal active for 30 days",
    earned: (s) => (s.maxGoalAgeDays || 0) >= 30,
  },
  {
    id: "five-goals",
    name: "Five Goals",
    desc: "Created 5 or more goals.",
    icon: "Grid",
    category: "Milestones",
    message: "Five directions worth caring about. Look at all that intent.",
    req: "Create 5 goals",
    earned: (s) => (s.goalCount || 0) >= 5,
  },
  {
    id: "clean-slate",
    name: "Clean Slate",
    desc: "Completed every task for a day.",
    icon: "Check",
    category: "Milestones",
    message: "Everything checked off. Breathe. You earned the quiet.",
    req: "Finish all your tasks in a day",
    earned: (s) => s.allTasksClearedDay,
  },
  {
    id: "overachiever",
    name: "Overachiever",
    desc: "Completed more than 10 tasks in one day.",
    icon: "Bolt",
    category: "Milestones",
    message: "More than ten in a single day. What a sprint.",
    req: "Complete 11 tasks in one day",
    earned: (s) => (s.maxTasksOneDay || 0) > 10,
  },

  // ---- Consistency ------------------------------------------------------
  {
    id: "habit-former",
    name: "Habit former",
    desc: "Started tracking a habit.",
    icon: "Flame",
    category: "Consistency",
    message: "A small thing, returned to. That's where change lives.",
    req: "Start tracking a habit",
    earned: (s) => s.habitCount >= 1,
  },
  {
    id: "seven-days",
    name: "Seven days",
    desc: "Kept a habit going 7 days.",
    icon: "Star",
    category: "Consistency",
    message: "Seven days in a row. You've been showing up.",
    req: "Keep a habit streak for 7 days",
    earned: (s) => s.maxStreak >= 7,
  },
  {
    id: "showing-up",
    name: "Showing up",
    desc: "Used Ligand on 7 different days.",
    icon: "Heart",
    category: "Consistency",
    message: "Seven days of coming back. Presence is the whole thing.",
    req: "Open Ligand on 7 different days",
    earned: (s) => s.visitDays >= 7,
  },
  {
    id: "daily-ritual",
    name: "Daily Ritual",
    desc: "Opened the app 7 days in a row.",
    icon: "Calendar",
    category: "Consistency",
    message: "A week unbroken. This has become a ritual.",
    req: "Open the app 7 days in a row",
    earned: (s) => (s.maxVisitStreak || 0) >= 7,
  },
  {
    id: "early-bird",
    name: "Early Bird",
    desc: "Checked in before 7am.",
    icon: "Sun",
    category: "Consistency",
    message: "Up with the quiet hours. A gentle, early start.",
    req: "Write or check in before 7am",
    earned: (s) => s.entryBefore7am,
  },
  {
    id: "streak-saver",
    name: "Streak Saver",
    desc: "Came back after a 3+ day gap.",
    icon: "Reset",
    category: "Consistency",
    message: "You came back. The comeback always counts more than the gap.",
    req: "Check in again after a 3+ day gap",
    earned: (s) => s.habitComeback,
  },
  {
    id: "polymath",
    name: "Polymath",
    desc: "Active habits across 3+ goals.",
    icon: "Spark",
    category: "Consistency",
    message: "Growing on several fronts at once. Beautifully broad.",
    req: "Track habits in 3 different goals",
    earned: (s) => (s.habitGoalCount || 0) >= 3,
  },

  // ---- Focus ------------------------------------------------------------
  {
    id: "deep-focus",
    name: "Deep focus",
    desc: "Completed 10 focus sessions.",
    icon: "Timer",
    category: "Focus",
    message: "Ten blocks of real focus. That's deep work.",
    req: "Complete 10 focus sessions",
    earned: (s) => (s.focusSessions || 0) >= 10,
  },
  {
    id: "marathon",
    name: "Marathon",
    desc: "Completed 10 Pomodoro sessions total.",
    icon: "Timer",
    category: "Focus",
    message: "Ten Pomodoros in the bank. Endurance, one round at a time.",
    req: "Complete 10 Pomodoro sessions",
    earned: (s) => (s.focusSessions || 0) >= 10,
  },

  // ---- Writing ----------------------------------------------------------
  {
    id: "first-reflection",
    name: "First reflection",
    desc: "Wrote your first journal entry.",
    icon: "Book",
    category: "Writing",
    message: "You put it into words. That takes a kind of courage.",
    req: "Write your first journal entry",
    earned: (s) => s.reflectionCount >= 1,
  },
  {
    id: "reflective",
    name: "Reflective",
    desc: "Wrote 7 reflections.",
    icon: "Spark",
    category: "Writing",
    message: "Seven reflections. You keep checking in with yourself.",
    req: "Write 7 reflections",
    earned: (s) => s.reflectionCount >= 7,
  },
  {
    id: "night-owl",
    name: "Night Owl",
    desc: "Wrote a journal entry after 10pm.",
    icon: "Moon",
    category: "Writing",
    message: "Late-night thoughts, captured. The quiet hours are yours.",
    req: "Write a journal entry after 10pm",
    earned: (s) => s.entryAfter10pm,
  },
  {
    id: "depth-charge",
    name: "Depth Charge",
    desc: "Wrote an entry over 200 words.",
    icon: "Book",
    category: "Writing",
    message: "Over two hundred words. You really went there, and that's good.",
    req: "Write a 200-word entry",
    earned: (s) => s.longEntry,
  },

  // ---- Recovery ---------------------------------------------------------
  {
    id: "reset-rise",
    name: "Reset & Rise",
    desc: "Started a fresh recovery streak.",
    icon: "Leaf",
    category: "Recovery",
    message: "You started again. Resilience isn't never falling. It's rising.",
    req: "Reset a recovery streak and begin again",
    earned: (s) => s.recoveryReset,
  },

  // ---- Fitness ----------------------------------------------------------
  {
    id: "first-rep",
    name: "First Rep",
    desc: "Logged your first workout.",
    icon: "Dumbbell",
    category: "Fitness",
    message: "The first session is on the board. Everything builds from here.",
    req: "Log your first workout",
    earned: (s) => (s.workoutCount || 0) >= 1,
  },
  {
    id: "consistent",
    name: "Consistent",
    desc: "Three workouts in one week.",
    icon: "Flame",
    category: "Fitness",
    message: "Three in a week. That's the rhythm that changes things.",
    req: "Log 3 workouts in a single week",
    earned: (s) => (s.maxWorkoutsInWeek || 0) >= 3,
  },
  {
    id: "iron-will",
    name: "Iron Will",
    desc: "Logged 30 workouts.",
    icon: "Trophy",
    category: "Fitness",
    message: "Thirty sessions in. That's not luck. That's will.",
    req: "Log 30 workouts total",
    earned: (s) => (s.workoutCount || 0) >= 30,
  },
  {
    id: "pr-breaker",
    name: "PR Breaker",
    desc: "Beat a personal record.",
    icon: "Bolt",
    category: "Fitness",
    message: "You beat your old best. Proof you're getting stronger.",
    req: "Beat a personal record on any lift",
    earned: (s) => s.beatPR,
  },
  {
    id: "comeback",
    name: "Comeback",
    desc: "Worked out after a 2+ week break.",
    icon: "Reset",
    category: "Fitness",
    message: "Back under the bar after time away. The return is the win.",
    req: "Log a workout after a 2+ week gap",
    earned: (s) => s.comebackWorkout,
  },
  {
    id: "volume-king",
    name: "Volume King",
    desc: "Lifted over 10,000 lbs in a session.",
    icon: "Star",
    category: "Fitness",
    message: "Over five tons moved in one session. Enormous work.",
    req: "Lift 10,000 lbs of total volume in one session",
    earned: (s) => (s.maxSessionVolumeLbs || 0) > 10000,
  },
  {
    id: "streak-builder",
    name: "Streak Builder",
    desc: "Four straight weeks with a workout.",
    icon: "Calendar",
    category: "Fitness",
    message: "Four weeks, unbroken. Consistency is quietly compounding.",
    req: "Work out at least once a week for 4 weeks running",
    earned: (s) => (s.workoutWeekStreak || 0) >= 4,
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
