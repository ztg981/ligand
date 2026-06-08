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

/* A short encouraging line for the dashboard. */
export function encouragingMessage({ doneCount = 0, activeCount = 0, streak = 0 } = {}) {
  // TODO(ai): replace with a real model call that takes recent activity
  // and returns one warm sentence. Keep it returning a string (or a
  // Promise<string>) so the Home widget doesn't change.
  if (doneCount > 0) {
    return pickByDay([
      `That's ${doneCount} done already — proof you're moving.`,
      `${doneCount} finished. Momentum doesn't have to be loud to count.`,
      `Nice — ${doneCount} off your plate. Rest is allowed too.`,
    ]);
  }
  if (streak > 1) {
    return pickByDay([
      `You've shown up ${streak} days in a row. Gently does it.`,
      `${streak} days of showing up. That's the whole game.`,
    ]);
  }
  if (activeCount === 0) {
    return pickByDay([
      "A clear list is a fine place to be. Add one thing when you're ready.",
      "Nothing pressing right now — that's okay to enjoy.",
    ]);
  }
  return pickByDay([
    "Small steps still count. Pick one thing — momentum follows.",
    "You don't have to do it all. Just the next small piece.",
    "Start tiny. Finishing one little thing is a real win.",
    "Be kind to today's version of you. One step is enough.",
  ]);
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
    return "It's been a little while — and that's completely fine. Nothing's broken, your streaks are paused, not lost. Want to pick one small thing?";
  }
  if (daysAway >= 7) {
    return "Welcome back. A week away is no problem at all — your habits paused, they didn't reset. Ease in with one tiny step.";
  }
  return "Welcome back. You didn't lose any progress while you were away — pick up wherever feels easy.";
}

export default { encouragingMessage, summarizeProgress, reentryMessage };
