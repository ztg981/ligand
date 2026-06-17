import { daysSince, todayKey } from "./model.js";

/* ============================================================
   Recovery tracker helpers — pure data + math, no React.

   A recovery goal counts real elapsed days free from something the
   user named. Milestones are recognized recovery markers. The tone
   everywhere is compassionate and forward-facing: setbacks are part
   of recovery, never failure.
   ============================================================ */

export const RECOVERY_MILESTONES = [
  { days: 1, label: "1 day" },
  { days: 3, label: "3 days" },
  { days: 7, label: "1 week" },
  { days: 14, label: "2 weeks" },
  { days: 30, label: "1 month" },
  { days: 90, label: "3 months" },
  { days: 180, label: "6 months" },
  { days: 365, label: "1 year" },
  { days: 547, label: "18 months" },
  { days: 730, label: "2 years" },
  { days: 1825, label: "5 years" },
];

// Real elapsed days since the streak start (never assumes the app was opened).
export function recoveryDays(startDate, refKey = todayKey()) {
  if (!startDate) return 0;
  return daysSince(startDate, refKey);
}

// The next milestone the user is working toward in the CURRENT streak.
export function nextMilestone(days) {
  return RECOVERY_MILESTONES.find((m) => days < m.days) || null;
}

// Milestones the current streak has reached but that haven't been recorded yet
// (used to fire a one-time celebration). `reachedDays` persists across resets.
export function newlyReachedMilestones(days, reachedDays = []) {
  const have = new Set(reachedDays);
  return RECOVERY_MILESTONES.filter((m) => days >= m.days && !have.has(m.days));
}

// A gentle line that grows with the journey.
export function encouragingLine(days) {
  if (days <= 0) return "Today is day one, and day one matters.";
  if (days < 3) return "The first days are the hardest. You're here.";
  if (days < 7) return "You're finding your footing. Be gentle with yourself.";
  if (days < 14) return "A week of choosing yourself. That's real.";
  if (days < 30) return "You're building something steady, day by day.";
  if (days < 90) return "A month-plus of momentum. This is becoming who you are.";
  if (days < 180) return "Look how far you've carried yourself.";
  if (days < 365) return "Months of freedom. You've changed your story.";
  return "This is a long, brave road — and you're walking it.";
}

// Recovery-specific reflection prompts (the journal falls back to these first).
export const RECOVERY_PROMPTS = [
  "What's one thing that helped you today?",
  "What would you tell yourself from a week ago?",
  "What does a free day feel like compared to before?",
  "Who or what is helping you stay on this path?",
];

// Rotating compassionate fallbacks when the AI insight is unavailable.
export const RECOVERY_FALLBACKS = [
  "Every day you choose this is a day that belongs to you.",
  "The streak you're building is proof of something real.",
  "You're doing something hard. That matters.",
];

export function recoveryFallback(seed = Date.now()) {
  return RECOVERY_FALLBACKS[Math.abs(seed) % RECOVERY_FALLBACKS.length];
}
