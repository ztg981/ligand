/* ============================================================
   Placeholder "AI" helpers
   ------------------------------------------------------------
   NO paid API is used. Each function returns a friendly, templated
   string built from local data. The function SIGNATURES are the
   contract: later we can swap the body of any one of these for a
   real model call (returning a Promise) without touching callers,
   as long as the inputs/outputs stay shaped the same.

   Tone rules for everything here: gentle, forgiving, ADHD-friendly.
   Never shame, never imply failure for a quiet day.
   ============================================================ */

// Deterministic pick so a message is stable within a day but varies day to day.
function pickByDay(arr, salt = 0) {
  const d = new Date();
  const seed = d.getFullYear() * 1000 + d.getMonth() * 50 + d.getDate() + salt;
  return arr[seed % arr.length];
}

/* Tone-flavored dashboard lines. The Assistant "tone" setting
   (warm | plain | cheerful) picks which voice these speak in.
   Each category has a couple of options so pickByDay can rotate. */
const ENCOURAGEMENT = {
  warm: {
    done: (n) => [
      `That's ${n} done already. Proof you're moving.`,
      `${n} finished. Momentum doesn't have to be loud to count.`,
      `Nice work. That's ${n} off your plate. Rest is allowed too.`,
    ],
    streak: (s) => [
      `You've shown up ${s} days in a row. Gently does it.`,
      `${s} days of showing up. That's the whole game.`,
    ],
    clear: () => [
      "A clear list is a fine place to be. Add one thing when you're ready.",
      "Nothing pressing right now. That's okay to enjoy.",
    ],
    nudge: () => [
      "Small steps still count. Pick one thing and momentum follows.",
      "You don't have to do it all. Just the next small piece.",
      "Be kind to today's version of you. One step is enough.",
    ],
  },
  plain: {
    done: (n) => [
      `${n} task${n === 1 ? "" : "s"} done so far today.`,
      `You've completed ${n}. Keep going at your own pace.`,
    ],
    streak: (s) => [
      `Current streak: ${s} days.`,
      `${s} days in a row. Streaks pause, they don't reset.`,
    ],
    clear: () => [
      "Your list is clear. Add a task whenever you're ready.",
      "Nothing scheduled right now.",
    ],
    nudge: () => [
      "Pick one task to start with.",
      "One small step is enough to begin.",
    ],
  },
  cheerful: {
    done: (n) => [
      `Woohoo! ${n} done already! You're on a roll! 🎉`,
      `${n} knocked out! Look at you go! ✨`,
    ],
    streak: (s) => [
      `${s} days strong. You're unstoppable! 🔥`,
      `${s}-day streak! That's seriously awesome.`,
    ],
    clear: () => [
      "All clear! Enjoy the breathing room! 🌿",
      "Clean slate! A perfect moment to relax or dream up something new.",
    ],
    nudge: () => [
      "Let's pick one fun little thing to kick things off! 💪",
      "One tiny step and you're moving. You've got this!",
    ],
  },
};

/* A short encouraging line for the dashboard, in the chosen tone. */
export function encouragingMessage({ doneCount = 0, activeCount = 0, streak = 0, tone = "warm" } = {}) {
  // TODO(ai): replace with a real model call that takes recent activity + tone
  // and returns one sentence. Keep it returning a string (or Promise<string>).
  const voice = ENCOURAGEMENT[tone] || ENCOURAGEMENT.warm;
  if (doneCount > 0) return pickByDay(voice.done(doneCount));
  if (streak > 1) return pickByDay(voice.streak(streak));
  if (activeCount === 0) return pickByDay(voice.clear());
  return pickByDay(voice.nudge());
}

/* A one-line summary of where things stand. */
export function summarizeProgress({ goals = [], tasks = [] } = {}) {
  // TODO(ai): swap for a real summarization call over goals/tasks/habits.
  const active = tasks.filter((t) => !t.done).length;
  const done = tasks.filter((t) => t.done).length;
  const goalCount = goals.filter((g) => g.status !== "archived").length;
  if (tasks.length === 0) {
    return `You have ${goalCount} goal${goalCount === 1 ? "" : "s"} in view and a clean task list.`;
  }
  return `${done} done, ${active} to go across ${goalCount} goal${goalCount === 1 ? "" : "s"}.`;
}

/* A gentle welcome-back note shown when the app hasn't been opened in a while. */
export function reentryMessage(daysAway = 0) {
  // TODO(ai): could personalise based on what was left in progress.
  if (daysAway >= 14) {
    return "It's been a little while, and that's completely fine. Nothing's broken, your streaks are paused, not lost. Want to pick one small thing?";
  }
  if (daysAway >= 7) {
    return "Welcome back. A week away is no problem at all. Your habits paused, they didn't reset. Ease in with one tiny step.";
  }
  return "Welcome back. You didn't lose any progress while you were away. Pick up wherever feels easy.";
}

/* A gentle reflection prompt. Rotates daily; salt lets callers vary it. */
export function reflectionPrompt(salt = 0) {
  // TODO(ai): swap for a model that proposes a prompt tuned to recent activity.
  return pickByDay(
    [
      "What's one small thing that went okay today?",
      "What felt heavier than it needed to? Could it be lighter tomorrow?",
      "What are you quietly proud of right now?",
      "If today was a 2/10 day, what would still make it count?",
      "What's one kind thing you could do for tomorrow-you?",
      "What drained your energy, and what gave a little back?",
      "What would 'enough' look like for the rest of today?",
    ],
    salt
  );
}

export default { encouragingMessage, summarizeProgress, reentryMessage, reflectionPrompt };
